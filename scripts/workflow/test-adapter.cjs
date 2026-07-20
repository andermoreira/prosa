'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const catalogs = require('./lib/catalogs.cjs');
const contracts = require('./lib/contracts.cjs');
const processModule = require('./lib/process.cjs');
const opencodeModule = require('./lib/opencode.cjs');
const sandboxModule = require('./lib/sandbox.cjs');
const riskPolicyModule = require('./lib/risk-policy.cjs');
const { createLocalAdapter: createProductionLocalAdapter } = require('./lib/local-adapter.cjs');
const orchestrator = require('./lib/orchestrator.cjs');

const PROJECT_ROOT = path.resolve(__dirname, '../..');

function normalizeTestSandboxPolicy(input) {
  if (process.platform === 'darwin') return sandboxModule.normalizeSandboxPolicy(input);
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { ...descriptor, value: 'darwin' });
  try { return sandboxModule.normalizeSandboxPolicy(input); }
  finally { Object.defineProperty(process, 'platform', descriptor); }
}

function testSandboxModule(overrides = {}) {
  return { ...sandboxModule, normalizeSandboxPolicy: normalizeTestSandboxPolicy, ...overrides };
}

function createLocalAdapter(options = {}) {
  const sandboxOverrides = options.modules?.sandbox || {};
  return createProductionLocalAdapter({
    ...options,
    modules: {
      ...(options.modules || {}),
      sandbox: testSandboxModule(sandboxOverrides),
    },
  });
}

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function write(root, relativePath, content) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function fixture(stepCount = 1) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-adapter-'));
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['config', 'user.name', 'Workflow Test']);
  git(root, ['config', 'user.email', 'workflow@example.invalid']);
  write(root, '.git/info/exclude', '.workflow-runtime/\n');
  write(root, 'AGENTS.md', '# Fixture policy\n');
  write(root, 'specs/pipeline.md', '# Pipeline fixture\n');
  for (let sequence = 1; sequence <= stepCount; sequence += 1) {
    write(root, `specs/steps/pipeline-step-${sequence}.md`, `# Step fixture ${sequence}\n`);
  }
  write(root, 'src/input.txt', 'main checkout\n');
  fs.cpSync(path.join(PROJECT_ROOT, 'schemas'), path.join(root, 'schemas'), { recursive: true });
  write(root, 'workflow/resources.yaml', `version: 1
resources:
  - id: node-runtime
    type: tool
    executable: node
    args: []
    capabilities: [process:execute]
    envAllowlist: [HOME, PATH, TMPDIR]
    cwd: repo-root
    timeoutMs: 30000
    maxOutputBytes: 1048576
    readOnly: false
    gateSandbox: {required: true, engine: "@anthropic-ai/sandbox-runtime", version: 0.0.66, networkDomains: [], allowUnixSockets: false, allowLocalBinding: false}
  - id: opencode
    type: agent
    role: executor
    executable: opencode
    args: [run]
    capabilities: [filesystem:read, filesystem:write]
    envAllowlist: [HOME, PATH, TMPDIR]
    cwd: worktree-root
    timeoutMs: 30000
    maxOutputBytes: 1048576
    readOnly: false
    sandbox: &executor-sandbox {required: true, engine: "@anthropic-ai/sandbox-runtime", version: 0.0.66, networkDomains: [opencode.ai, github.com, registry.npmjs.org], denySensitiveFiles: true, allowUnixSockets: false, allowLocalBinding: false}
  - id: opencode-reviewer
    type: agent
    role: reviewer
    executable: opencode
    args: [run]
    capabilities: [filesystem:read]
    envAllowlist: [HOME, PATH, TMPDIR]
    cwd: worktree-root
    timeoutMs: 30000
    maxOutputBytes: 1048576
    readOnly: true
    sandbox: &readonly-sandbox {required: true, engine: "@anthropic-ai/sandbox-runtime", version: 0.0.66, networkDomains: [opencode.ai], denySensitiveFiles: true, allowUnixSockets: false, allowLocalBinding: false}
  - id: opencode-diagnostician
    type: agent
    role: diagnostician
    executable: opencode
    args: [run]
    capabilities: [filesystem:read]
    envAllowlist: [HOME, PATH, TMPDIR]
    cwd: worktree-root
    timeoutMs: 30000
    maxOutputBytes: 1048576
    readOnly: true
    sandbox: *readonly-sandbox
`);
  write(root, 'workflow/gates.yaml', `version: 1
gates:
  - id: workflow-tests
    resourceId: node-runtime
    executable: node
    args: [-e, "process.stdout.write('gate passed')"]
    cwd: worktree-root
    timeoutMs: 30000
    maxOutputBytes: 1048576
    category: test
  - id: contract-tests
    resourceId: node-runtime
    executable: node
    args: [-e, "process.stdout.write('contract gate passed')"]
    cwd: worktree-root
    timeoutMs: 30000
    maxOutputBytes: 1048576
    category: test
`);
  fs.copyFileSync(path.join(PROJECT_ROOT, 'workflow/risk-policy.yaml'), path.join(root, 'workflow/risk-policy.yaml'));
  git(root, ['add', '.']);
  git(root, ['commit', '-qm', 'fixture']);
  const baseSha = git(root, ['rev-parse', 'HEAD']);
  const catalog = catalogs.loadCatalogsFromFilesystem(root);
  assert.equal(catalog.ok, true, JSON.stringify(catalog.errors));
  const steps = Array.from({ length: stepCount }, (_, index) => {
    const sequence = index + 1;
    const stepId = `pipeline-step-${sequence}`;
    const acceptanceOffset = index * 2;
    return {
    schemaVersion: '1.0.0', id: stepId, sequence, specId: 'pipeline',
    source: { path: `specs/steps/${stepId}.md`, hash: 'a'.repeat(64), baseSha },
    goal: `Change isolated fixture ${sequence}.`,
    boundaries: { inScope: ['behaviorType=chore', 'owns=fixture'], outOfScope: ['doesNotOwn=main'], maxLogicalFiles: 5 },
    dependsOn: index === 0 ? [] : [`pipeline-step-${index}`],
    predictedFiles: [sequence === 1 ? 'src/output.txt' : `src/output-${sequence}.txt`], allowedAreas: ['src'],
    resources: { executor: 'opencode', reviewer: 'opencode-reviewer', diagnostician: 'opencode-diagnostician', notifications: [] },
    context: { specPath: 'specs/pipeline.md', stepPath: `specs/steps/${stepId}.md`, baseSha, implementationNoteIds: ['NOTE-01'] },
    acceptanceCriteria: [
      { id: `AC-${String(acceptanceOffset + 1).padStart(2, '0')}`, evidence: [{
        id: `EVIDENCE-${String(acceptanceOffset + 1).padStart(2, '0')}`, kind: 'automated-test', description: 'Workflow gate passes.', gateId: 'workflow-tests',
        resultRef: `${stepId}/attempt-1/gate-workflow-tests`, testSelector: 'workflow',
      }] },
      { id: `AC-${String(acceptanceOffset + 2).padStart(2, '0')}`, evidence: [{
        id: `EVIDENCE-${String(acceptanceOffset + 2).padStart(2, '0')}`, kind: 'contract-test', description: 'Contract gate passes.', gateId: 'contract-tests',
        resultRef: `${stepId}/attempt-1/gate-contract-tests`, testSelector: 'contract',
      }] },
    ],
    budgets: { maxAttempts: 2, maxAgentCalls: 3, maxReviewCycles: 1, maxDiagnosisCycles: 1, maxElapsedMinutes: 10, maxEstimatedCost: null, maxTokens: null },
    verification: { gateIds: ['workflow-tests', 'contract-tests'] }, revalidation: { triggers: ['after-lock'], driftPolicy: 'block' },
    documentationImpact: { kind: 'none', justification: 'Fixture only.' },
    testing: { required: true, gateIds: ['workflow-tests', 'contract-tests'], rationale: null },
    execution: { adapter: 'opencode', isolation: 'git-worktree', writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false },
    };
  });
  const step = steps[0];
  const validation = {
    ok: true, specPath: 'specs/pipeline.md', repoRoot: root, baseSha,
    spec: {
      // A real spec carries source.baseSha — it is the provenance the notes are approved against,
      // and validateSemantics requires source, approval and every note to agree on it.
      id: 'pipeline', status: 'approved', source: { path: 'specs/pipeline.md', baseSha }, approval: { baseSha },
      budgets: {
        maxAttemptsPerStep: 2, maxAttemptsTotal: 2 * stepCount, maxAgentCallsPerStep: 3, maxAgentCallsTotal: 3 * stepCount,
        maxReviewCyclesPerStep: 1, maxReviewCyclesTotal: stepCount, maxDiagnosisCyclesPerStep: 1, maxDiagnosisCyclesTotal: stepCount,
        maxElapsedMinutesPerStep: 10, maxElapsedMinutesTotal: 10,
        maxEstimatedCostPerStep: null, maxEstimatedCostTotal: null, maxTokensPerStep: null, maxTokensTotal: null,
      },
      implementationNotes: [{ id: 'NOTE-01', approvedBy: 'owner', approvedAt: '2026-07-16', baseSha }],
      acceptanceCriteria: steps.flatMap((entry) => entry.acceptanceCriteria.map(({ id }) => ({ id }))), execution: { notificationResourceIds: [] },
    },
    steps, dag: {
      order: steps.map((entry) => entry.id),
      dependencies: Object.fromEntries(steps.map((entry) => [entry.id, entry.dependsOn])),
      hash: 'b'.repeat(64),
    }, catalogs: catalog.value,
  };
  for (const entry of steps) assert.equal(contracts.validate('step', entry).ok, true);
  return { root, validation, step, steps };
}

function fakeProcess(options) {
  if (options.executable === 'opencode' && options.args[0] === '--version') {
    return Promise.resolve({ ok: true, status: 'succeeded', stdout: { text: '1.1.1\n', bytes: 6 }, stderr: { text: '', bytes: 0 } });
  }
  return processModule.runProcess(options);
}

test('production adapter fails preflight before runtime mutation for OpenCode, base, and catalog errors', async () => {
  for (const failure of ['opencode', 'base', 'catalog']) {
    const { root, validation } = fixture();
    try {
      const candidate = structuredClone(validation);
      if (failure === 'base') candidate.baseSha = 'f'.repeat(40);
      if (failure === 'catalog') candidate.catalogs.hashes.combined = 'f'.repeat(64);
      const adapter = createLocalAdapter({
        repoRoot: root,
        runProcess: fakeProcess,
        modules: failure === 'opencode' ? {
          sandbox: { ...sandboxModule, resolveExecutable: (executable) => {
            if (executable === 'opencode') throw new Error('missing');
            return sandboxModule.resolveExecutable(executable);
          } },
        } : undefined,
      });
      await assert.rejects(adapter.preflight({ validation: candidate, runId: adapter.runId(candidate) }), {
        code: failure === 'opencode' ? 'OPENCODE_COMMAND_UNAVAILABLE' : failure === 'base' ? 'GIT_BASE_SHA_NOT_FOUND' : 'CATALOG_INVALID',
      });
      assert.equal(fs.existsSync(path.join(root, '.workflow-runtime')), false);
      assert.equal(git(root, ['status', '--porcelain']), '');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

// Drives the real adapter up to the point where invoke reserves budget, counting how many times
// the agent is actually reached. openCode is the only seam faked: the ledger, lock, state and
// worktree are the production ones.
async function attemptFixture({ maxAgentCalls = 1, invoke } = {}) {
  const { root, validation, step } = fixture();
  const policy = await riskPolicyModule.loadRiskPolicyFromGit(root, validation.baseSha);
  validation.riskPolicy = policy.value;
  validation.riskAssessments = [{
    stepId: step.id,
    assessment: riskPolicyModule.assessRisk({ policyRecord: policy.value, step }),
  }];
  const reached = [];
  // Assigned before any invoke can run. A reviewer is handed the snapshot as its target, so a test
  // that wants to prove the worktree is protected needs the worktree path, not input.worktree.
  let attemptWorktree;
  const fakeOpenCode = {
    async invoke(input) {
      reached.push(input.role);
      if (invoke) return invoke(input, attemptWorktree);
      // Only the executor may write: a reviewer that touches its worktree trips
      // READ_ONLY_MUTATION_DETECTED, which is a different guarantee than the one under test.
      if (input.role === 'executor') write(input.worktree, 'src/output.txt', 'attempt output\n');
      return { ok: true, artifactRef: { id: `${input.role}-response` }, metrics: { estimatedCost: null, tokens: null } };
    },
  };
  step.budgets.maxAgentCalls = maxAgentCalls;
  validation.spec.budgets.maxAgentCallsPerStep = maxAgentCalls;
  validation.spec.budgets.maxAgentCallsTotal = maxAgentCalls;
  const adapter = createLocalAdapter({ repoRoot: root, runProcess: fakeProcess, openCode: fakeOpenCode });
  const runId = adapter.runId(validation);
  const context = { validation, runId, options: {}, mode: 'run' };
  await adapter.preflight(context);
  const handle = adapter.acquireLock(context);
  adapter.openRun({ ...context, lock: handle, resume: false });
  adapter.checkpoint({ ...context, lock: handle, step, attempt: 1, status: 'READY' });
  const worktree = adapter.createAttempt({ ...context, lock: handle, step, attempt: 1 });
  attemptWorktree = worktree;
  // Both roles debit the same agent-call metric, and the worktree binding is validated before the
  // reservation, so a second role on the same attempt is how a second call is reached at all.
  // latestRevalidation is a required snapshot part, and in production processStep carries it on the
  // attempt context; without it the reviewer path dies at SNAPSHOT_INCOMPLETE before the call.
  const latestRevalidation = { trigger: 'before-review', ok: true, factualTrigger: 'before-review' };
  const call = (role) => adapter.invoke({ ...context, lock: handle, step, attempt: 1, role, worktree, latestRevalidation });
  const cleanup = () => {
    if (handle && !handle.released) adapter.releaseLock(handle);
    // A closed review snapshot is written 0400, so rmSync cannot remove its directory until the
    // tree is writable again — the same reason the runbook chmods before deleting the runtime.
    spawnSync('chmod', ['-R', 'u+w', root], { shell: false });
    fs.rmSync(root, { recursive: true, force: true });
  };
  return { root, adapter, call, reached, cleanup, worktree };
}

test('the budget blocks an agent call before the agent is reached', async () => {
  const { call, reached, cleanup } = await attemptFixture({ maxAgentCalls: 1 });
  try {
    assert.equal((await call('executor')).ok, true);
    assert.deepEqual(reached, ['executor']);
    await assert.rejects(call('reviewer'), { code: 'BUDGET_EXCEEDED' });
    // The second call never reached the agent: the reservation is taken before openCode.invoke, so
    // an exhausted budget costs nothing rather than being detected after the fact.
    assert.deepEqual(reached, ['executor']);
  } finally { cleanup(); }
});

test('a failed agent call still consumes its reservation, so failures cannot retry unboundedly', async () => {
  const { call, reached, cleanup } = await attemptFixture({
    maxAgentCalls: 1,
    invoke: () => { throw Object.assign(new Error('provider down'), { code: 'SERVICE_UNAVAILABLE' }); },
  });
  try {
    await assert.rejects(call('executor'), { code: 'SERVICE_UNAVAILABLE' });
    assert.deepEqual(reached, ['executor']);
    // Releasing the reservation on failure would let a flapping agent call forever within budget.
    // The failed call is charged, so the next one is refused by the budget and not by the provider.
    await assert.rejects(call('reviewer'), { code: 'BUDGET_EXCEEDED' });
    assert.deepEqual(reached, ['executor']);
  } finally { cleanup(); }
});

test('sandbox violations persist sanitized diagnostics bound to the policy', async () => {
  const { root, call, cleanup } = await attemptFixture({
    invoke: () => { throw Object.assign(new Error('sandbox denied access'), {
      code: 'SANDBOX_VIOLATION', details: { process: { stderr: { text: 'EPERM TOKEN=secret' } } },
    }); },
  });
  try {
    await assert.rejects(call('executor'), { code: 'SANDBOX_VIOLATION' });
    const directory = path.join(root, '.workflow-runtime/runs/run-pipeline/artifacts/pipeline-step-1/attempt-1');
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
    const artifact = manifest.artifacts.find((entry) => entry.kind === 'agent-log');
    assert.match(artifact.provenance.sandboxPolicyHash, /^[0-9a-f]{64}$/);
    const content = fs.readFileSync(path.join(root, '.workflow-runtime/runs/run-pipeline', artifact.path), 'utf8');
    assert.match(content, /EPERM/);
    assert.doesNotMatch(content, /TOKEN=secret/);
    const state = JSON.parse(fs.readFileSync(path.join(root, '.workflow-runtime/runs/run-pipeline/state.json'), 'utf8'));
    assert.equal(state.steps[0].risk.assessment.effectiveLevel, 'restricted');
    assert.equal(state.steps[0].risk.assessment.signals.some((signal) => signal.kind === 'sandbox-violation'), true);
  } finally { cleanup(); }
});

// A cleanup failure leaves host-level SRT state a fresh process cannot see, so the block must
// outlive the process. The marker is persisted with a sanitized cause when invoke surfaces
// SANDBOX_CLEANUP_FAILED, and it never masks that original error.
test('a sandbox cleanup failure persists a sanitized poison marker', async () => {
  const { root, call, cleanup } = await attemptFixture({
    invoke: () => { throw Object.assign(new Error('cleanup did not complete'), {
      code: 'SANDBOX_CLEANUP_FAILED', details: { cause: 'reset busy ghp_AAAAAAAAAAAAAAAAAAAAAAAA' },
    }); },
  });
  try {
    await assert.rejects(call('executor'), { code: 'SANDBOX_CLEANUP_FAILED' });
    const markerPath = path.join(root, '.workflow-runtime/sandbox-poison.json');
    assert.equal(fs.existsSync(markerPath), true);
    const marker = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
    assert.equal(marker.schemaVersion, '1.0.0');
    assert.equal(marker.runId, 'run-pipeline');
    assert.match(marker.policyHash, /^[0-9a-f]{64}$/);
    assert.doesNotMatch(JSON.stringify(marker), /ghp_/);
  } finally { cleanup(); }
});

// Presence of the marker fails every mutable entrypoint closed — run/resume via preflight and
// review via openReviewSnapshot — before any lock or agent spawn, and nothing removes it.
test('a persisted poison marker blocks run, resume, and review before any spawn', async () => {
  const { root, validation } = fixture();
  try {
    const markerPath = path.join(root, '.workflow-runtime/sandbox-poison.json');
    fs.mkdirSync(path.dirname(markerPath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(markerPath, `${JSON.stringify({ schemaVersion: '1.0.0' })}\n`);
    const adapter = createLocalAdapter({ repoRoot: root, runProcess: fakeProcess });
    const context = { validation, runId: adapter.runId(validation) };
    for (const resume of [false, true]) {
      await assert.rejects(adapter.preflight({ ...context, mode: resume ? 'resume' : 'run', resume }), { code: 'SANDBOX_POISONED' });
    }
    await assert.rejects(adapter.openReviewSnapshot({ ...context, mode: 'review' }), { code: 'SANDBOX_POISONED' });
    // Nothing on those paths clears the marker: it takes a human step after host verification.
    assert.equal(fs.existsSync(markerPath), true);
  } finally {
    spawnSync('chmod', ['-R', 'u+w', root], { shell: false });
    fs.rmSync(root, { recursive: true, force: true });
  }
});

// The reviewer's isolation is two claims, and both are checked against real Git rather than a faked
// state capture: it is handed a closed snapshot instead of the worktree, and the worktree it never
// sees is compared before and after the call, so touching it blocks the run.
test('the reviewer is given a snapshot, not the worktree, and touching the worktree blocks it', async () => {
  const targets = [];
  const { call, cleanup, worktree } = await attemptFixture({
    maxAgentCalls: 3,
    invoke: (input, attemptWorktree) => {
      targets.push({ role: input.role, target: input.worktree });
      if (input.role === 'reviewer') write(attemptWorktree.path, 'src/reviewer-wrote-this.txt', 'mutation\n');
      return { ok: true, artifactRef: { id: `${input.role}-response` }, metrics: { estimatedCost: null, tokens: null } };
    },
  });
  try {
    await assert.rejects(call('reviewer'), { code: 'READ_ONLY_MUTATION_DETECTED' });
    const reviewer = targets.find((entry) => entry.role === 'reviewer');
    assert.notEqual(reviewer.target, worktree.path);
    assert.equal(reviewer.target.includes('snapshots'), true);
  } finally { cleanup(); }
});

test('production adapter uses real lock, state, worktree, diff, gate artifacts, and budget while leaving main untouched', async () => {
  const { root, validation, step } = fixture();
  const fakeOpenCode = {
    async invoke(input) {
      write(input.worktree, 'src/output.txt', 'attempt output\n');
      return { ok: true, artifactRef: { id: 'executor-response' }, metrics: { estimatedCost: null, tokens: null } };
    },
  };
  const adapter = createLocalAdapter({ repoRoot: root, runProcess: fakeProcess, openCode: fakeOpenCode });
  const runId = adapter.runId(validation);
  const context = { validation, runId, options: {}, mode: 'run' };
  let handle;
  try {
    await adapter.preflight(context);
    handle = adapter.acquireLock(context);
    const opened = adapter.openRun({ ...context, lock: handle, resume: false });
    assert.equal(opened.status, 'RUNNING');
    adapter.checkpoint({ ...context, lock: handle, step, attempt: 1, status: 'READY' });
    const worktree = adapter.createAttempt({ ...context, lock: handle, step, attempt: 1 });
    adapter.checkpoint({ ...context, lock: handle, step, attempt: 1, status: 'EXECUTING', worktree });
    const invocation = await adapter.invoke({ ...context, lock: handle, step, attempt: 1, role: 'executor', worktree });
    assert.equal(invocation.ok, true);
    const diff = adapter.collectChanges({ ...context, step, attempt: 1, worktree });
    assert.deepEqual(diff.changes.map((change) => change.path), ['src/output.txt']);
    const gate = await adapter.runGate({ ...context, step, attempt: 1, id: 'workflow-tests', worktree });
    const contractGate = await adapter.runGate({ ...context, step, attempt: 1, id: 'contract-tests', worktree });
    assert.equal(gate.ok, true);
    assert.equal(contractGate.ok, true);
    assert.match(gate.artifact.hash, /^[0-9a-f]{64}$/);
    assert.equal((await adapter.revalidate({ ...context, lock: handle })).ok, true);
    assert.equal(fs.existsSync(path.join(root, 'src/output.txt')), false);
    assert.equal(fs.readFileSync(path.join(root, 'src/input.txt'), 'utf8'), 'main checkout\n');
    assert.equal(git(root, ['rev-parse', 'HEAD']), validation.baseSha);
    assert.equal(git(root, ['status', '--porcelain']), '');
    assert.ok(fs.existsSync(path.join(root, '.workflow-runtime', 'runs', runId, 'state.json')));
  } finally {
    if (handle && !handle.released) adapter.releaseLock(handle);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('adapter resolves every AC to its exact gate and rehydrates persisted evidence refs on resume', async () => {
  const { root, validation, step } = fixture();
  const adapter = createLocalAdapter({ repoRoot: root, runProcess: fakeProcess });
  const runId = adapter.runId(validation);
  const context = { validation, runId, options: {}, mode: 'run' };
  let handle;
  try {
    await adapter.preflight(context);
    handle = adapter.acquireLock(context);
    adapter.openRun({ ...context, lock: handle, resume: false });
    adapter.checkpoint({ ...context, lock: handle, step, attempt: 1, status: 'READY' });
    const worktree = adapter.createAttempt({ ...context, lock: handle, step, attempt: 1 });
    adapter.checkpoint({ ...context, lock: handle, step, attempt: 1, status: 'EXECUTING', worktree });
    write(worktree.path, 'src/output.txt', 'evidence output\n');
    const gateResults = [];
    adapter.checkpoint({ ...context, lock: handle, step, attempt: 1, status: 'GATING' });
    for (const id of step.verification.gateIds) {
      const result = await adapter.runGate({ ...context, step, attempt: 1, id, worktree });
      gateResults.push({ id, ...result });
    }
    for (const status of ['REVALIDATING', 'REVIEWING', 'ACCEPTING']) {
      adapter.checkpoint({ ...context, lock: handle, step, attempt: 1, status });
    }
    const acceptanceInput = {
      ...context, lock: handle, step, attempt: 1, worktree, gates: gateResults,
      diff: { changes: [{ status: '?', path: 'src/output.txt' }] },
      scope: { logicalFileCount: 1, unpredicted: [] },
      review: { decision: 'approved', findings: [] },
    };
    acceptanceInput.latestRevalidation = await adapter.revalidate({ ...acceptanceInput, trigger: 'before-acceptance' });
    assert.equal(adapter.acceptStep(acceptanceInput).ok, true);
    const persisted = JSON.parse(fs.readFileSync(path.join(root, '.workflow-runtime', 'runs', runId, 'state.json'), 'utf8'));
    assert.equal(persisted.steps[0].evidence.length, 2);
    adapter.releaseLock(handle);

    const resumedAdapter = createLocalAdapter({ repoRoot: root, runProcess: fakeProcess });
    handle = resumedAdapter.acquireLock(context);
    resumedAdapter.openRun({ ...context, lock: handle, resume: true });
    assert.equal(resumedAdapter.acceptStep({ ...acceptanceInput, lock: handle }).ok, true);
  } finally {
    if (handle && !handle.released) adapter.releaseLock(handle);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('real adapter accepts and commits sequential steps with evidence bound to each owning identity', async () => {
  const { root, validation, steps } = fixture(2);
  validation.steps[0].boundaries.inScope = ['owns=fixture'];
  validation.steps[1].schemaVersion = '2.0.0';
  validation.steps[1].changeType = 'documentation';
  validation.spec.execution.autoCommit = true;
  validation.spec.budgets.maxReviewCyclesPerStep = 2;
  validation.spec.budgets.maxReviewCyclesTotal = 3;
  validation.steps[1].budgets.maxReviewCycles = 2;
  const reviewOutput = JSON.stringify({
    schemaVersion: '1.0.0', decision: 'approved', summary: 'Exact provenance.', confidence: 'high', findings: [],
  });
  const modules = {
    sandbox: testSandboxModule(),
    opencode: {
      ...opencodeModule,
      createOpenCodeAdapter({ artifacts }) {
        return {
          async invoke(input) {
            assert.match(input.sandboxPolicy?.policyHash || '', /^[0-9a-f]{64}$/);
            if (input.role === 'executor') write(input.worktree, input.predictedFiles[0], `${input.operationId}\n`);
            const artifactRef = await artifacts.preserveAgentResponse({
              operationId: input.operationId, role: input.role, attempt: input.attempt,
              response: input.role === 'reviewer' ? reviewOutput : 'Implementei o passo. Resultado factual: arquivo criado.', process: { status: 'succeeded' },
              sandboxPolicyHash: input.sandboxPolicy.policyHash,
            });
            return { ok: true, operationId: input.operationId, artifactRef, metrics: { estimatedCost: null, tokens: null } };
          },
        };
      },
    },
  };
  try {
    const run = await orchestrator.run({ specPath: validation.specPath, baseSha: validation.baseSha, allowCommit: true }, {
      repoRoot: root, validationResult: validation, runProcess: fakeProcess, modules,
    });
    assert.equal(run.status, 'SUCCEEDED', JSON.stringify(run));
    assert.deepEqual(run.steps.map((entry) => entry.status), ['COMMITTED', 'COMMITTED']);
    assert.equal(run.steps[1].commit.parentSha, run.steps[0].commit.sha);
    assert.deepEqual(run.steps.map((entry) => git(root, ['show', '-s', '--pretty=%s', entry.commit.sha])), [
      'chore(workflow): Change isolated fixture 1.',
      'docs(workflow): Change isolated fixture 2.',
    ]);

    const runtimeRoot = path.join(root, '.workflow-runtime', 'runs', 'run-pipeline');
    const state = JSON.parse(fs.readFileSync(path.join(runtimeRoot, 'state.json'), 'utf8'));
    for (const step of steps) {
      const stepState = state.steps.find((entry) => entry.id === step.id);
      assert.ok(stepState.sandbox.applications.some((entry) => entry.role === 'executor'));
      assert.ok(stepState.sandbox.applications.some((entry) => entry.role === 'reviewer'));
      const executorAttempt = state.attempts.find((entry) => entry.stepId === step.id);
      assert.equal(executorAttempt.sandboxPolicyHash, stepState.sandbox.applications.find((entry) => entry.role === 'executor').policyHash);
      const identityRef = state.artifacts.find((entry) => entry.kind === 'stdout' && entry.provenance.stepId === step.id
        && JSON.parse(fs.readFileSync(path.join(runtimeRoot, 'artifacts', step.id, 'attempt-1', 'manifest.json'), 'utf8'))
          .artifacts.some((artifact) => artifact.path === entry.path && artifact.kind === 'worktree-identity'));
      const identity = JSON.parse(fs.readFileSync(path.join(runtimeRoot, identityRef.path), 'utf8'));
      const gateRefs = state.artifacts.filter((entry) => entry.kind === 'gate-result' && entry.provenance.stepId === step.id);
      assert.equal(gateRefs.length, 2);
      for (const gateRef of gateRefs) {
        const manifest = JSON.parse(fs.readFileSync(path.join(runtimeRoot, path.dirname(gateRef.path), 'manifest.json'), 'utf8'));
        const manifestRef = manifest.artifacts.find((entry) => entry.path === gateRef.path && entry.hash === gateRef.hash);
        assert.equal(manifestRef.provenance.attemptId, `attempt-${step.id}-1`);
        assert.equal(manifestRef.provenance.worktreeId, `worktree-${step.id}-1`);
        assert.equal(manifestRef.provenance.factualIdentityHash, identity.hash);
      }
    }
    const secondAcceptanceRevalidation = state.artifacts.map((entry) => {
      if (entry.kind !== 'stdout') return null;
      // `stdout` is the catch-all bucket in persistArtifactRef, so it holds revalidation records
      // next to the executor's prose response. Only the records are JSON.
      let value;
      try { value = JSON.parse(fs.readFileSync(path.join(runtimeRoot, entry.path), 'utf8')); }
      catch { return null; }
      return value?.trigger === 'before-acceptance' ? value : null;
    }).find(Boolean);
    assert.equal(secondAcceptanceRevalidation.facts.identity.worktreeId, 'worktree-pipeline-step-2-1');
    assert.equal(secondAcceptanceRevalidation.facts.identity.attemptId, 'attempt-pipeline-step-2-1');
    assert.equal(secondAcceptanceRevalidation.identityHash, secondAcceptanceRevalidation.facts.identity.actual);
    assert.notEqual(secondAcceptanceRevalidation.identityHash, secondAcceptanceRevalidation.aggregateIdentityHash);
  } finally {
    const snapshots = path.join(root, '.workflow-runtime', 'runs', 'run-pipeline', 'snapshots');
    if (fs.existsSync(snapshots)) {
      for (const name of fs.readdirSync(snapshots)) fs.chmodSync(path.join(snapshots, name), 0o700);
    }
    const cleanupRoot = `${root}-cleanup`;
    fs.renameSync(root, cleanupRoot);
    fs.rmSync(cleanupRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});

test('module validation fails closed and preflight does not execute agent binaries', async () => {
  assert.throws(() => createLocalAdapter({ modules: { opencode: {} } }), { code: 'LOCAL_ADAPTER_MODULE_INVALID' });
  const first = fixture();
  const second = fixture();
  let calls = 0;
  try {
    const overridden = createLocalAdapter({ repoRoot: first.root, runProcess: async (input) => {
      if (input.executable === 'opencode') { calls += 1; return { ok: true, stdout: { text: '1.1.1' }, stderr: { text: '' } }; }
      return fakeProcess(input);
    } });
    await overridden.preflight({ validation: first.validation, runId: overridden.runId(first.validation) });
    const independent = createLocalAdapter({ repoRoot: second.root, runProcess: fakeProcess });
    await independent.preflight({ validation: second.validation, runId: independent.runId(second.validation) });
    assert.equal(calls, 0);
  } finally {
    fs.rmSync(first.root, { recursive: true, force: true });
    fs.rmSync(second.root, { recursive: true, force: true });
  }
});

// commitStep creates the commit and returns it; the orchestrator is what records COMMITTED
// afterwards, so there is a real window where Git holds the commit and the state still says
// COMMITTING. A resume through that window has to recognise the existing commit rather than make a
// second one — the sha is unchanged, the status says reconciled rather than created, and the parent
// is still the base, which a duplicate could not be since it would parent off the first commit.
test('a crash between the commit and its checkpoint is reconciled without a second commit', async () => {
  const { root, validation, step } = fixture();
  let now = 0;
  const adapter = createLocalAdapter({
    repoRoot: root, runProcess: fakeProcess, now: () => now,
    openCode: { async invoke() { throw new Error('agent must not repeat'); } },
  });
  const runId = adapter.runId(validation);
  const context = { validation, runId, options: {}, mode: 'run' };
  let handle;
  try {
    await adapter.preflight(context);
    handle = adapter.acquireLock(context);
    adapter.openRun({ ...context, lock: handle, resume: false });
    adapter.checkpoint({ ...context, lock: handle, step, attempt: 1, status: 'READY' });
    const worktree = adapter.createAttempt({ ...context, lock: handle, step, attempt: 1 });
    adapter.checkpoint({ ...context, lock: handle, step, attempt: 1, status: 'EXECUTING', worktree });
    write(worktree.path, 'src/output.txt', 'executor output\n');
    for (const status of ['GATING', 'REVALIDATING', 'REVIEWING', 'ACCEPTING']) {
      adapter.checkpoint({ ...context, lock: handle, step, attempt: 1, status });
    }
    const diff = adapter.collectChanges({ ...context, step, attempt: 1, worktree });
    const attempt = { ...context, lock: handle, step, attempt: 1, worktree, diff };
    adapter.checkpoint({ ...attempt, status: 'COMMITTING' });
    const commit = await adapter.commitStep(attempt);
    // The crash: commitStep has returned, so the commit exists, and no COMMITTED checkpoint follows.
    assert.equal(commit.status, 'created');
    adapter.releaseLock(handle);

    // The persisted vocabulary is narrower than the orchestrator's: state.schema.json's stepState
    // enum has neither COMMITTING nor AWAITING_COMMIT, so both land on ACCEPTED (local-adapter:839
    // and :878) and openRun reports ACCEPTED back as AWAITING_COMMIT (:618). A crash after the
    // commit is therefore indistinguishable from waiting for a human one by label alone, which is
    // exactly why reconciliation has to ask Git what happened instead of trusting the state.
    const crashed = JSON.parse(fs.readFileSync(path.join(root, '.workflow-runtime', 'runs', runId, 'state.json'), 'utf8'));
    assert.equal(crashed.steps[0].state, 'ACCEPTED');

    now = 3600000;
    const resumedAdapter = createLocalAdapter({
      repoRoot: root, runProcess: fakeProcess, now: () => now,
      openCode: { async invoke() { throw new Error('agent must not repeat'); } },
    });
    const resumeAdapter = {
      ...resumedAdapter,
      async runGate(input) { return { ok: true, passed: true, resultRef: `global/${input.id}` }; },
      async reviewGlobal() { return { decision: 'approved', findings: [], mutated: false }; },
      async acceptGlobal() { return { ok: true, status: 'accepted' }; },
      async writeReports() { return { report: 'report', retrospective: 'retrospective' }; },
    };
    const result = await orchestrator.resume({ specPath: validation.specPath, baseSha: validation.baseSha }, {
      validationResult: validation, adapter: resumeAdapter,
    });
    assert.equal(result.status, 'SUCCEEDED', JSON.stringify(result));
    assert.equal(result.steps[0].commit.sha, commit.sha);
    assert.equal(result.steps[0].commit.status, 'reconciled');
    assert.equal(result.steps[0].commit.parentSha, validation.baseSha);
  } finally {
    if (handle && !handle.released) adapter.releaseLock(handle);
    spawnSync('chmod', ['-R', 'u+w', root], { shell: false });
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('orchestrator.resume reconciles a real manually committed accepted tree without repeating execution', async () => {
  const { root, validation, step } = fixture();
  validation.spec.approval.baseSha = 'f'.repeat(40);
  let now = 0;
  const adapter = createLocalAdapter({ repoRoot: root, runProcess: fakeProcess, now: () => now, openCode: { async invoke() { throw new Error('agent must not repeat'); } } });
  const runId = adapter.runId(validation);
  const context = { validation, runId, options: {}, mode: 'run' };
  let handle;
  try {
    await adapter.preflight(context);
    handle = adapter.acquireLock(context);
    adapter.openRun({ ...context, lock: handle, resume: false });
    adapter.checkpoint({ ...context, lock: handle, step, attempt: 1, status: 'READY' });
    const worktree = adapter.createAttempt({ ...context, lock: handle, step, attempt: 1 });
    adapter.checkpoint({ ...context, lock: handle, step, attempt: 1, status: 'EXECUTING', worktree });
    write(worktree.path, 'src/output.txt', 'human output\n');
    for (const status of ['GATING', 'REVALIDATING', 'REVIEWING', 'ACCEPTING']) {
      adapter.checkpoint({ ...context, lock: handle, step, attempt: 1, status });
    }
    now = 60000;
    adapter.checkpoint({
      ...context, lock: handle, step, attempt: 1, status: 'AWAITING_COMMIT', worktree,
      diff: { changes: [{ status: '?', path: 'src/output.txt' }] },
    });
    const awaitingState = JSON.parse(fs.readFileSync(path.join(root, '.workflow-runtime', 'runs', runId, 'state.json'), 'utf8'));
    const intentRef = awaitingState.artifacts.find((entry) => entry.kind === 'commit');
    const intent = JSON.parse(fs.readFileSync(path.join(root, '.workflow-runtime', 'runs', runId, intentRef.path), 'utf8'));
    assert.equal(awaitingState.worktrees[0].headSha, validation.baseSha);
    assert.notEqual(intent.acceptedTreeSha, awaitingState.worktrees[0].headSha);
    assert.equal(intent.attemptId, awaitingState.steps[0].attemptIds[0]);
    adapter.releaseLock(handle);
    now = 3600000;
    git(worktree.path, ['add', 'src/output.txt']);
    git(worktree.path, ['commit', '-qm', 'chore: human commit']);

    const resumedAdapter = createLocalAdapter({ repoRoot: root, runProcess: fakeProcess, now: () => now });
    const resumeAdapter = {
      ...resumedAdapter,
      async runGate(input) { return { ok: true, passed: true, resultRef: `global/${input.id}` }; },
      async reviewGlobal() { return { decision: 'approved', findings: [], mutated: false }; },
      async acceptGlobal() { return { ok: true, status: 'accepted' }; },
      async writeReports() { return { report: 'report', retrospective: 'retrospective' }; },
    };
    const result = await orchestrator.resume({ specPath: validation.specPath, baseSha: validation.baseSha }, {
      validationResult: validation, adapter: resumeAdapter,
    });
    assert.equal(result.status, 'SUCCEEDED');
    assert.equal(result.steps[0].commit.parentSha, validation.baseSha);
    assert.equal(result.steps[0].attempt, 1);
    assert.equal(fs.existsSync(worktree.path), false);
    const completedState = JSON.parse(fs.readFileSync(path.join(root, '.workflow-runtime', 'runs', runId, 'state.json'), 'utf8'));
    assert.equal(completedState.usage.timing.totalActiveMs, awaitingState.usage.timing.totalActiveMs);
  } finally {
    if (handle && !handle.released) adapter.releaseLock(handle);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('production adapter persists human acceptance wait without a retry transition', async () => {
  const { root, validation, step } = fixture();
  let now = 0;
  const adapter = createLocalAdapter({ repoRoot: root, runProcess: fakeProcess, now: () => now });
  const runId = adapter.runId(validation);
  const context = { validation, runId, options: {}, mode: 'run' };
  let handle;
  try {
    await adapter.preflight(context);
    handle = adapter.acquireLock(context);
    adapter.openRun({ ...context, lock: handle, resume: false });
    adapter.checkpoint({ ...context, lock: handle, step, attempt: 1, status: 'READY' });
    const worktree = adapter.createAttempt({ ...context, lock: handle, step, attempt: 1 });
    adapter.checkpoint({ ...context, lock: handle, step, attempt: 1, status: 'EXECUTING', worktree });
    for (const status of ['GATING', 'REVALIDATING', 'REVIEWING', 'ACCEPTING']) {
      adapter.checkpoint({ ...context, lock: handle, step, attempt: 1, status });
    }
    now = 60000;
    adapter.checkpoint({
      ...context, lock: handle, step, attempt: 1, status: 'AWAITING_HUMAN', worktree,
      cause: { code: 'ACCEPTANCE_AWAITING_HUMAN' },
    });
    const state = JSON.parse(fs.readFileSync(path.join(root, '.workflow-runtime', 'runs', runId, 'state.json'), 'utf8'));
    assert.equal(state.state, 'BLOCKED');
    assert.equal(state.steps[0].state, 'BLOCKED');
    assert.equal(state.transitions.some((entry) => entry.to === 'RETRY_PENDING'), false);
    assert.equal(state.usage.timing.totalActiveMs, 60000);
  } finally {
    if (handle && !handle.released) adapter.releaseLock(handle);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('production adapter persists sanitized pre-execution approval before attempt effects', async () => {
  const { root, validation, step } = fixture();
  const policy = await riskPolicyModule.loadRiskPolicyFromGit(root, validation.baseSha);
  validation.riskPolicy = policy.value;
  validation.riskAssessments = [{ stepId: step.id, assessment: riskPolicyModule.assessRisk({ policyRecord: policy.value, step }) }];
  step.goal = 'Review TOKEN=secret before execution.';
  const adapter = createLocalAdapter({ repoRoot: root, runProcess: fakeProcess });
  const runId = adapter.runId(validation);
  const context = { validation, runId, options: {}, mode: 'run' };
  let handle;
  try {
    await adapter.preflight(context);
    handle = adapter.acquireLock(context);
    adapter.openRun({ ...context, lock: handle, resume: false });
    adapter.checkpoint({ ...context, lock: handle, step, attempt: 1, status: 'READY' });
    const request = adapter.checkpoint({
      ...context, lock: handle, step, attempt: 1, status: 'AWAITING_PRE_APPROVAL',
      assessment: validation.riskAssessments[0].assessment,
    });
    const runtimeRoot = path.join(root, '.workflow-runtime', 'runs', runId);
    const state = JSON.parse(fs.readFileSync(path.join(runtimeRoot, 'state.json'), 'utf8'));
    assert.equal(state.steps[0].state, 'AWAITING_PRE_APPROVAL');
    assert.equal(state.attempts.length, 0);
    assert.equal(state.worktrees.length, 0);
    assert.equal(state.steps[0].risk.requests[0].id, request.id);
    const artifact = state.artifacts.find((entry) => entry.id === request.contextArtifactRef);
    assert.equal(artifact.kind, 'approval-context');
    const content = fs.readFileSync(path.join(runtimeRoot, artifact.path), 'utf8');
    assert.match(content, /\[REDACTED\]/);
    assert.doesNotMatch(content, /TOKEN=secret/);
    const approvalContext = JSON.parse(content);
    assert.equal(approvalContext.requestId, request.id);
    assert.deepEqual(approvalContext.binding, request.binding);
    assert.match(approvalContext.resumeCommand, /resume-spec\.sh .* --decision-file <path\|->$/);
    assert.deepEqual(approvalContext.validDecisions.map((entry) => entry.nextAction), [null, 'retry', 'replan', 'abort']);
  } finally {
    if (handle && !handle.released) adapter.releaseLock(handle);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('persisted approval replay survives adapter restart and rejects a contradictory decision', async () => {
  const { root, validation, step } = fixture();
  const policy = await riskPolicyModule.loadRiskPolicyFromGit(root, validation.baseSha);
  validation.riskPolicy = policy.value;
  validation.riskAssessments = [{ stepId: step.id, assessment: riskPolicyModule.assessRisk({ policyRecord: policy.value, step }) }];
  const decisionDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-adapter-decision-'));
  const decisionPath = path.join(decisionDirectory, 'decision.json');
  const conflictingPath = path.join(decisionDirectory, 'conflicting-decision.json');
  const adapter = createLocalAdapter({
    repoRoot: root, runProcess: fakeProcess,
    openCode: { async invoke() { throw new Error('agent and review must not run during decision replay'); } },
  });
  const runId = adapter.runId(validation);
  const context = { validation, runId, options: {}, mode: 'resume' };
  let handle;
  try {
    await adapter.preflight(context);
    handle = adapter.acquireLock(context);
    adapter.openRun({ ...context, lock: handle, resume: false });
    adapter.checkpoint({ ...context, lock: handle, step, attempt: 1, status: 'READY' });
    const request = adapter.checkpoint({
      ...context, lock: handle, step, attempt: 1, status: 'AWAITING_PRE_APPROVAL',
      assessment: validation.riskAssessments[0].assessment,
    });
    const approved = {
      schemaVersion: '1.0.0', requestId: request.id, outcome: 'approved', actor: 'local-user',
      justification: 'Risk reviewed once', nextAction: null,
    };
    fs.writeFileSync(decisionPath, JSON.stringify(approved), { mode: 0o600 });
    fs.writeFileSync(conflictingPath, JSON.stringify({
      ...approved, outcome: 'rejected', justification: 'Contradictory replay', nextAction: 'abort',
    }), { mode: 0o600 });

    const first = await adapter.consumeDecision({ ...context, lock: handle, decisionFile: decisionPath });
    assert.equal(first.classification, 'satisfied');
    adapter.releaseLock(handle);

    const resumedAdapter = createLocalAdapter({
      repoRoot: root, runProcess: fakeProcess,
      openCode: { async invoke() { throw new Error('agent and review must not run during decision replay'); } },
    });
    handle = resumedAdapter.acquireLock(context);
    resumedAdapter.openRun({ ...context, lock: handle, resume: true });
    const replay = await resumedAdapter.consumeDecision({ ...context, lock: handle, decisionFile: decisionPath });
    assert.equal(replay.classification, 'satisfied');
    assert.equal(replay.state.steps[0].status, 'READY');
    await assert.rejects(
      resumedAdapter.consumeDecision({ ...context, lock: handle, decisionFile: conflictingPath }),
      { code: 'HITL_DECISION_CONFLICT' },
    );

    const persisted = JSON.parse(fs.readFileSync(path.join(root, '.workflow-runtime', 'runs', runId, 'state.json'), 'utf8'));
    assert.equal(persisted.steps[0].risk.decisions.length, 1);
    assert.equal(persisted.transitions.filter((entry) => entry.to === 'READY' && entry.from === 'AWAITING_PRE_APPROVAL').length, 1);
    assert.equal(persisted.attempts.length, 0);
    assert.equal(persisted.worktrees.length, 0);
    assert.equal(persisted.commits.length, 0);
    assert.equal(git(root, ['rev-parse', 'HEAD']), validation.baseSha);
  } finally {
    if (handle && !handle.released) adapter.releaseLock(handle);
    fs.rmSync(decisionDirectory, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('production adapter binds post-review approval to the complete sanitized diff and exact review', async () => {
  const { root, validation, step } = fixture();
  const policy = await riskPolicyModule.loadRiskPolicyFromGit(root, validation.baseSha);
  validation.riskPolicy = policy.value;
  validation.riskAssessments = [{ stepId: step.id, assessment: riskPolicyModule.assessRisk({ policyRecord: policy.value, step }) }];
  const reviewOutput = JSON.stringify({
    schemaVersion: '1.0.0', decision: 'approved', summary: 'Reviewed exact patch.', confidence: 'high', findings: [],
  });
  const modules = {
    sandbox: testSandboxModule(),
    opencode: {
      ...opencodeModule,
      createOpenCodeAdapter({ artifacts }) {
        return {
          async invoke(input) {
            const artifactRef = await artifacts.preserveAgentResponse({
              operationId: input.operationId, role: input.role, attempt: input.attempt,
              response: input.role === 'reviewer' ? reviewOutput : 'unused', process: { status: 'succeeded' },
              sandboxPolicyHash: input.sandboxPolicy.policyHash,
            });
            return { ok: true, operationId: input.operationId, artifactRef, metrics: { estimatedCost: null, tokens: null } };
          },
        };
      },
    },
  };
  let crashAfterDiscard = false;
  const adapter = createLocalAdapter({
    repoRoot: root, runProcess: fakeProcess, modules,
    afterDiscardEffect() {
      if (crashAfterDiscard) {
        crashAfterDiscard = false;
        throw Object.assign(new Error('simulated crash after worktree removal'), { code: 'TEST_CRASH' });
      }
    },
  });
  const runId = adapter.runId(validation);
  const context = { validation, runId, options: {}, mode: 'run' };
  let handle;
  try {
    await adapter.preflight(context);
    handle = adapter.acquireLock(context);
    adapter.openRun({ ...context, lock: handle, resume: false });
    adapter.checkpoint({ ...context, lock: handle, step, attempt: 1, status: 'READY' });
    const worktree = adapter.createAttempt({ ...context, lock: handle, step, attempt: 1 });
    adapter.checkpoint({ ...context, lock: handle, step, attempt: 1, status: 'EXECUTING', worktree });
    write(worktree.path, 'src/output.txt', 'approved byte sequence\nTOKEN=secret\n');
    const diff = adapter.collectChanges({ ...context, lock: handle, step, attempt: 1, worktree });
    adapter.checkpoint({ ...context, lock: handle, step, attempt: 1, status: 'GATING' });
    const gates = [];
    for (const id of step.verification.gateIds) {
      const result = await adapter.runGate({ ...context, lock: handle, step, attempt: 1, id, worktree });
      gates.push({ id, ...result });
    }
    adapter.checkpoint({ ...context, lock: handle, step, attempt: 1, status: 'REVALIDATING' });
    const latestRevalidation = await adapter.revalidate({
      ...context, lock: handle, step, attempt: 1, attemptId: worktree.attemptId,
      worktreeId: worktree.worktreeId, trigger: 'before-review',
    });
    adapter.checkpoint({ ...context, lock: handle, step, attempt: 1, status: 'REVIEWING' });
    const review = await adapter.reviewStep({
      ...context, lock: handle, step, attempt: 1, worktree, diff, gates,
      scope: { logicalFileCount: 1, unpredicted: [] }, latestRevalidation,
    });
    await adapter.revalidate({
      ...context, lock: handle, step, attempt: 1, attemptId: worktree.attemptId,
      worktreeId: worktree.worktreeId, trigger: 'after-review',
    });
    const request = adapter.checkpoint({
      ...context, lock: handle, step, attempt: 1, status: 'AWAITING_DIFF_APPROVAL',
      assessment: validation.riskAssessments[0].assessment, worktree, diff, gates,
      scope: { logicalFileCount: 1, unpredicted: [] }, review,
    });

    const runtimeRoot = path.join(root, '.workflow-runtime', 'runs', runId);
    const state = JSON.parse(fs.readFileSync(path.join(runtimeRoot, 'state.json'), 'utf8'));
    const diffArtifact = state.artifacts.find((entry) => entry.id === request.binding.diffArtifactId);
    const contextArtifact = state.artifacts.find((entry) => entry.id === request.contextArtifactRef);
    const diffContent = fs.readFileSync(path.join(runtimeRoot, diffArtifact.path), 'utf8');
    const approvalContext = fs.readFileSync(path.join(runtimeRoot, contextArtifact.path), 'utf8');
    const approvalContextRecord = JSON.parse(approvalContext);
    assert.equal(state.steps[0].state, 'AWAITING_DIFF_APPROVAL');
    assert.equal(request.checkpoint, 'post-review');
    assert.equal(request.binding.diffHash, diffArtifact.hash);
    assert.equal(request.binding.reviewArtifactId, review.artifactRef.id);
    assert.equal(request.binding.reviewHash, review.artifactRef.hash);
    assert.equal(request.binding.snapshotSourceHash, review.artifactRef.provenance.sourceHash);
    assert.equal(request.binding.factualIdentityHash, diff.identity.hash);
    assert.match(diffContent, /approved byte sequence/);
    assert.match(diffContent, /\[REDACTED\]/);
    assert.doesNotMatch(diffContent, /TOKEN=secret/);
    assert.match(approvalContext, /approved byte sequence/);
    assert.doesNotMatch(approvalContext, /TOKEN=secret|stdout|stderr|agent-log/);
    assert.equal(approvalContextRecord.requestId, request.id);
    assert.deepEqual(approvalContextRecord.binding, request.binding);
    assert.match(approvalContextRecord.resumeCommand, /resume-spec\.sh .* --decision-file <path\|->$/);

    write(worktree.path, 'src/output.txt', 'approved byte sequencf\nTOKEN=secret\n');
    const stale = await adapter.revalidate({
      ...context, lock: handle, step, attempt: 1, attemptId: worktree.attemptId,
      worktreeId: worktree.worktreeId, trigger: 'before-acceptance',
    });
    assert.equal(stale.ok, false);
    assert.equal(stale.checks.identity, false);
    const decisionDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-post-review-decision-'));
    const decisionPath = path.join(decisionDirectory, 'decision.json');
    fs.writeFileSync(decisionPath, JSON.stringify({
      schemaVersion: '1.0.0', requestId: request.id, outcome: 'approved', actor: 'local-user',
      justification: 'Approve only the reviewed bytes', nextAction: null,
    }), { mode: 0o600 });
    const consumed = await adapter.consumeDecision({ ...context, lock: handle, decisionFile: decisionPath });
    assert.equal(consumed.classification, 'stale');
    write(worktree.path, 'src/output.txt', 'approved byte sequence\nTOKEN=secret\n');
    const restoredDiff = adapter.collectChanges({ ...context, lock: handle, step, attempt: 1, worktree });
    const restored = await adapter.revalidate({
      ...context, lock: handle, step, attempt: 1, attemptId: worktree.attemptId,
      worktreeId: worktree.worktreeId, trigger: 'on-resume',
    });
    assert.equal(restored.ok, true);
    const renewed = adapter.checkpoint({
      ...context, lock: handle, step, attempt: 1, status: 'AWAITING_DIFF_APPROVAL',
      attemptId: worktree.attemptId, worktreeId: worktree.worktreeId,
      assessment: validation.riskAssessments[0].assessment, worktree,
      diff: restoredDiff, gates, scope: { logicalFileCount: 1, unpredicted: [] }, review,
      renewStale: true,
    });
    assert.notEqual(renewed.id, request.id);
    assert.equal(renewed.status, 'pending');
    const renewedState = JSON.parse(fs.readFileSync(path.join(runtimeRoot, 'state.json'), 'utf8'));
    assert.deepEqual(renewedState.steps[0].risk.requests.map((entry) => entry.status), ['stale', 'pending']);
    const replanDecisionPath = path.join(decisionDirectory, 'replan-decision.json');
    fs.writeFileSync(replanDecisionPath, JSON.stringify({
      schemaVersion: '1.0.0', requestId: renewed.id, outcome: 'rejected', actor: 'local-user',
      justification: 'Discard this attempt and replan', nextAction: 'replan',
    }), { mode: 0o600 });
    crashAfterDiscard = true;
    await assert.rejects(
      adapter.consumeDecision({ ...context, lock: handle, decisionFile: replanDecisionPath }),
      { code: 'TEST_CRASH' },
    );
    assert.equal(fs.existsSync(worktree.path), false);
    const interruptedState = JSON.parse(fs.readFileSync(path.join(runtimeRoot, 'state.json'), 'utf8'));
    assert.equal(interruptedState.worktrees[0].status, 'removal-pending');
    assert.equal(interruptedState.state, 'CANCELLED');
    assert.equal(interruptedState.steps[0].state, 'CANCELLED');
    adapter.releaseLock(handle);

    const resumedAdapter = createLocalAdapter({ repoRoot: root, runProcess: fakeProcess, modules });
    handle = resumedAdapter.acquireLock(context);
    resumedAdapter.openRun({ ...context, lock: handle, resume: true });
    const discardedState = JSON.parse(fs.readFileSync(path.join(runtimeRoot, 'state.json'), 'utf8'));
    assert.equal(discardedState.worktrees[0].status, 'removed');
    assert.equal(discardedState.attempts[0].status, 'cancelled');
    fs.rmSync(decisionDirectory, { recursive: true, force: true });
  } finally {
    if (handle && !handle.released) adapter.releaseLock(handle);
    spawnSync('chmod', ['-R', 'u+w', root], { shell: false });
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('default adapter reviews an actual closed snapshot while retaining its lock through persistence', async () => {
  const { root, validation } = fixture();
  const policy = await riskPolicyModule.loadRiskPolicyFromGit(root, validation.baseSha);
  validation.steps[0].schemaVersion = '2.0.0';
  validation.steps[0].changeType = 'documentation';
  validation.riskPolicy = policy.value;
  validation.riskAssessments = [{
    stepId: validation.steps[0].id,
    assessment: riskPolicyModule.assessRisk({ policyRecord: policy.value, step: validation.steps[0] }),
  }];
  validation.spec.execution.autoCommit = true;
  validation.spec.budgets.maxAttemptsPerStep = 3;
  validation.spec.budgets.maxAttemptsTotal = 3;
  validation.spec.budgets.maxAgentCallsPerStep = 5;
  validation.spec.budgets.maxAgentCallsTotal = 5;
  validation.spec.budgets.maxReviewCyclesPerStep = 3;
  validation.spec.budgets.maxReviewCyclesTotal = 3;
  validation.steps[0].budgets.maxAgentCalls = 5;
  validation.steps[0].budgets.maxReviewCycles = 3;
  validation.steps[0].budgets.maxAttempts = 3;
  const reviewOutput = JSON.stringify({
    schemaVersion: '1.0.0', decision: 'approved_with_findings', summary: 'Closed snapshot is valid.', confidence: 'high',
    findings: [{
      id: 'finding-medium', category: 'maintainability', status: 'open', severity: 'medium', autoFixEligible: false,
      file: 'src/output.txt', line: 1, title: 'Keep the output concise', description: 'The output can be simplified later.',
      evidence: ['src/output.txt:1'], impact: 'Minor maintenance cost.', suggestedCorrection: null, acceptanceTest: null,
      boundaryViolation: false, invariantViolation: false,
    }],
  });
  const modules = {
    sandbox: testSandboxModule(),
    opencode: {
      ...opencodeModule,
      createOpenCodeAdapter({ artifacts }) {
        return {
          async invoke(input) {
            if (input.role === 'executor') {
              write(input.worktree, 'src/output.txt', 'provider output\n');
            }
            const artifactRef = await artifacts.preserveAgentResponse({
              operationId: input.operationId, role: input.role, attempt: input.attempt,
              response: input.role === 'reviewer' ? reviewOutput : 'Implementei o passo. Resultado factual: arquivo criado.', process: { status: 'succeeded' },
              sandboxPolicyHash: input.sandboxPolicy.policyHash,
            });
            return { ok: true, operationId: input.operationId, artifactRef, metrics: { estimatedCost: null, tokens: null } };
          },
        };
      },
    },
  };
  try {
    const run = await orchestrator.run({ specPath: validation.specPath, baseSha: validation.baseSha, allowCommit: true }, {
      repoRoot: root, validationResult: validation, runProcess: fakeProcess, modules,
    });
    assert.equal(run.status, 'SUCCEEDED', JSON.stringify(run));
    assert.equal(run.steps[0].attempt, 1);
    const statePath = path.join(root, '.workflow-runtime', 'runs', 'run-pipeline', 'state.json');
    const completedState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    assert.equal(completedState.findings.some((finding) => finding.summary === 'Keep the output concise'), true);
    const localGates = completedState.artifacts.filter((entry) => entry.kind === 'gate-result' && entry.provenance.stepId === validation.steps[0].id);
    const globalGates = completedState.artifacts.filter((entry) => entry.kind === 'gate-result' && entry.provenance.stepId === null);
    assert.equal(localGates.length, 2);
    assert.equal(globalGates.length, 2);
    assert.ok(localGates.every((entry) => entry.path.includes(`${validation.steps[0].id}/attempt-1/`)));
    assert.ok(globalGates.every((entry) => entry.path.includes('global/attempt-1/')));
    const localHashes = localGates.map((entry) => entry.hash);
    const globalDirectory = path.join(root, '.workflow-runtime', 'runs', 'run-pipeline', 'artifacts', 'global', 'attempt-1');
    const originalManifestBytes = fs.readFileSync(path.join(globalDirectory, 'manifest.json'));
    const originalManifest = JSON.parse(originalManifestBytes);
    const originalReviewRefs = originalManifest.artifacts.filter((entry) => ['review', 'findings-backlog'].includes(entry.kind));
    const originalReviewBytes = new Map(originalReviewRefs.map((entry) => [entry.id, fs.readFileSync(path.join(root, '.workflow-runtime', 'runs', 'run-pipeline', entry.path))]));
    const reviewed = await orchestrator.review({ specPath: validation.specPath }, {
      repoRoot: root, validationResult: validation, runProcess: fakeProcess, modules,
    });
    const reviewedAgain = await orchestrator.review({ specPath: validation.specPath }, {
      repoRoot: root, validationResult: validation, runProcess: fakeProcess, modules,
    });
    assert.equal(reviewed.ok, true);
    assert.equal(reviewedAgain.ok, true);
    assert.equal(reviewed.readOnly, true);
    const reviewedState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    assert.deepEqual(reviewedState.artifacts.filter((entry) => localGates.some((local) => local.id === entry.id)).map((entry) => entry.hash), localHashes);
    assert.deepEqual(fs.readFileSync(path.join(globalDirectory, 'manifest.json')), originalManifestBytes);
    for (const ref of originalReviewRefs) {
      assert.deepEqual(fs.readFileSync(path.join(root, '.workflow-runtime', 'runs', 'run-pipeline', ref.path)), originalReviewBytes.get(ref.id));
    }
    const artifactRoot = path.join(root, '.workflow-runtime', 'runs', 'run-pipeline', 'artifacts');
    const reviewDirectories = fs.readdirSync(artifactRoot).filter((name) => name.startsWith('review-op-'));
    assert.equal(reviewDirectories.length, 2);
    for (const reviewId of reviewDirectories) {
      const manifest = JSON.parse(fs.readFileSync(path.join(artifactRoot, reviewId, 'attempt-1', 'manifest.json'), 'utf8'));
      assert.deepEqual(new Set(manifest.artifacts.map((entry) => entry.kind)), new Set(['review', 'findings-backlog', 'review-outcome']));
      assert.ok(manifest.artifacts.every((entry) => entry.path.includes(`artifacts/${reviewId}/attempt-1/`)));
    }
    assert.equal(fs.existsSync(path.join(root, '.workflow-runtime', 'locks', 'repository.lock')), false);
  } finally {
    const snapshots = path.join(root, '.workflow-runtime', 'runs', 'run-pipeline', 'snapshots');
    if (fs.existsSync(snapshots)) {
      for (const name of fs.readdirSync(snapshots)) fs.chmodSync(path.join(snapshots, name), 0o700);
    }
    const cleanupRoot = `${root}-cleanup`;
    fs.renameSync(root, cleanupRoot);
    fs.rmSync(cleanupRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
});
