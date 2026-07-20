'use strict';

/**
 * mcp.cjs — gate MCP: valida um step contra conhecimento externo (docs de biblioteca, web
 * search, GitHub code search) consultando um servidor MCP catalogado e read-only.
 *
 * Diferente dos gates executáveis (script + argv), um gate MCP fala JSON-RPC 2.0 por stdio com
 * o servidor: handshake `initialize` → `tools/list` (confirma que a tool declarada existe) →
 * `tools/call`. O resultado sanitizado vira evidência auditável no snapshot do reviewer.
 * Fail-closed: servidor indisponível, tool ausente ou chave de API faltando derrubam o gate e
 * bloqueiam o step. Ver docs/workflows/prosa-development.md § Gates MCP e specs/mcp-gates.md.
 */

const { runProcess } = require('./process.cjs');
const { sanitize } = require('./sanitize.cjs');

function mcpError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function jsonRpcRequest(id, method, params) {
  return JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
}

function parseResponse(text, expectedId) {
  const trimmed = String(text ?? '').trim();
  if (trimmed === '') throw mcpError('MCP_RESPONSE_INVALID', 'MCP server returned empty response');
  let response;
  try { response = JSON.parse(trimmed); }
  catch { throw mcpError('MCP_RESPONSE_INVALID', 'MCP server returned non-JSON response'); }
  if (!response || typeof response !== 'object') {
    throw mcpError('MCP_RESPONSE_INVALID', 'MCP response is not an object');
  }
  if (response.id !== expectedId) {
    throw mcpError('MCP_RESPONSE_INVALID', `MCP response id ${response.id} does not match request ${expectedId}`);
  }
  if (response.error) {
    throw mcpError('MCP_TOOL_ERROR', `MCP server error: ${response.error.message || JSON.stringify(response.error)}`, { mcpError: response.error });
  }
  return response.result;
}

function validateArgs(args) {
  if (args === undefined || args === null) return {};
  if (typeof args !== 'object' || Array.isArray(args)) {
    throw mcpError('MCP_ARGS_INVALID', 'MCP tool args must be an object');
  }
  for (const [key, value] of Object.entries(args)) {
    if (typeof key === 'string' && key.includes('\0')) throw mcpError('MCP_ARGS_INVALID', 'MCP tool args must not contain NUL bytes');
    if (typeof value === 'string' && value.includes('\0')) throw mcpError('MCP_ARGS_INVALID', 'MCP tool args must not contain NUL bytes');
  }
  return args;
}

async function runMcpGate(input) {
  const server = input.server;
  if (!server || server.type !== 'mcp-server') {
    throw mcpError('MCP_RESOURCE_INVALID', 'MCP gate requires a catalogued mcp-server resource');
  }
  if (server.readOnly !== true) {
    throw mcpError('MCP_RESOURCE_NOT_READONLY', 'MCP server must be read-only');
  }

  const tool = input.tool;
  if (typeof tool !== 'string' || tool.trim() === '' || tool.includes('\0')) {
    throw mcpError('MCP_TOOL_INVALID', 'MCP tool name must be a non-empty safe string');
  }

  const args = validateArgs(input.args);

  const worktree = typeof input.worktree === 'string' ? input.worktree : process.cwd();
  // HOME/PATH/TMPDIR são sempre necessários para o servidor stdio (ex.: `npx` resolve o pacote e
  // escreve cache). Segredos (BRAVE_API_KEY, GITHUB_TOKEN) entram só via envAllowlist do catálogo.
  const envAllowlist = [...new Set([...(server.envAllowlist || []), 'HOME', 'PATH', 'TMPDIR'])];
  const timeoutMs = input.timeoutMs || server.timeoutMs || 30000;
  const maxOutputBytes = input.maxOutputBytes || server.maxOutputBytes || 262144;

  // `runProcess` é one-shot: escreve todo o stdin, fecha (o servidor vê EOF e encerra) e coleta o
  // stdout inteiro. Não há conexão persistente entre as fases, então cada fase respawna o servidor
  // e reenvia o histórico de requests (init [+ list [+ call]]) para reconstruir a sessão do zero.

  // Phase 1: initialize
  const initRequest = jsonRpcRequest(1, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: { tools: {} },
    clientInfo: { name: 'ia-prosa', version: '1.0.0' },
  });
  const initResult = await runProcess({
    executable: server.executable,
    args: server.args,
    root: worktree,
    cwd: '.',
    envAllowlist,
    timeoutMs,
    maxOutputBytes,
    input: initRequest,
  });
  if (!initResult.ok) {
    const code = initResult.timedOut ? 'MCP_TIMEOUT' : 'MCP_SERVER_UNAVAILABLE';
    throw mcpError(code, `MCP initialize failed: ${initResult.status}`, { process: processMeta(initResult) });
  }
  parseResponse(initResult.stdout.text, 1);

  // Phase 2: tools/list
  const listRequest = jsonRpcRequest(2, 'tools/list', {});
  const listResult = await runProcess({
    executable: server.executable,
    args: server.args,
    root: worktree,
    cwd: '.',
    envAllowlist,
    timeoutMs,
    maxOutputBytes,
    input: initRequest + listRequest,
  });
  if (!listResult.ok) {
    const code = listResult.timedOut ? 'MCP_TIMEOUT' : 'MCP_SERVER_UNAVAILABLE';
    throw mcpError(code, `MCP tools/list failed: ${listResult.status}`, { process: processMeta(listResult) });
  }
  // The server returns both responses — skip the init response, parse the list response
  const lines = (listResult.stdout.text ?? '').split(/\r?\n/).filter((line) => line.trim() !== '');
  let tools = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.id === 2 && !parsed.error) {
        tools = parsed.result?.tools || [];
        break;
      }
    } catch { /* skip unparseable lines */ }
  }
  if (tools.length === 0) throw mcpError('MCP_TOOLS_LIST_EMPTY', 'MCP server returned no tools');

  const found = tools.find((t) => t.name === tool);
  if (!found) {
    throw mcpError('MCP_TOOL_NOT_FOUND', `Tool '${tool}' not found in server's tools/list`, {
      available: tools.map((t) => t.name),
    });
  }

  // Phase 3: tools/call
  const callRequest = jsonRpcRequest(3, 'tools/call', { name: tool, arguments: args });
  const fullInput = initRequest + listRequest + callRequest;
  const callResult = await runProcess({
    executable: server.executable,
    args: server.args,
    root: worktree,
    cwd: '.',
    envAllowlist,
    timeoutMs,
    maxOutputBytes,
    input: fullInput,
  });
  if (!callResult.ok) {
    const code = callResult.timedOut ? 'MCP_TIMEOUT' : callResult.outputLimitExceeded ? 'MCP_OUTPUT_LIMIT' : 'MCP_SERVER_UNAVAILABLE';
    throw mcpError(code, `MCP tools/call failed: ${callResult.status}`, { process: processMeta(callResult) });
  }

  let content = null;
  const allLines = (callResult.stdout.text ?? '').split(/\r?\n/).filter((line) => line.trim() !== '');
  for (const line of allLines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed.id === 3 && !parsed.error) {
        content = parsed.result;
        break;
      }
    } catch { /* skip unparseable lines */ }
  }
  if (!content) throw mcpError('MCP_RESPONSE_INVALID', 'MCP tools/call did not return a valid result');

  const sanitized = sanitize(content, { maxBytes: maxOutputBytes });
  return {
    ok: true,
    passed: true,
    server: server.id,
    tool,
    args,
    content: sanitized.truncated ? { truncated: true } : JSON.parse(sanitized.content),
    process: processMeta(callResult),
  };
}

function processMeta(result) {
  return {
    status: result.status,
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut: result.timedOut,
    outputLimitExceeded: result.outputLimitExceeded,
    durationMs: result.durationMs,
    stdoutBytes: result.stdout?.bytes || 0,
    stderrBytes: result.stderr?.bytes || 0,
  };
}

module.exports = { runMcpGate };
