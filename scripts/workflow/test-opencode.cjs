'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createOpenCodeAdapter, parseEvents, permissionFor, restrictedEnvironment, structuredPrompt } = require('./lib/opencode.cjs');
const reviewSchema = require('../../schemas/review.schema.json');
const diagnosisSchema = require('../../schemas/diagnosis.schema.json');

const PROMPT_BASE = Object.freeze({
  operationId: 'op-1', attempt: 1, goal: 'g', inScope: ['a'], outOfScope: ['b'],
  predictedFiles: ['c'], allowedAreas: ['d'], acceptanceCriteria: ['e'], context: {},
});

test('the prompt carries the output contract of every role that is parsed against one', () => {
  // The reviewer and the diagnostician are rejected when their answer misses the schema, so the
  // schema has to reach them. It never did: the prompt was identical for all three roles, and the
  // first run to reach the reviewer died on UNTRUSTED_JSON_INVALID.
  for (const [role, schema] of [['reviewer', reviewSchema], ['diagnostician', diagnosisSchema]]) {
    const prompt = structuredPrompt({ ...PROMPT_BASE, role });
    assert.match(prompt, /one complete JSON document and nothing else/);
    // The schema itself travels, not a summary that could drift from the validator.
    for (const field of schema.required) {
      assert.ok(prompt.includes(field), `${role} prompt must carry the required field ${field}`);
    }
  }
  assert.match(structuredPrompt({ ...PROMPT_BASE, role: 'reviewer' }), /is derived from/);

  // Nothing parses the executor's response; demanding a schema from it rejected every real agent.
  assert.equal(structuredPrompt({ ...PROMPT_BASE, role: 'executor' }).includes('output-schema'), false);
});

function processResult(overrides = {}) {
  return {
    ok: true,
    status: 'succeeded',
    exitCode: 0,
    signal: null,
    timedOut: false,
    outputLimitExceeded: false,
    durationMs: 5,
    stdout: { text: '', bytes: 0, truncated: false },
    stderr: { text: '', bytes: 0, truncated: false },
    error: null,
    ...overrides,
  };
}

function resource(role = 'executor') {
  return {
    id: role === 'executor' ? 'opencode' : `opencode-${role}`,
    type: 'agent',
    role,
    executable: 'opencode',
    args: ['run'],
    model: 'opencode-go/grok-4.5',
    capabilities: role === 'executor' ? ['filesystem:read', 'filesystem:write'] : ['filesystem:read'],
    envAllowlist: ['HOME', 'NO_COLOR', 'PATH', 'TMPDIR'],
    cwd: 'worktree-root',
    timeoutMs: 1000,
    maxOutputBytes: 10000,
    readOnly: role !== 'executor',
  };
}

function invocation(overrides = {}) {
  const selectedResource = overrides.resource || resource(overrides.role || 'executor');
  const selectedRole = overrides.role || 'executor';
  return {
    operationId: 'operation-run-1-step-8-attempt-1',
    stepId: 'automated-spec-pipeline-step-8',
    role: 'executor',
    attempt: 1,
    resource: selectedResource,
    sandboxPolicy: { role: selectedRole, resourceId: selectedResource.id, policyHash: 'a'.repeat(64) },
    worktree: process.cwd(),
    goal: 'Implement only the approved step',
    inScope: ['OpenCode adapter'],
    outOfScope: ['review', 'acceptance', 'commit'],
    predictedFiles: ['scripts/workflow/lib/opencode.cjs'],
    allowedAreas: ['scripts/workflow/lib', 'scripts/workflow/test-opencode.cjs'],
    acceptanceCriteria: ['Agent call is bounded and revalidated'],
    context: { specPath: 'specs/automated-spec-pipeline.md', stepPath: 'specs/steps/automated-spec-pipeline-step-8.md' },
    ...overrides, resource: selectedResource,
  };
}

function jsonEvents(text = 'implemented') {
  return [
    JSON.stringify({ type: 'step_start', part: { type: 'step-start' } }),
    JSON.stringify({ type: 'text', part: { type: 'text', text } }),
    JSON.stringify({ type: 'step_finish', part: { type: 'step-finish', cost: 0.25, tokens: { input: 10, output: 5, reasoning: 2 } } }),
  ].join('\n');
}

function fakeArtifacts() {
  const preserved = [];
  const completed = new Map();
  return {
    preserved,
    completed,
    async preserveAgentResponse(value) {
      preserved.push(value);
      const result = { id: `artifact-${value.operationId}`, hash: 'a'.repeat(64) };
      completed.set(value.operationId, { artifactRef: result, metrics: { estimatedCost: 0.25, tokens: 17 } });
      return result;
    },
    async findAgentResponse(operationId) { return completed.get(operationId) || null; },
  };
}

test('generates deny-first permissions and allows executor edits only in allowed areas', () => {
  const permission = permissionFor('executor', ['src', 'test/**']);
  assert.deepEqual(Object.entries(permission.edit), [
    ['*', 'deny'],
    ['src', 'allow'],
    ['src/**', 'allow'],
    ['test/**', 'allow'],
  ]);
  for (const name of ['bash', 'task', 'webfetch', 'websearch', 'external_directory']) assert.equal(permission[name], 'deny');
  assert.equal(permission['*'], 'deny', 'unknown tools, including inherited MCP tools, must be denied');
  assert.deepEqual(permissionFor('reviewer', ['src']).edit, { '*': 'deny' });

  const environment = restrictedEnvironment('executor', ['src']);
  const config = JSON.parse(environment.OPENCODE_CONFIG_CONTENT);
  assert.equal(config.autoupdate, false);
  assert.equal(config.share, 'disabled');
  assert.deepEqual(config.plugin, []);
  assert.deepEqual(config.mcp, {});
  assert.deepEqual(JSON.parse(environment.OPENCODE_PERMISSION), config.permission);
  // The no-plugin intent belongs to config.plugin (asserted above). OPENCODE_DISABLE_DEFAULT_PLUGINS
  // must stay out: it breaks provider resolution and made every agent call fail.
  assert.equal(environment.OPENCODE_DISABLE_DEFAULT_PLUGINS, undefined);
  assert.equal(environment.OPENCODE_DISABLE_CLAUDE_CODE, 'true');
});

test('checks command/version and invokes a fresh pure OpenCode run through the process seam', async () => {
  const calls = [];
  const artifacts = fakeArtifacts();
  const adapter = createOpenCodeAdapter({
    artifacts,
    runSandboxedProcess: async (options) => {
      calls.push(options);
      if (options.args[0] === '--version') return processResult({ stdout: { text: '1.1.1\n', bytes: 6, truncated: false } });
      return processResult({ stdout: { text: jsonEvents(), bytes: 300, truncated: false } });
    },
  });
  const result = await adapter.invoke(invocation());

  assert.deepEqual(calls[0].args, ['--version']);
  assert.deepEqual(calls[1].args, ['run', '--format', 'json', '--dir', process.cwd(), '--agent', 'build', '--auto', '--pure',
    '--model', 'opencode-go/grok-4.5']);
  assert.equal(calls[1].args.includes('--continue'), false);
  assert.equal(calls[1].args.includes('--session'), false);
  assert.match(calls[1].input, /<workflow-contract>/);
  assert.match(calls[1].input, /Do not commit/);
  assert.match(calls[1].input, /Do not edit the spec/);
  assert.equal(calls[1].env.OPENCODE_DISABLE_DEFAULT_PLUGINS, undefined);
  assert.equal(calls[1].envAllowlist.includes('OPENCODE_DISABLE_DEFAULT_PLUGINS'), false);
  assert.equal(result.response, undefined);
  assert.equal(result.events, undefined);
  assert.equal(result.artifactRef.id, `artifact-${invocation().operationId}`);
  assert.equal(artifacts.preserved[0].response, 'implemented');
  assert.deepEqual(result.metrics, { estimatedCost: 0.25, tokens: 17 });
});

test('fails closed for unsupported versions, malformed output, timeout, and missing artifact seam', async () => {
  assert.throws(() => createOpenCodeAdapter({ artifacts: {} }), { code: 'OPENCODE_ARTIFACT_SEAM_REQUIRED' });
  const artifacts = fakeArtifacts();
  async function failure(second) {
    let call = 0;
    const adapter = createOpenCodeAdapter({
      artifacts,
      runSandboxedProcess: async () => (++call === 1
        ? processResult({ stdout: { text: '1.1.1', bytes: 5, truncated: false } })
        : second),
    });
    return adapter.invoke(invocation());
  }
  await assert.rejects(failure(processResult({ stdout: { text: 'plain success', bytes: 13, truncated: false } })), { code: 'OPENCODE_OUTPUT_INVALID' });
  await assert.rejects(failure(processResult({
    ok: false, status: 'timed_out', exitCode: null, timedOut: true,
    stdout: { text: '', bytes: 0, truncated: false },
  })), { code: 'TIMEOUT' });

  // A failed process must carry what it said, not just how it died: the code alone forces the
  // operator to reproduce the call by hand, which is what this audit had to do repeatedly.
  const token = `ghp_${'B'.repeat(24)}`;
  await assert.rejects(failure(processResult({
    ok: false, status: 'failed', exitCode: 1,
    stdout: { text: `boom near ${token}`, bytes: 30, truncated: false },
    stderr: { text: 'stack trace line', bytes: 16, truncated: false },
  })), (error) => {
    assert.equal(error.code, 'OPENCODE_PROCESS_FAILED');
    assert.match(error.details.stdout, /boom near/);
    assert.match(error.details.stderr, /stack trace line/);
    assert.equal(error.details.stdout.includes(token), false, 'diagnostics are sanitized before they travel');
    assert.equal(error.details.process.exitCode, 1);
    return true;
  });

  // An agent without a catalogued model would run against nothing: OPENCODE_CONFIG_CONTENT replaces
  // the machine config, model included. The first supervised runs hung for 22 minutes on exactly
  // this, emitting zero bytes, so it must fail closed instead.
  const noModel = createOpenCodeAdapter({ artifacts, runSandboxedProcess: async () => processResult() });
  const { model, ...withoutModel } = resource();
  await assert.rejects(noModel.invoke(invocation({ resource: withoutModel })), { code: 'OPENCODE_MODEL_REQUIRED' });

  const old = createOpenCodeAdapter({
    artifacts,
    runSandboxedProcess: async () => processResult({ stdout: { text: '1.0.9', bytes: 5, truncated: false } }),
  });
  await assert.rejects(old.invoke(invocation()), { code: 'OPENCODE_VERSION_UNSUPPORTED' });
  await assert.rejects(old.invoke(invocation({ resource: { ...resource(), executable: '/tmp/not-opencode' } })), { code: 'OPENCODE_RESOURCE_INVALID' });
});

test('a provider error event carries OpenCode own retry verdict, not a guess from its message', () => {
  // Shapes taken from the OpenCode SDK error types: ApiError declares a mandatory `isRetryable`
  // and an optional `statusCode`; ProviderAuthError and UnknownError carry neither.
  const apiError = {
    type: 'error', sessionID: 'ses_1',
    error: { name: 'APIError', data: { message: 'Too Many Requests', statusCode: 429, isRetryable: true } },
  };
  assert.throws(() => parseEvents(`${JSON.stringify(apiError)}\n`), (error) => {
    assert.equal(error.code, 'OPENCODE_EVENT_ERROR');
    assert.deepEqual(error.details.providerError, { name: 'APIError', statusCode: 429, isRetryable: true });
    return true;
  });

  const authError = {
    type: 'error', sessionID: 'ses_2',
    error: { name: 'ProviderAuthError', data: { providerID: 'openai', message: 'invalid key' } },
  };
  assert.throws(() => parseEvents(`${JSON.stringify(authError)}\n`), (error) => {
    assert.deepEqual(error.details.providerError, { name: 'ProviderAuthError' });
    return true;
  });

  // The real sample from the first supervised run: no statusCode, no isRetryable — stays terminal.
  const unknown = {
    type: 'error', sessionID: 'ses_3',
    error: { name: 'UnknownError', data: { message: 'Unexpected server error' } },
  };
  assert.throws(() => parseEvents(`${JSON.stringify(unknown)}\n`), (error) => {
    assert.deepEqual(error.details.providerError, { name: 'UnknownError' });
    return true;
  });
});
