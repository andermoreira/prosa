'use strict';

/**
 * cursor.cjs — adaptador alternativo do agente Cursor (`agent -p`), espelho do opencode.cjs.
 *
 * Reusa `structuredPrompt` do OpenCode e roda sob o mesmo sandbox coercitivo externo. O Cursor não
 * recebe uma config própria de permissões, então restrições sem seam de SO continuam declaradas no
 * prompt. Fala stream-json (NDJSON), extrai o resultado final e lê o veredito de retry do provider.
 * O roteamento entre os dois é automático por `resource.executable` (`opencode` vs `agent`).
 */

const path = require('node:path');
const fs = require('node:fs');
const { createSandboxRunner } = require('./sandbox.cjs');
const { sanitize } = require('./sanitize.cjs');
const { structuredPrompt } = require('./opencode.cjs');

const DIAGNOSTIC_MAX_BYTES = 4 * 1024;
const ROLES = new Set(['executor', 'reviewer', 'diagnostician']);

function adapterError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function assertString(value, name) {
  if (typeof value !== 'string' || value.trim() === '' || value.includes('\0')) {
    throw adapterError('CURSOR_INPUT_INVALID', `${name} must be a non-empty string without NUL bytes`);
  }
  return value;
}

// The Cursor agent runs in print mode (-p) for non-interactive automation.
// The model travels in argv (--model); the workspace is the process cwd.
// Auth via CURSOR_API_KEY environment variable or --api-key flag.
function cursorArgs(resource, worktree) {
  return [
    '-f',
    '-p',
    '--output-format', 'stream-json',
    '--stream-partial-output',
    '--sandbox', 'disabled',
    '--model', resource.model,
  ];
}

// Cursor's agent binary uses stream-json (NDJSON). Each line is a typed event.
function parseEvents(stdout) {
  const lines = stdout.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) throw adapterError('CURSOR_OUTPUT_INVALID', 'Cursor produced no JSON events');
  const events = lines.map((line, index) => {
    let event;
    try { event = JSON.parse(line); }
    catch { throw adapterError('CURSOR_OUTPUT_INVALID', `Cursor event ${index + 1} is not valid JSON`); }
    if (!event || typeof event !== 'object' || Array.isArray(event) || typeof event.type !== 'string') {
      throw adapterError('CURSOR_OUTPUT_INVALID', `Cursor event ${index + 1} has no structural type`);
    }
    return event;
  });
  const failure = events.find((event) => event.type === 'error' || event.error);
  if (failure) {
    throw adapterError('CURSOR_EVENT_ERROR', 'Cursor emitted a structured error event', {
      event: failure, providerError: providerErrorSignal(failure),
    });
  }
  const finish = [...events].reverse().find((event) => event.type === 'result' && event.subtype === 'success');
  // The result event is authoritative. Assistant events contain both streamed
  // deltas and a buffered flush when --stream-partial-output is enabled.
  const assistantText = events
    .filter((event) => event.type === 'assistant' && event.message?.role === 'assistant' && Array.isArray(event.message?.content))
    .flatMap((event) => event.message.content)
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('');
  const text = typeof finish?.result === 'string' && finish.result !== '' ? finish.result : assistantText;
  if (text === '') throw adapterError('CURSOR_OUTPUT_INVALID', 'Cursor emitted no assistant text response');

  const usage = finish?.usage;
  const inputTokens = usage?.inputTokens ?? usage?.input_tokens;
  const outputTokens = usage?.outputTokens ?? usage?.output_tokens;
  const tokenCount = Number.isInteger(inputTokens) && inputTokens >= 0
    && Number.isInteger(outputTokens) && outputTokens >= 0
    ? inputTokens + outputTokens
    : null;
  const cost = typeof finish?.cost === 'number' && Number.isFinite(finish.cost) && finish.cost >= 0
    ? finish.cost
    : null;
  return { events, text, metrics: { estimatedCost: cost, tokens: tokenCount } };
}

function assertResource(resource, role) {
  const executable = resource?.executable;
  const executableName = path.basename(executable || '');
  const validExecutable = executable === 'agent'
    || (path.isAbsolute(executable || '') && (executableName === 'agent' || executableName === 'cursor-agent'));
  if (!resource || resource.type !== 'agent' || resource.role !== role || !validExecutable) {
    throw adapterError('CURSOR_RESOURCE_INVALID', 'Resource must be the catalogued Cursor agent for the requested role');
  }
  if (!Array.isArray(resource.args) || resource.args.length !== 0) {
    throw adapterError('CURSOR_RESOURCE_INVALID', 'Cursor resource must catalogue no subcommand args (all in adapter)');
  }
  if (typeof resource.model !== 'string' || resource.model.trim() === '') {
    throw adapterError('CURSOR_MODEL_REQUIRED', `${role} resource must catalogue an explicit model`);
  }
  if (role !== 'executor' && resource.readOnly !== true) {
    throw adapterError('CURSOR_RESOURCE_INVALID', `${role} resource must be read-only`);
  }
}

function assertSandboxPolicy(policy, resource, role) {
  if (!policy || policy.role !== role || policy.resourceId !== resource.id || !/^[0-9a-f]{64}$/.test(policy.policyHash || '')) {
    throw adapterError('CURSOR_SANDBOX_POLICY_REQUIRED', 'Cursor requires the persisted sandbox policy for this resource and role');
  }
}

function createCursorAdapter(options = {}) {
  const processRunner = options.runSandboxedProcess || createSandboxRunner();
  const artifacts = options.artifacts;
  if (!artifacts || typeof artifacts.preserveAgentResponse !== 'function' || typeof artifacts.findAgentResponse !== 'function') {
    throw adapterError('CURSOR_ARTIFACT_SEAM_REQUIRED', 'Artifact preservation and reconciliation seams are required');
  }

  async function invoke(input) {
    if (!ROLES.has(input.role)) throw adapterError('CURSOR_ROLE_INVALID', `Unsupported Cursor role: ${input.role}`);
    assertResource(input.resource, input.role);
    assertSandboxPolicy(input.sandboxPolicy, input.resource, input.role);
    const worktree = path.resolve(assertString(input.worktree, 'worktree'));
    const envAllowlist = [...new Set([...(input.resource.envAllowlist || []), 'CURSOR_API_KEY'])];
    const common = {
      executable: input.resource.executable, policy: input.sandboxPolicy,
      timeoutMs: input.resource.timeoutMs,
      maxOutputBytes: input.resource.maxOutputBytes,
    };
    const versionResult = await processRunner({ ...common, args: ['--version'], env: {}, envAllowlist });
    if (!versionResult.ok) throw adapterError('CURSOR_COMMAND_UNAVAILABLE', 'Cursor command/version check failed', { process: processMetadata(versionResult) });

    const prompt = structuredPrompt(input);
    const args = cursorArgs(input.resource, worktree);
    const environment = Object.fromEntries(envAllowlist.filter((name) => Object.hasOwn(process.env, name)).map((name) => [name, process.env[name]]));
    environment.AGENT_CLI_CREDENTIAL_STORE = 'file';
    environment.CURSOR_CONFIG_DIR = '.workflow-sandbox/cursor-config';
    environment.CURSOR_DATA_DIR = '.workflow-sandbox/cursor-data';
    environment.NODE_USE_ENV_PROXY = '1';
    const gitDirectory = fs.existsSync('/opt/homebrew/bin/git') ? path.dirname(fs.realpathSync('/opt/homebrew/bin/git')) : '/usr/bin';
    environment.PATH = [...new Set([
      path.isAbsolute(input.resource.executable) ? path.dirname(input.resource.executable) : null,
      gitDirectory, '/usr/bin', '/bin',
    ].filter(Boolean))].join(path.delimiter);
    const result = await processRunner({ ...common, args, env: environment, envAllowlist, input: prompt });
    if (!result.ok) {
      const code = result.timedOut ? 'TIMEOUT' : result.outputLimitExceeded ? 'CURSOR_OUTPUT_LIMIT' : 'CURSOR_PROCESS_FAILED';
      throw adapterError(code, `Cursor process did not complete successfully: ${result.status}`, {
        process: processMetadata(result),
        ...failureDiagnostics(result),
      });
    }
    const parsed = parseEvents(result.stdout.text);
    const artifactRef = await artifacts.preserveAgentResponse({
      operationId: input.operationId,
      role: input.role,
      mediaType: 'application/x-ndjson',
      events: parsed.events,
      response: parsed.text,
      process: processMetadata(result),
      sandboxPolicyHash: input.sandboxPolicy.policyHash,
    });
    if (!artifactRef || typeof artifactRef.id !== 'string') {
      throw adapterError('CURSOR_ARTIFACT_INVALID', 'Artifact seam did not return an artifact reference');
    }
    return { ok: true, operationId: input.operationId, artifactRef, metrics: parsed.metrics, process: processMetadata(result) };
  }

  return {
    invoke,
    reconcile: (operationId, sandboxPolicyHash, attemptId) => artifacts.findAgentResponse(assertString(operationId, 'operationId'), sandboxPolicyHash, attemptId),
  };
}

function diagnosticExcerpt(text) {
  if (typeof text !== 'string' || text.trim() === '') return null;
  return sanitize(text, { maxBytes: DIAGNOSTIC_MAX_BYTES }).content;
}

function structuredErrorEvent(stdout) {
  for (const line of String(stdout ?? '').split(/\r?\n/)) {
    if (line.trim() === '') continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (!event || typeof event !== 'object' || Array.isArray(event)) continue;
    if (event.type !== 'error' && !event.error) continue;
    const clean = sanitize(event, { maxBytes: DIAGNOSTIC_MAX_BYTES });
    if (clean.truncated) return { truncated: true };
    return JSON.parse(clean.content);
  }
  return null;
}

function providerErrorSignal(event) {
  const error = event?.error;
  if (!error || typeof error !== 'object' || typeof error.name !== 'string') return undefined;
  const data = error.data && typeof error.data === 'object' ? error.data : {};
  const signal = { name: error.name };
  if (Number.isInteger(data.statusCode)) signal.statusCode = data.statusCode;
  if (typeof data.isRetryable === 'boolean') signal.isRetryable = data.isRetryable;
  return signal;
}

function failureDiagnostics(result) {
  const details = {};
  const event = structuredErrorEvent(result.stdout?.text);
  if (event) {
    details.event = event;
    const providerError = providerErrorSignal(event);
    if (providerError) details.providerError = providerError;
  } else {
    const stdout = diagnosticExcerpt(result.stdout?.text);
    if (stdout) details.stdout = stdout;
  }
  const stderr = diagnosticExcerpt(result.stderr?.text);
  if (stderr) details.stderr = stderr;
  return details;
}

function processMetadata(result) {
  return {
    status: result.status,
    exitCode: result.exitCode,
    signal: result.signal,
    timedOut: result.timedOut,
    outputLimitExceeded: result.outputLimitExceeded,
    durationMs: result.durationMs,
    stdoutBytes: result.stdout.bytes,
    stderrBytes: result.stderr.bytes,
  };
}

module.exports = {
  createCursorAdapter,
  parseEvents,
  structuredPrompt,
};
