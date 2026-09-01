'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { runMcpGate } = require('./lib/mcp.cjs');

const CONTEXT7_SERVER = {
  id: 'context7',
  type: 'mcp-server',
  executable: 'npx',
  args: ['-y', '@upstash/context7-mcp'],
  capabilities: ['mcp:tools'],
  envAllowlist: ['HOME', 'PATH', 'TMPDIR'],
  readOnly: true,
  timeoutMs: 30000,
  maxOutputBytes: 262144,
};

const NOT_READONLY_SERVER = { ...CONTEXT7_SERVER, readOnly: false };
const NOT_MCP_SERVER = { ...CONTEXT7_SERVER, type: 'agent' };

test('handshake and tools/list with real MCP server', async () => {
  const result = await runMcpGate({
    server: CONTEXT7_SERVER,
    tool: 'resolve-library-id',
    args: { libraryName: 'react' },
  });
  assert.equal(result.ok, true);
  assert.equal(result.passed, true);
  assert.equal(result.server, 'context7');
  assert.equal(result.tool, 'resolve-library-id');
  assert.ok(result.content);
  assert.equal(result.process.exitCode, 0);
});

test('tools/call returns structured content for valid library', async () => {
  const result = await runMcpGate({
    server: CONTEXT7_SERVER,
    tool: 'resolve-library-id',
    args: { libraryName: 'react-router' },
  });
  assert.equal(result.ok, true);
  assert.ok(result.content);
  assert.equal(typeof result.process.durationMs, 'number');
  assert.ok(result.process.durationMs > 0);
});

test('rejects non-mcp-server resource type', async () => {
  await assert.rejects(
    () => runMcpGate({ server: NOT_MCP_SERVER, tool: 'any', args: {} }),
    { code: 'MCP_RESOURCE_INVALID' },
  );
});

test('rejects non-readonly MCP server', async () => {
  await assert.rejects(
    () => runMcpGate({ server: NOT_READONLY_SERVER, tool: 'any', args: {} }),
    { code: 'MCP_RESOURCE_NOT_READONLY' },
  );
});

test('rejects tool not found in server capabilities', async () => {
  await assert.rejects(
    () => runMcpGate({
      server: CONTEXT7_SERVER,
      tool: 'non-existent-tool-xyz',
      args: {},
    }),
    { code: 'MCP_TOOL_NOT_FOUND' },
  );
});

test('rejects empty tool name', async () => {
  await assert.rejects(
    () => runMcpGate({ server: CONTEXT7_SERVER, tool: '', args: {} }),
    { code: 'MCP_TOOL_INVALID' },
  );
  await assert.rejects(
    () => runMcpGate({ server: CONTEXT7_SERVER, tool: '  ', args: {} }),
    { code: 'MCP_TOOL_INVALID' },
  );
});

test('rejects args with NUL bytes', async () => {
  await assert.rejects(
    () => runMcpGate({ server: CONTEXT7_SERVER, tool: 'any', args: { bad: 'x\0y' } }),
    { code: 'MCP_ARGS_INVALID' },
  );
});

test('rejects non-object args', async () => {
  await assert.rejects(
    () => runMcpGate({ server: CONTEXT7_SERVER, tool: 'any', args: 'string' }),
    { code: 'MCP_ARGS_INVALID' },
  );
  await assert.rejects(
    () => runMcpGate({ server: CONTEXT7_SERVER, tool: 'any', args: ['array'] }),
    { code: 'MCP_ARGS_INVALID' },
  );
});

test('fails with unavailable server', async () => {
  await assert.rejects(
    () => runMcpGate({
      server: { ...CONTEXT7_SERVER, executable: 'non-existent-binary-xyz' },
      tool: 'any',
      args: {},
    }),
    { code: 'MCP_SERVER_UNAVAILABLE' },
  );
});

// Hermético: um servidor stdio conforme emitido por `node -e`, que fala NDJSON, envia uma
// notificação JSON-RPC antes da resposta de initialize e responde erro para a tool `explode`.
const FAKE_SERVER_SCRIPT = [
  "const readline = require('node:readline');",
  'const rl = readline.createInterface({ input: process.stdin });',
  "rl.on('line', (line) => {",
  '  const request = JSON.parse(line);',
  "  if (request.method === 'initialize') {",
  "    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/message', params: { level: 'info', data: 'boot' } }) + '\\n');",
  "    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'fake-mcp', version: '0.0.0' } } }) + '\\n');",
  "  } else if (request.method === 'tools/list') {",
  "    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { tools: [{ name: 'echo', description: 'Echoes its input', inputSchema: { type: 'object' } }, { name: 'explode', description: 'Always fails', inputSchema: { type: 'object' } }] } }) + '\\n');",
  "  } else if (request.method === 'tools/call') {",
  "    if (request.params.name === 'explode') {",
  "      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 3, error: { code: -32000, message: 'tool exploded' } }) + '\\n');",
  '    } else {',
  "      process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: 3, result: { content: [{ type: 'text', text: 'echo' }] } }) + '\\n');",
  '    }',
  '  }',
  '});',
].join('\n');

const FAKE_SERVER = {
  id: 'fake-mcp',
  type: 'mcp-server',
  executable: process.execPath,
  args: ['-e', FAKE_SERVER_SCRIPT],
  capabilities: ['mcp:tools'],
  envAllowlist: ['HOME', 'PATH', 'TMPDIR'],
  readOnly: true,
  timeoutMs: 30000,
  maxOutputBytes: 262144,
};

test('completes the handshake when a conforming server emits notifications', async () => {
  const result = await runMcpGate({ server: FAKE_SERVER, tool: 'echo', args: { value: 'ok' } });
  assert.equal(result.ok, true);
  assert.equal(result.passed, true);
  assert.equal(result.server, 'fake-mcp');
  assert.equal(result.tool, 'echo');
  assert.equal(result.content.content[0].text, 'echo');
});

test('surfaces a JSON-RPC error from tools/call as MCP_TOOL_ERROR', async () => {
  await assert.rejects(
    () => runMcpGate({ server: FAKE_SERVER, tool: 'explode', args: {} }),
    (error) => error.code === 'MCP_TOOL_ERROR' && /tool exploded/.test(error.message),
  );
});
