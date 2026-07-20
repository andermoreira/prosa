'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { deriveDag, deriveDagFromSteps } = require('./lib/dag.cjs');
const { transitionRun, transitionStep } = require('./lib/state-machine.cjs');
const {
  acquireLock,
  createInitialRunState,
  identifyRepository,
  readRunState,
  releaseLock,
  writeRunState,
} = require('./lib/runtime.cjs');

const HASH = 'a'.repeat(64);
const SHA = 'b'.repeat(40);

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function temporaryRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-state-'));
  git(root, ['init', '-q']);
  git(root, ['config', 'user.name', 'Workflow Test']);
  git(root, ['config', 'user.email', 'workflow@example.invalid']);
  fs.writeFileSync(path.join(root, 'README.md'), '# fixture\n');
  git(root, ['add', 'README.md']);
  git(root, ['commit', '-qm', 'fixture']);
  return root;
}

function step(id, sequence, dependsOn = []) {
  return {
    schemaVersion: '1.0.0', id, sequence, specId: 'pipeline',
    source: { path: `specs/steps/${id}.md`, hash: SHA, baseSha: SHA },
    goal: `Implement ${id}.`,
    boundaries: { inScope: ['Runtime'], outOfScope: ['Agents'], maxLogicalFiles: 5 },
    dependsOn,
    predictedFiles: [`scripts/${id}.cjs`], allowedAreas: ['scripts'],
    resources: { executor: 'opencode', reviewer: 'reviewer', diagnostician: 'diagnostician', notifications: [] },
    context: { specPath: 'specs/pipeline.md', stepPath: `specs/steps/${id}.md`, baseSha: SHA, implementationNoteIds: [] },
    acceptanceCriteria: [{ id: 'AC-01', evidence: [{ id: 'EVIDENCE-01', kind: 'test', description: 'Tests pass.' }] }],
    budgets: { maxAttempts: 2, maxAgentCalls: 3, maxReviewCycles: 1, maxDiagnosisCycles: 1, maxElapsedMinutes: 10, maxEstimatedCost: null, maxTokens: null },
    verification: { gateIds: ['state'] }, revalidation: { triggers: ['after-lock'], driftPolicy: 'block' },
    documentationImpact: { kind: 'none', justification: 'Runtime is ephemeral.' },
    testing: { required: true, gateIds: ['state'], rationale: null },
    execution: { adapter: 'opencode', isolation: 'git-worktree', writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false },
  };
}

function writeStep(root, value, includeDependencies = true) {
  const filePath = path.join(root, `${value.id}.md`);
  const frontMatter = { ...value };
  if (!includeDependencies) delete frontMatter.dependsOn;
  fs.writeFileSync(filePath, `---\n${JSON.stringify(frontMatter)}\n---\n# ${value.id}\n`);
  return filePath;
}

function metric(limit = 2) {
  return { limit, consumed: 0, reserved: 0 };
}

function counters() {
  return {
    attempts: metric(), agentCalls: metric(),
    agentCallsByRole: { executor: 0, reviewer: 0, diagnostician: 0 },
    reviewCycles: metric(), diagnosisCycles: metric(), elapsedMinutes: metric(10),
    estimatedCost: { limit: null, consumed: null, reserved: 0 },
    tokens: { limit: null, consumed: null, reserved: 0 },
  };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function runState(handle) {
  const timestamp = '2026-07-16T00:00:00.000Z';
  const assessment = {
    schemaVersion: '1.0.0', policy: { schemaVersion: '1.0.0', hash: HASH, origin: { type: 'test' } },
    step: { schemaVersion: '1.0.0', changeType: null }, typeLevel: 'restricted', baseLevel: 'restricted',
    effectiveLevel: 'restricted', matchedAreaRules: [], signals: [],
    legacySignal: { kind: 'legacy-step-without-change-type', minimumLevel: 'restricted', reason: 'Legacy step is restricted' },
  };
  assessment.hash = crypto.createHash('sha256').update(JSON.stringify(canonical(assessment))).digest('hex');
  return createInitialRunState(handle, {
    baseSha: SHA, parentSha: SHA,
    spec: { id: 'pipeline', path: 'specs/pipeline.md', hash: HASH, stepsHash: HASH, notesHash: HASH, schemasHash: HASH, catalogsHash: HASH, policyHash: HASH, dagHash: HASH },
    usage: {
      revision: 0, total: counters(), perStep: [{ stepId: 'pipeline-step-1', counters: counters() }], reservations: [],
      timing: { totalActiveMs: 0, activeMsByStep: { 'pipeline-step-1': 0 } },
    },
    steps: [{ id: 'pipeline-step-1', state: 'PENDING', parentSha: SHA, attemptIds: [], worktreeId: null, gateIds: ['state'], evidence: [], findingIds: [], commitIds: [], updatedAt: timestamp, cause: null }],
    riskAssessments: [{ stepId: 'pipeline-step-1', assessment }],
    createdAt: timestamp,
  });
}

test('DAG comes from explicit step front matter with deterministic topological order', () => {
  const root = temporaryRepository();
  try {
    const paths = [
      writeStep(root, step('pipeline-step-3', 3, ['pipeline-step-1'])),
      writeStep(root, step('pipeline-step-2', 2, ['pipeline-step-1'])),
      writeStep(root, step('pipeline-step-1', 1)),
    ];
    const dag = deriveDag(paths);
    assert.deepEqual(dag.order, ['pipeline-step-1', 'pipeline-step-2', 'pipeline-step-3']);
    assert.deepEqual(deriveDag(paths.reverse()).order, dag.order);
    // executeWorkflow iterates dag.steps, not dag.order, so the two must not be allowed to drift:
    // this is what makes execution order topological by construction rather than by a later check.
    assert.deepEqual(dag.steps.map((entry) => entry.id), dag.order);
    assert.match(dag.hash, /^[0-9a-f]{64}$/);

    const missing = writeStep(root, step('pipeline-step-4', 4), false);
    assert.throws(() => deriveDag([missing]), { code: 'DAG_DEPENDENCIES_REQUIRED' });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('DAG rejects duplicate IDs, missing/self/duplicate dependencies, and cycles', () => {
  const first = step('pipeline-step-1', 1);
  const second = step('pipeline-step-2', 2, ['pipeline-step-1']);
  assert.throws(() => deriveDagFromSteps([first, { ...first }]), { code: 'DAG_DUPLICATE_ID' });
  assert.throws(() => deriveDagFromSteps([{ ...second, dependsOn: ['pipeline-step-9'] }]), { code: 'DAG_UNKNOWN_DEPENDENCY' });
  assert.throws(() => deriveDagFromSteps([{ ...first, dependsOn: [first.id] }]), { code: 'DAG_SELF_DEPENDENCY' });
  assert.throws(() => deriveDagFromSteps([first, { ...second, dependsOn: [first.id, first.id] }]), { code: 'DAG_DUPLICATE_DEPENDENCY' });
  assert.throws(() => deriveDagFromSteps([{ ...first, dependsOn: [second.id] }, second]), { code: 'DAG_CYCLE' });
});

test('state machine enforces listed transitions and explicit preconditions', () => {
  const root = temporaryRepository();
  const handle = acquireLock({ cwd: root, runId: 'run-transitions', specPath: 'specs/pipeline.md' });
  try {
    let state = runState(handle);
    assert.throws(() => transitionRun(state, 'RUNNING', { cause: 'skip' }), { code: 'STATE_TRANSITION_INVALID' });
    state = transitionRun(state, 'VALIDATED', { cause: 'contracts valid' });
    assert.throws(() => transitionRun(state, 'LOCKED', { cause: 'lock omitted' }), { code: 'STATE_PRECONDITION_FAILED' });
    state = transitionRun(state, 'LOCKED', { cause: 'lock acquired', lockHeld: true });
    state = transitionStep(state, 'pipeline-step-1', 'READY', { cause: 'dependencies accepted', dependenciesAccepted: true });
    assert.throws(() => transitionStep(state, 'pipeline-step-1', 'WORKTREE_READY', { cause: 'missing worktree' }), { code: 'STATE_PRECONDITION_FAILED' });
    state = transitionStep(state, 'pipeline-step-1', 'WORKTREE_READY', { cause: 'worktree ready', worktreeReady: true });
    state = transitionStep(state, 'pipeline-step-1', 'EXECUTING', { cause: 'revalidated', revalidated: true });
    assert.throws(() => transitionStep(state, 'pipeline-step-1', 'RETRY_PENDING', { cause: 'retry' }), { code: 'STATE_PRECONDITION_FAILED' });
    state = transitionStep(state, 'pipeline-step-1', 'RETRY_PENDING', { cause: 'transient failure', retryEligible: true, budgetAvailable: true });
    assert.equal(state.steps[0].state, 'RETRY_PENDING');

    let blocked = transitionRun(state, 'BLOCKED', { cause: 'operator action required', lockHeld: true });
    assert.throws(() => transitionRun(blocked, 'VALIDATED', { cause: 'unsafe resume' }), { code: 'STATE_PRECONDITION_FAILED' });
    blocked = transitionRun(blocked, 'VALIDATED', { cause: 'resume revalidated', resumeRequested: true, lockHeld: true, revalidated: true });
    assert.equal(blocked.state, 'VALIDATED');
  } finally {
    releaseLock(handle);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('HITL waits are real states and approvals fail closed when stale or incomplete', () => {
  const root = temporaryRepository();
  const handle = acquireLock({ cwd: root, runId: 'run-hitl-transitions', specPath: 'specs/pipeline.md' });
  try {
    let state = runState(handle);
    state = transitionStep(state, 'pipeline-step-1', 'READY', { cause: 'dependencies accepted', dependenciesAccepted: true });
    assert.throws(
      () => transitionStep(state, 'pipeline-step-1', 'AWAITING_PRE_APPROVAL', { cause: 'request omitted', lockHeld: true }),
      { code: 'STATE_PRECONDITION_FAILED' },
    );
    state = transitionStep(state, 'pipeline-step-1', 'AWAITING_PRE_APPROVAL', {
      cause: 'pre-execution approval requested', lockHeld: true, preApprovalRequestPending: true,
    });
    assert.equal(state.steps[0].state, 'AWAITING_PRE_APPROVAL');
    assert.throws(
      () => transitionStep(state, 'pipeline-step-1', 'READY', { cause: 'stale approval', lockHeld: true, approvalStale: true, revalidated: true }),
      { code: 'STATE_PRECONDITION_FAILED' },
    );
    state = transitionStep(state, 'pipeline-step-1', 'READY', {
      cause: 'current approval consumed', lockHeld: true, approvalSatisfied: true, revalidated: true,
    });
    state = transitionStep(state, 'pipeline-step-1', 'WORKTREE_READY', { cause: 'worktree ready', worktreeReady: true });
    state = transitionStep(state, 'pipeline-step-1', 'EXECUTING', { cause: 'revalidated', revalidated: true });
    state = transitionStep(state, 'pipeline-step-1', 'GATING', { cause: 'execution succeeded', executionSucceeded: true });
    state = transitionStep(state, 'pipeline-step-1', 'REVALIDATING', { cause: 'gates passed', gatesPassed: true });
    state = transitionStep(state, 'pipeline-step-1', 'REVIEWING', { cause: 'evidence revalidated', revalidated: true });
    state = transitionStep(state, 'pipeline-step-1', 'AWAITING_DIFF_APPROVAL', {
      cause: 'reviewed diff approval requested', lockHeld: true, reviewPassed: true, diffApprovalRequestPending: true,
    });
    assert.equal(state.steps[0].state, 'AWAITING_DIFF_APPROVAL');
    assert.throws(
      () => transitionStep(state, 'pipeline-step-1', 'CANCELLED', { cause: 'rejection action omitted', lockHeld: true, approvalRejected: true }),
      { code: 'STATE_PRECONDITION_FAILED' },
    );
    const rejected = transitionStep(state, 'pipeline-step-1', 'CANCELLED', {
      cause: 'operator selected abort', lockHeld: true, approvalRejected: true,
      rejectionActionCancel: true, rejectionActionAbort: true,
    });
    assert.equal(rejected.steps[0].state, 'CANCELLED');
    assert.throws(
      () => transitionStep(state, 'pipeline-step-1', 'ACCEPTING', { cause: 'approval omitted', lockHeld: true, revalidated: true }),
      { code: 'STATE_PRECONDITION_FAILED' },
    );
    state = transitionStep(state, 'pipeline-step-1', 'ACCEPTING', {
      cause: 'reviewed diff approval consumed', lockHeld: true, approvalSatisfied: true, revalidated: true,
    });
    assert.equal(state.steps[0].state, 'ACCEPTING');
  } finally {
    releaseLock(handle);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('HITL rejection permits only explicit retry, replan, or abort transitions', () => {
  const root = temporaryRepository();
  const handle = acquireLock({ cwd: root, runId: 'run-hitl-rejection', specPath: 'specs/pipeline.md' });
  try {
    let state = runState(handle);
    state = transitionStep(state, 'pipeline-step-1', 'READY', { cause: 'dependencies accepted', dependenciesAccepted: true });
    state = transitionStep(state, 'pipeline-step-1', 'AWAITING_PRE_APPROVAL', {
      cause: 'pre-execution approval requested', lockHeld: true, preApprovalRequestPending: true,
    });
    assert.throws(
      () => transitionStep(state, 'pipeline-step-1', 'FAILED', { cause: 'generic failure' }),
      { code: 'STATE_TRANSITION_INVALID' },
    );
    assert.throws(
      () => transitionStep(state, 'pipeline-step-1', 'RETRY_PENDING', {
        cause: 'retry action omitted', lockHeld: true, approvalRejected: true, retryEligible: true, budgetAvailable: true,
      }),
      { code: 'STATE_PRECONDITION_FAILED' },
    );
    assert.throws(
      () => transitionStep(state, 'pipeline-step-1', 'RETRY_PENDING', {
        cause: 'abort cannot retry', lockHeld: true, approvalRejected: true, rejectionActionAbort: true,
        retryEligible: true, budgetAvailable: true,
      }),
      { code: 'STATE_PRECONDITION_FAILED' },
    );
    assert.throws(
      () => transitionStep(state, 'pipeline-step-1', 'RETRY_PENDING', {
        cause: 'retry without budget', lockHeld: true, approvalRejected: true, rejectionActionRetry: true, retryEligible: true,
      }),
      { code: 'STATE_PRECONDITION_FAILED' },
    );
    const retry = transitionStep(state, 'pipeline-step-1', 'RETRY_PENDING', {
      cause: 'operator selected retry', lockHeld: true, approvalRejected: true, rejectionActionRetry: true,
      retryEligible: true, budgetAvailable: true,
    });
    assert.equal(retry.steps[0].state, 'RETRY_PENDING');
    const replan = transitionStep(state, 'pipeline-step-1', 'CANCELLED', {
      cause: 'operator selected replan', lockHeld: true, approvalRejected: true,
      rejectionActionCancel: true, rejectionActionReplan: true,
    });
    assert.equal(replan.steps[0].state, 'CANCELLED');
    const abort = transitionStep(state, 'pipeline-step-1', 'CANCELLED', {
      cause: 'operator selected abort', lockHeld: true, approvalRejected: true,
      rejectionActionCancel: true, rejectionActionAbort: true,
    });
    assert.equal(abort.steps[0].state, 'CANCELLED');
  } finally {
    releaseLock(handle);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('primary worktree owns one atomic repository lock and concurrent acquisition fails', () => {
  const root = temporaryRepository();
  const linked = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-linked-'));
  fs.rmSync(linked, { recursive: true });
  git(root, ['worktree', 'add', '-q', '-b', 'linked-test', linked]);
  const first = acquireLock({ cwd: linked, runId: 'run-first', specPath: 'specs/pipeline.md' });
  try {
    assert.equal(first.repository.realRoot, fs.realpathSync(root));
    assert.ok(first.paths.lock.startsWith(path.join(fs.realpathSync(root), '.workflow-runtime')));
    assert.throws(
      () => acquireLock({ cwd: root, runId: 'run-second', specPath: 'specs/pipeline.md' }),
      { code: 'LOCK_CONCURRENT' },
    );
  } finally {
    releaseLock(first);
    git(root, ['worktree', 'remove', '--force', linked]);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('orphan removal is explicit and validates process absence and repository identity', () => {
  const root = temporaryRepository();
  const stale = acquireLock({ cwd: root, runId: 'run-stale', specPath: 'specs/pipeline.md' });
  stale.removeTraps();
  const ownerPath = path.join(stale.paths.lock, 'owner.json');
  const owner = JSON.parse(fs.readFileSync(ownerPath, 'utf8'));
  owner.pid = 99999999;
  fs.writeFileSync(ownerPath, `${JSON.stringify(owner)}\n`);
  stale.released = true;
  try {
    assert.throws(
      () => acquireLock({ cwd: root, runId: 'run-recovery', specPath: 'specs/pipeline.md' }),
      { code: 'LOCK_CONCURRENT' },
    );
    assert.throws(
      () => acquireLock({ cwd: root, runId: 'run-recovery', specPath: 'specs/pipeline.md', removeOrphanLock: true }),
      { code: 'LOCK_RECOVERY_CONFIRMATION_REQUIRED' },
    );
    owner.repoIdentity = HASH;
    fs.writeFileSync(ownerPath, `${JSON.stringify(owner)}\n`);
    assert.throws(
      () => acquireLock({ cwd: root, runId: 'run-recovery', specPath: 'specs/pipeline.md', removeOrphanLock: true, confirmedBy: 'operator' }),
      { code: 'LOCK_IDENTITY_MISMATCH' },
    );
    owner.repoIdentity = identifyRepository(root).identity;
    fs.writeFileSync(ownerPath, `${JSON.stringify(owner)}\n`);
    const recovered = acquireLock({ cwd: root, runId: 'run-recovery', specPath: 'specs/pipeline.md', removeOrphanLock: true, confirmedBy: 'operator' });
    assert.equal(recovered.owner.recovery.processAbsenceProven, true);
    assert.equal(recovered.owner.recovery.identityMatched, true);
    releaseLock(recovered);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('run state is schema-valid, ownership-checked, and atomically replaced', () => {
  const root = temporaryRepository();
  const handle = acquireLock({ cwd: root, runId: 'run-state', specPath: 'specs/pipeline.md' });
  try {
    const initial = runState(handle);
    writeRunState(handle, initial);
    assert.deepEqual(readRunState(handle), initial);
    assert.deepEqual(initial.steps[0].sandbox, { policyVersion: '1', applications: [] });

    assert.equal(initial.schemaVersion, '3.0.0');
    assert.equal(initial.spec.riskPolicyHash, HASH);
    assert.equal(initial.steps[0].risk.assessment.evaluatedAt, initial.createdAt);

    const legacy = { ...initial, schemaVersion: '2.0.0' };
    assert.throws(() => writeRunState(handle, legacy), { code: 'STATE_RISK_VERSION_REQUIRED' });

    fs.writeFileSync(handle.paths.state, `${JSON.stringify(legacy)}\n`);
    assert.throws(() => readRunState(handle), { code: 'STATE_RISK_VERSION_REQUIRED' });
    writeRunState(handle, initial);

    const policyDrift = structuredClone(initial);
    policyDrift.spec.riskPolicyHash = 'c'.repeat(64);
    assert.throws(() => writeRunState(handle, policyDrift), { code: 'STATE_REFERENCE_INVALID' });

    const invalid = { ...initial, state: 'SUCCEEDED' };
    assert.throws(() => writeRunState(handle, invalid), { code: 'STATE_HISTORY_INVALID' });
    assert.deepEqual(readRunState(handle), initial, 'failed writes must not replace valid state');

    const validated = transitionRun(initial, 'VALIDATED', { cause: 'schema valid', at: '2026-07-16T00:01:00.000Z' });
    writeRunState(handle, validated);
    assert.equal(readRunState(handle).revision, 1);
    const leftovers = fs.readdirSync(path.dirname(handle.paths.state)).filter((name) => name.endsWith('.tmp'));
    assert.deepEqual(leftovers, []);
  } finally {
    releaseLock(handle);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('state persists complete HITL bindings and single-use consumption references', () => {
  const root = temporaryRepository();
  const handle = acquireLock({ cwd: root, runId: 'run-hitl-state', specPath: 'specs/pipeline.md' });
  try {
    let state = transitionRun(runState(handle), 'VALIDATED', { cause: 'schema valid', at: '2026-07-16T00:01:00.000Z' });
    const transitionId = state.transitions[0].id;
    const binding = {
      repoIdentity: state.repo.identity, runId: state.runId, baseSha: state.repo.baseSha,
      specHash: state.spec.hash, stepsHash: state.spec.stepsHash, stepId: state.steps[0].id,
      stepHash: HASH, policyHash: state.spec.riskPolicyHash, assessmentHash: state.steps[0].risk.assessment.hash,
    };
    state.artifacts.push({
      id: 'artifact-approval-context', kind: 'approval-context', path: 'artifacts/approval-context.json',
      mediaType: 'application/json', schemaVersion: '1.0.0', hash: HASH,
      provenance: { runId: state.runId, stepId: state.steps[0].id, attemptId: null, sourceHash: HASH },
      sensitivity: 'restricted', retention: 'run', sanitization: 'sanitized', createdAt: '2026-07-16T00:01:00.000Z',
    });
    state.steps[0].risk.requests.push({
      id: 'approval-pipeline-step-1-pre', checkpoint: 'pre-execution', status: 'satisfied',
      contextArtifactRef: 'artifact-approval-context', binding, createdAt: '2026-07-16T00:01:00.000Z',
    });
    state.steps[0].risk.decisions.push({
      schemaVersion: '1.0.0', id: 'decision-pipeline-step-1-pre', requestId: 'approval-pipeline-step-1-pre',
      outcome: 'approved', nextAction: null, actor: 'local-user', justification: 'Risk reviewed and accepted',
      binding, recordedAt: '2026-07-16T00:02:00.000Z', consumedAt: '2026-07-16T00:02:00.000Z',
      consumedByTransitionId: transitionId,
    });
    writeRunState(handle, state);
    assert.deepEqual(readRunState(handle).steps[0].risk.requests[0].binding, binding);

    const rebound = structuredClone(state);
    rebound.steps[0].risk.decisions[0].binding.assessmentHash = 'c'.repeat(64);
    assert.throws(() => writeRunState(handle, rebound), { code: 'STATE_REFERENCE_INVALID' });
    const tamperedAssessment = structuredClone(state);
    tamperedAssessment.steps[0].risk.assessment.effectiveLevel = 'autonomous';
    assert.throws(() => writeRunState(handle, tamperedAssessment), { code: 'STATE_REFERENCE_INVALID' });
    const forgedConsumption = structuredClone(state);
    forgedConsumption.steps[0].risk.decisions[0].consumedByTransitionId = 'transition-not-recorded';
    assert.throws(() => writeRunState(handle, forgedConsumption), { code: 'STATE_REFERENCE_INVALID' });
    assert.deepEqual(readRunState(handle), state, 'invalid HITL state must not replace persisted state');
  } finally {
    releaseLock(handle);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runtime rejects schema-valid orphan references without replacing persisted state', () => {
  const root = temporaryRepository();
  const handle = acquireLock({ cwd: root, runId: 'run-references', specPath: 'specs/pipeline.md' });
  try {
    const initial = runState(handle);
    writeRunState(handle, initial);
    const orphan = structuredClone(initial);
    orphan.steps[0].attemptIds.push('attempt-pipeline-step-1-1');
    assert.throws(() => writeRunState(handle, orphan), { code: 'STATE_REFERENCE_INVALID' });
    assert.deepEqual(readRunState(handle), initial);

    const attempt = structuredClone(initial);
    attempt.steps[0].attemptIds.push('attempt-pipeline-step-1-1');
    attempt.attempts.push({
      id: 'attempt-pipeline-step-1-1', stepId: 'pipeline-step-1', number: 1, role: 'executor', status: 'failed',
      startedAt: '2026-07-16T00:00:00.000Z', finishedAt: '2026-07-16T00:01:00.000Z',
      artifactIds: ['artifact-missing'], failureClassification: null, sandboxPolicyHash: null,
    });
    assert.throws(() => writeRunState(handle, attempt), { code: 'STATE_REFERENCE_INVALID' });
  } finally {
    releaseLock(handle);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
