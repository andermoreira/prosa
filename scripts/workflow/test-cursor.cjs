'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createCursorAdapter, parseEvents } = require('./lib/cursor.cjs');

function processResult(overrides = {}) {
  return {
    ok: true, status: 'succeeded', exitCode: 0, signal: null, timedOut: false,
    outputLimitExceeded: false, durationMs: 5,
    stdout: { text: '', bytes: 0, truncated: false },
    stderr: { text: '', bytes: 0, truncated: false }, error: null,
    ...overrides,
  };
}

function resource(role = 'executor') {
  return {
    id: role === 'executor' ? 'cursor-cli' : `cursor-cli-${role}`,
    type: 'agent', model: 'cursor-grok-4.5-medium', role, executable: 'agent', args: [],
    capabilities: role === 'executor' ? ['filesystem:read', 'filesystem:write'] : ['filesystem:read'],
    envAllowlist: ['CURSOR_API_KEY', 'PATH'], cwd: 'worktree-root', timeoutMs: 1000,
    maxOutputBytes: 10000, readOnly: role !== 'executor',
  };
}

function invocation(role = 'executor') {
  const selected = resource(role);
  return {
    operationId: `operation-${role}-1`, role, attempt: 1, resource: selected,
    sandboxPolicy: { role, resourceId: selected.id, policyHash: 'b'.repeat(64) },
    worktree: process.cwd(), goal: 'Execute the step', inScope: ['adapter'], outOfScope: ['commit'],
    predictedFiles: role === 'executor' ? ['src/file.js'] : [], allowedAreas: ['src'],
    acceptanceCriteria: ['AC-01'], context: {},
  };
}

function stream(text = 'completed') {
  return [
    JSON.stringify({ type: 'assistant', timestamp_ms: 1, message: { role: 'assistant', content: [{ type: 'text', text }] } }),
    JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } }),
    JSON.stringify({ type: 'result', subtype: 'success', result: text, usage: { inputTokens: 10, outputTokens: 4 }, cost: 0.1 }),
  ].join('\n');
}

function artifacts() {
  return {
    async preserveAgentResponse(input) { return { id: `artifact-${input.operationId}`, hash: 'c'.repeat(64) }; },
    async findAgentResponse() { return null; },
  };
}

test('Cursor version check and agent call use the sandboxed process seam', async () => {
  const calls = [];
  const adapter = createCursorAdapter({
    artifacts: artifacts(),
    runSandboxedProcess: async (input) => {
      calls.push(input);
      return input.args[0] === '--version'
        ? processResult({ stdout: { text: '2026.07.18', bytes: 10, truncated: false } })
        : processResult({ stdout: { text: stream(), bytes: 200, truncated: false } });
    },
  });
  const input = invocation();
  input.resource = { ...input.resource, executable: '/opt/cursor-agent' };
  const result = await adapter.invoke(input);
  assert.equal(calls[0].executable, '/opt/cursor-agent');
  assert.deepEqual(calls[0].args, ['--version']);
  assert.deepEqual(calls[1].args, ['-f', '-p', '--output-format', 'stream-json', '--stream-partial-output', '--sandbox', 'disabled', '--model', 'cursor-grok-4.5-medium']);
  assert.equal(calls[1].policy.policyHash, 'b'.repeat(64));
  assert.equal(calls[1].env.CURSOR_API_KEY, process.env.CURSOR_API_KEY);
  assert.equal(calls[1].env.AGENT_CLI_CREDENTIAL_STORE, 'file');
  assert.equal(calls[1].env.CURSOR_DATA_DIR, '.workflow-sandbox/cursor-data');
  assert.equal(calls[1].env.NODE_USE_ENV_PROXY, '1');
  assert.deepEqual(result.metrics, { estimatedCost: 0.1, tokens: 14 });
});

test('Cursor requires a persisted role policy and keeps reviewer/diagnostician read-only resources', async () => {
  const adapter = createCursorAdapter({ artifacts: artifacts(), runSandboxedProcess: async () => processResult() });
  const missing = invocation();
  delete missing.sandboxPolicy;
  await assert.rejects(adapter.invoke(missing), { code: 'CURSOR_SANDBOX_POLICY_REQUIRED' });
  for (const role of ['reviewer', 'diagnostician']) {
    const invalid = invocation(role);
    invalid.resource = { ...invalid.resource, readOnly: false };
    await assert.rejects(adapter.invoke(invalid), { code: 'CURSOR_RESOURCE_INVALID' });
  }
  const invalidExecutable = invocation();
  invalidExecutable.resource = { ...invalidExecutable.resource, executable: '/tmp/not-agent' };
  await assert.rejects(adapter.invoke(invalidExecutable), { code: 'CURSOR_RESOURCE_INVALID' });
});

test('Cursor parses NDJSON and sanitizes process failures', async () => {
  assert.equal(parseEvents(stream('ok')).text, 'ok');
  let calls = 0;
  const adapter = createCursorAdapter({
    artifacts: artifacts(),
    runSandboxedProcess: async () => (++calls === 1
      ? processResult({ stdout: { text: 'version', bytes: 7, truncated: false } })
      : processResult({ ok: false, status: 'failed', exitCode: 1, stderr: { text: `token ghp_${'A'.repeat(24)}`, bytes: 34, truncated: false } })),
  });
  await assert.rejects(adapter.invoke(invocation()), (error) => {
    assert.equal(error.code, 'CURSOR_PROCESS_FAILED');
    assert.equal(error.details.stderr.includes('ghp_'), false);
    return true;
  });
});
