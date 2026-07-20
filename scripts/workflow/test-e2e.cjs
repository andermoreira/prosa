'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const { loadCatalogsFromFilesystem } = require('./lib/catalogs.cjs');
const orchestrator = require('./lib/orchestrator.cjs');
const { assessRisk, validateRiskPolicySource } = require('./lib/risk-policy.cjs');

const ROOT = path.resolve(__dirname, '../..');
const SPEC = 'specs/automated-spec-pipeline.md';
const RISK_POLICY_SOURCE = fs.readFileSync(path.join(ROOT, 'workflow/risk-policy.yaml'), 'utf8');

function loadApprovedRiskPolicy(_root, baseSha) {
  return validateRiskPolicySource(RISK_POLICY_SOURCE, {
    type: 'git', baseSha: baseSha.toLowerCase(), path: 'workflow/risk-policy.yaml',
  });
}

function workflowDependencies(adapter) {
  return {
    repoRoot: ROOT,
    adapter,
    loadCatalogs: (root) => loadCatalogsFromFilesystem(root),
    loadRiskPolicy: loadApprovedRiskPolicy,
  };
}

function makeAutonomous(validation, selected = validation.steps) {
  for (const step of selected) {
    step.schemaVersion = '2.0.0';
    step.changeType = 'documentation';
    step.predictedFiles = [`docs/${step.id}.md`];
    step.allowedAreas = ['docs'];
  }
  validation.riskAssessments = validation.steps.map((step) => ({
    stepId: step.id,
    assessment: assessRisk({ policyRecord: validation.riskPolicy, step }),
  }));
  return validation;
}

function fakeAdapter(options = {}) {
  const calls = [];
  const gateExecutions = [];
  const persisted = options.persisted || { status: 'LOCKED', steps: [] };
  const worktrees = new Map();
  const adapter = {
    calls,
    gateExecutions,
    persisted,
    runId: () => 'run-e2e',
    async preflight(input) {
      calls.push('preflight');
      adapter.preflightInput = input;
      if (options.budgetExhausted) { const error = new Error('budget exhausted'); error.code = 'BUDGET_EXCEEDED'; throw error; }
    },
    async acquireLock() {
      calls.push('lock');
      if (options.locked) { const error = new Error('concurrent run'); error.code = 'LOCK_CONCURRENT'; throw error; }
      return { id: 'fake-lock' };
    },
    async releaseLock() { calls.push('unlock'); },
    async openRun({ resume }) { calls.push(resume ? 'open:resume' : 'open:run'); return persisted; },
    async consumeDecision({ decisionFile }) {
      calls.push('decision');
      const decision = JSON.parse(fs.readFileSync(decisionFile, 'utf8'));
      if (options.staleDecision) return { classification: 'stale', state: persisted };
      const current = persisted.steps.find((step) => step.approval?.id === decision.requestId);
      if (!current) throw Object.assign(new Error('request mismatch'), { code: 'HITL_REQUEST_MISMATCH' });
      current.approval = { ...current.approval, status: decision.outcome === 'approved' ? 'satisfied' : 'rejected' };
      if (decision.outcome === 'approved') current.status = current.approval.checkpoint === 'pre-execution' ? 'READY' : 'ACCEPTING';
      if (decision.nextAction === 'retry') current.status = 'RETRY_PENDING';
      if (decision.nextAction === 'replan') { current.status = 'CANCELLED'; persisted.status = 'CANCELLED'; }
      if (decision.nextAction === 'abort') { current.status = 'CANCELLED'; persisted.status = 'CANCELLED'; }
      return { classification: decision.outcome === 'approved' ? 'satisfied' : 'rejected', nextAction: decision.nextAction, state: persisted };
    },
    async checkpoint(input) {
      calls.push(`state:${input.status}`);
      if (options.persistResumeFails && input.status === 'RUNNING') throw Object.assign(new Error('state write failed'), { code: 'STATE_WRITE_FAILED' });
      if (input.step?.id) {
        const value = { id: input.step.id, status: input.status, attempt: input.attempt, commit: input.commit };
        const index = persisted.steps.findIndex((step) => step.id === input.step.id);
        if (index < 0) persisted.steps.push(value); else persisted.steps[index] = value;
      }
      if (['BLOCKED', 'AWAITING_HUMAN'].includes(input.status)) persisted.status = 'BLOCKED';
      if (input.status === 'SUCCEEDED') { persisted.status = 'SUCCEEDED'; persisted.steps = input.steps; }
      if (input.status === 'AWAITING_PRE_APPROVAL') {
        const approval = options.preApproved
          ? { id: `approval-${input.step.id}-pre-execution-${input.attempt}`, checkpoint: 'pre-execution', status: 'satisfied', binding: { assessmentHash: input.assessment.hash } }
          : { id: `approval-${input.step.id}-pre-execution-${input.attempt}`, checkpoint: 'pre-execution', status: 'pending', binding: { assessmentHash: input.assessment.hash } };
        const current = persisted.steps.find((step) => step.id === input.step.id);
        current.approval = approval;
        current.riskAssessment = input.assessment;
        current.attempt = input.attempt - 1;
        return approval;
      }
      if (input.status === 'AWAITING_DIFF_APPROVAL') {
        adapter.diffApprovalInput = input;
        return {
          id: `approval-${input.step.id}-post-review-${input.attempt}`,
          checkpoint: 'post-review', status: options.diffApproved ? 'satisfied' : 'pending',
          binding: { diffHash: options.diffHash || 'd'.repeat(64), reviewHash: options.reviewHash || 'e'.repeat(64) },
        };
      }
    },
    async revalidate({ trigger }) {
      calls.push(`revalidate:${trigger}`);
      const checks = { hashes: true, base: true, catalog: true, lock: true, worktree: true, state: true, artifacts: true };
      if (options.drift === trigger) return { ok: false, factualTrigger: trigger, checks: { ...checks, hashes: false } };
      return { ok: true, factualTrigger: trigger, checks };
    },
    async createAttempt({ step, attempt }) {
      calls.push(`worktree:${step.id}:${attempt}`);
      const value = {
        path: options.attemptRoots?.[attempt - 1] || options.attemptRoot || ROOT,
        attemptId: `attempt-${step.id}-${attempt}`, worktreeId: `worktree-${step.id}-${attempt}`,
      };
      worktrees.set(value.worktreeId, value.path);
      return value;
    },
    async invoke({ role, step }) {
      calls.push(`${role}:${step.id}`);
      if (options.failExecutorOnce && role === 'executor' && !adapter.failed) {
        adapter.failed = true;
        const error = new Error('transient'); error.code = 'RATE_LIMITED'; throw error;
      }
      if (options.failExecutorDeterministic && role === 'executor') {
        const error = new Error('deterministic'); error.code = 'STEP_GATE_FAILED'; throw error;
      }
      return { ok: true, artifactRef: { id: `${role}-${step.id}` } };
    },
    async collectChanges({ step }) { calls.push(`diff:${step.id}`); return { changes: [] }; },
    async recordRiskSignals({ step, signals, validation }) {
      calls.push(`risk:${signals[0].kind}`);
      const initial = validation.riskAssessments.find((entry) => entry.stepId === step.id).assessment;
      const previous = adapter.riskAssessments?.get(step.id) || initial;
      adapter.riskAssessments ||= new Map();
      const assessment = assessRisk({
        policyRecord: validation.riskPolicy, step,
        signals: [...previous.signals, ...signals], previousEffectiveLevel: previous.effectiveLevel,
      });
      adapter.riskAssessments.set(step.id, assessment);
      return assessment;
    },
    async runGate({ id, worktree, scope, attemptId, worktreeId }) {
      calls.push(`gate:${id}`);
      gateExecutions.push({ id, scope: scope || 'local', attemptId, worktreeId, worktree: worktree?.path || worktree });
      return { ok: true, resultRef: `${scope || 'local'}/${attemptId}/${id}` };
    },
    async reviewStep({ step }) {
      calls.push(`review:${step.id}`);
      const findings = options.reviewFindings || [];
      return {
        decision: findings.some((finding) => ['critical', 'high'].includes(finding.severity)) ? 'changes_requested' : 'approved',
        findings, artifactRef: { id: `artifact-review-${step.id}` }, assessment: options.reviewAssessment,
      };
    },
    async acceptStep({ step, review }) {
      calls.push(`accept:${step.id}`);
      if (review.findings?.some((finding) => ['critical', 'high'].includes(finding.severity))) {
        return { ok: false, status: 'rejected', reasons: [{ code: 'BLOCKING_FINDING' }] };
      }
      return options.awaitingAcceptance
        ? { ok: false, status: 'awaiting_human', reasons: [{ code: 'UNPREDICTED_PATH_AWAITING_HUMAN' }] }
        : { ok: true, status: 'accepted' };
    },
    async commitStep({ step, attempt }) { calls.push(`commit:${step.id}`); return { sha: `${String(step.sequence).padStart(2, '0')}${'a'.repeat(38)}`, attempt }; },
    async reconcileStep({ persisted, step }) {
      calls.push('reconcile');
      return options.reconcileCommitted ? { id: step.id, status: 'COMMITTED', attempt: persisted.attempt, commit: { sha: 'c'.repeat(40) } } : persisted;
    },
    async reviewGlobal(input) { calls.push('review:global'); adapter.globalReviewInput = input; return { decision: 'approved', findings: [], mutated: options.mutateReview === true }; },
    async acceptGlobal() { calls.push('accept:global'); return { ok: true, status: 'accepted' }; },
    async writeReports(input) { calls.push('reports'); adapter.reportInput = input; return { report: 'fake', retrospective: 'fake' }; },
    async createPullRequest() { calls.push('pr'); return { ok: true, status: 'created', url: 'https://github.com/example/repo/pull/1' }; },
    async notify() { calls.push('notify'); },
    async openReviewSnapshot() { calls.push('snapshot'); return { closed: true, hash: 'b'.repeat(64) }; },
    async cleanupStep(step) { calls.push(`cleanup:${step.worktreeId}`); },
    integratedWorktree(input) { return options.integratedRoot || worktrees.get(input.steps.at(-1).worktreeId) || ROOT; },
  };
  return adapter;
}

// Narrows the real spec to its first step so a test can drive the production path over one step
// without the other nineteen. The validation is real — only the DAG is trimmed to match.
async function singleStepRun(adapter, { autoCommit = true, allowCommit = true, mode = 'run' } = {}) {
  const dependencies = workflowDependencies(adapter);
  const validation = await orchestrator.validate({ specPath: SPEC }, dependencies);
  const step = validation.steps[0];
  validation.steps = [step];
  validation.riskAssessments = validation.riskAssessments.filter((entry) => entry.stepId === step.id);
  makeAutonomous(validation, [step]);
  validation.dag = { order: [step.id], dependencies: { [step.id]: [] }, hash: validation.dag.hash };
  validation.spec.execution.autoCommit = autoCommit;
  dependencies.validationResult = validation;
  const options = { specPath: SPEC, baseSha: validation.baseSha, allowCommit };
  const run = await orchestrator[mode](options, { ...dependencies, validationResult: validation });
  return { run, step, validation, dependencies };
}

test('risk, commit, and PR authorizations remain independent across the full matrix', async () => {
  for (const risk of ['autonomous', 'restricted']) {
    for (const [autoCommit, allowCommit, createPr] of [
      [false, false, false], [false, false, true], [false, true, false], [false, true, true],
      [true, false, false], [true, false, true], [true, true, false], [true, true, true],
    ]) {
      const adapter = fakeAdapter({ preApproved: true, diffApproved: true });
      const dependencies = workflowDependencies(adapter);
      const validation = await orchestrator.validate({ specPath: SPEC }, dependencies);
      const step = validation.steps[0];
      validation.steps = [step];
      validation.dag = { order: [step.id], dependencies: { [step.id]: [] }, hash: validation.dag.hash };
      if (risk === 'autonomous') makeAutonomous(validation, [step]);
      else validation.riskAssessments = validation.riskAssessments.slice(0, 1);
      validation.spec.execution.autoCommit = autoCommit;
      const run = await orchestrator.run({
        specPath: SPEC, baseSha: validation.baseSha, allowCommit, createPr,
      }, { ...dependencies, validationResult: validation });
      const commitAuthorized = autoCommit && allowCommit;
      const label = `${risk}/${autoCommit}/${allowCommit}/${createPr}`;
      assert.equal(adapter.calls.includes(`commit:${step.id}`), commitAuthorized, label);
      assert.equal(adapter.calls.includes('pr'), commitAuthorized && createPr, label);
      assert.equal(run.steps[0].status, commitAuthorized ? 'COMMITTED' : 'AWAITING_COMMIT', label);
    }
  }
});

test('classifies legacy and mixed v2 steps from the approved-base policy before effects', async () => {
  const adapter = fakeAdapter();
  const dependencies = workflowDependencies(adapter);
  const validation = await orchestrator.validate({ specPath: SPEC }, dependencies);
  assert.ok(validation.riskAssessments.length > 1);
  assert.ok(validation.riskAssessments.every(({ assessment }) => (
    assessment.baseLevel === 'restricted'
    && assessment.effectiveLevel === 'restricted'
    && assessment.legacySignal?.kind === 'legacy-step-without-change-type'
  )));
  for (const behaviorType of [null, 'feature', 'documentation']) {
    const candidate = structuredClone(validation.steps[0]);
    candidate.boundaries.inScope = candidate.boundaries.inScope.filter((entry) => !entry.startsWith('behaviorType='));
    if (behaviorType) candidate.boundaries.inScope.push(`behaviorType=${behaviorType}`);
    const assessment = assessRisk({ policyRecord: validation.riskPolicy, step: candidate });
    assert.equal(assessment.effectiveLevel, 'restricted', behaviorType || 'without behaviorType');
    assert.equal(assessment.legacySignal.kind, 'legacy-step-without-change-type');
  }

  const legacy = validation.steps[0];
  const modern = validation.steps[1];
  modern.schemaVersion = '2.0.0';
  modern.changeType = 'documentation';
  modern.predictedFiles = ['docs/example.md'];
  modern.allowedAreas = ['docs'];
  validation.steps = [legacy, modern];
  validation.riskAssessments = validation.steps.map((step) => ({
    stepId: step.id,
    assessment: assessRisk({ policyRecord: validation.riskPolicy, step }),
  }));
  validation.dag = {
    order: validation.steps.map((step) => step.id),
    dependencies: Object.fromEntries(validation.steps.map((step) => [step.id, step.dependsOn])),
    hash: validation.dag.hash,
  };
  validation.spec.execution.autoCommit = true;
  const run = await orchestrator.run({ specPath: SPEC, baseSha: validation.baseSha, allowCommit: true }, {
    ...dependencies, validationResult: validation,
  });
  assert.equal(run.code, 'RISK_APPROVAL_REQUIRED');
  assert.equal(adapter.preflightInput.validation.riskAssessments[0].assessment.effectiveLevel, 'restricted');
  assert.equal(adapter.preflightInput.validation.riskAssessments[1].assessment.effectiveLevel, 'autonomous');
  assert.equal(adapter.calls.some((call) => call.startsWith('worktree:') || call.startsWith('executor:')), false);
});

test('legacy and approvable levels pause before effects while v2 autonomous proceeds', async () => {
  for (const level of ['legacy', 'approval_required', 'restricted', 'autonomous']) {
    const adapter = fakeAdapter();
    const dependencies = workflowDependencies(adapter);
    const validation = await orchestrator.validate({ specPath: SPEC }, dependencies);
    const step = validation.steps[0];
    validation.steps = [step];
    validation.dag = { order: [step.id], dependencies: { [step.id]: [] }, hash: validation.dag.hash };
    if (level !== 'legacy') {
      step.schemaVersion = '2.0.0';
      step.changeType = level === 'autonomous' ? 'documentation' : level === 'restricted' ? 'security' : 'feature';
      step.predictedFiles = [`docs/${step.id}.md`];
      step.allowedAreas = ['docs'];
    }
    validation.riskAssessments = [{ stepId: step.id, assessment: assessRisk({ policyRecord: validation.riskPolicy, step }) }];
    validation.spec.execution.autoCommit = true;
    const run = await orchestrator.run({ specPath: SPEC, baseSha: validation.baseSha, allowCommit: true }, {
      ...dependencies, validationResult: validation,
    });
    const mutableEffects = adapter.calls.filter((call) => call.startsWith('worktree:') || call.startsWith('executor:'));
    if (level === 'autonomous') {
      assert.equal(run.status, 'SUCCEEDED');
      assert.equal(mutableEffects.length, 2);
    } else {
      assert.equal(run.code, 'RISK_APPROVAL_REQUIRED');
      assert.equal(run.awaitingApproval, true);
      assert.deepEqual(mutableEffects, []);
      assert.ok(adapter.calls.indexOf('state:AWAITING_PRE_APPROVAL') < adapter.calls.indexOf('unlock'));
      const resumed = await orchestrator.resume({ specPath: SPEC, baseSha: validation.baseSha, allowCommit: true }, {
        ...dependencies, validationResult: validation,
      });
      assert.equal(resumed.code, 'RISK_APPROVAL_REQUIRED');
      assert.deepEqual(adapter.calls.filter((call) => call.startsWith('worktree:') || call.startsWith('executor:')), []);
    }
  }
});

test('resume consumes a bound decision only after lock and revalidation', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-resume-decision-'));
  test.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const adapter = fakeAdapter();
  const dependencies = workflowDependencies(adapter);
  const validation = await orchestrator.validate({ specPath: SPEC }, dependencies);
  const step = validation.steps[0];
  validation.steps = [step];
  validation.riskAssessments = validation.riskAssessments.slice(0, 1);
  validation.dag = { order: [step.id], dependencies: { [step.id]: [] }, hash: validation.dag.hash };
  validation.spec.execution.autoCommit = true;
  const requestId = `approval-${step.id}-pre-execution-1`;
  adapter.persisted.status = 'RUNNING';
  adapter.persisted.steps = [{
    id: step.id, status: 'AWAITING_PRE_APPROVAL', attempt: 0,
    approval: { id: requestId, checkpoint: 'pre-execution', status: 'pending', binding: { assessmentHash: validation.riskAssessments[0].assessment.hash } },
  }];
  const decisionFile = path.join(directory, 'decision.json');
  fs.writeFileSync(decisionFile, JSON.stringify({
    schemaVersion: '1.0.0', requestId, outcome: 'approved', actor: 'local-user',
    justification: 'Risk reviewed', nextAction: null,
  }), { mode: 0o600 });

  const resumed = await orchestrator.resume({
    specPath: SPEC, baseSha: validation.baseSha, allowCommit: true, decisionFile,
  }, { ...dependencies, validationResult: validation });

  assert.equal(resumed.code, 'RISK_APPROVAL_REQUIRED');
  assert.ok(adapter.calls.indexOf('lock') < adapter.calls.indexOf('revalidate:on-resume'));
  assert.ok(adapter.calls.indexOf('revalidate:on-resume') < adapter.calls.indexOf('decision'));
  assert.ok(adapter.calls.indexOf('decision') < adapter.calls.indexOf(`worktree:${step.id}:1`));
  assert.equal(adapter.calls.filter((call) => call === `executor:${step.id}`).length, 1);
  assert.equal(adapter.calls.includes(`commit:${step.id}`), false);
});

test('stale decisions fail closed and rejection requires retry, replan, or abort without correction', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-rejections-'));
  test.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const baseAdapter = fakeAdapter();
  const validation = await orchestrator.validate({ specPath: SPEC }, workflowDependencies(baseAdapter));
  const step = validation.steps[0];
  validation.steps = [step];
  validation.riskAssessments = validation.riskAssessments.slice(0, 1);
  validation.dag = { order: [step.id], dependencies: { [step.id]: [] }, hash: validation.dag.hash };
  const requestId = `approval-${step.id}-pre-execution-1`;

  for (const action of ['retry', 'replan', 'abort']) {
    const persisted = {
      status: 'RUNNING',
      steps: [{ id: step.id, status: 'AWAITING_PRE_APPROVAL', attempt: action === 'retry' ? 1 : 0,
        approval: { id: requestId, checkpoint: 'pre-execution', status: 'pending', binding: { assessmentHash: validation.riskAssessments[0].assessment.hash } } }],
    };
    const adapter = fakeAdapter({ persisted });
    const decisionFile = path.join(directory, `${action}.json`);
    fs.writeFileSync(decisionFile, JSON.stringify({
      schemaVersion: '1.0.0', requestId, outcome: 'rejected', actor: 'local-user',
      justification: `Selected ${action}`, nextAction: action,
    }), { mode: 0o600 });
    const result = await orchestrator.resume({ specPath: SPEC, baseSha: validation.baseSha, decisionFile }, {
      ...workflowDependencies(adapter), validationResult: validation,
    });
    if (action === 'retry') assert.equal(result.code, 'RISK_APPROVAL_REQUIRED');
    if (action === 'replan') {
      assert.equal(result.code, 'RISK_REPLAN_REQUIRED');
      assert.equal(result.status, 'CANCELLED');
    }
    if (action === 'abort') assert.equal(result.code, 'RISK_ABORTED');
    assert.equal(result.correctionStep, undefined);
    assert.equal(adapter.calls.some((call) => call.startsWith('diagnostician:')), false);
  }

  const staleAdapter = fakeAdapter({
    staleDecision: true,
    persisted: { status: 'RUNNING', steps: [{ id: step.id, status: 'AWAITING_PRE_APPROVAL', attempt: 0,
      approval: { id: requestId, checkpoint: 'pre-execution', status: 'pending', binding: { assessmentHash: validation.riskAssessments[0].assessment.hash } } }] },
  });
  const staleFile = path.join(directory, 'stale.json');
  fs.writeFileSync(staleFile, JSON.stringify({
    schemaVersion: '1.0.0', requestId, outcome: 'approved', actor: 'local-user',
    justification: 'Old binding', nextAction: null,
  }), { mode: 0o600 });
  const stale = await orchestrator.resume({ specPath: SPEC, baseSha: validation.baseSha, decisionFile: staleFile }, {
    ...workflowDependencies(staleAdapter), validationResult: validation,
  });
  assert.equal(stale.code, 'HITL_DECISION_STALE');
  assert.equal(staleAdapter.calls.some((call) => call.startsWith('worktree:') || call.startsWith('executor:')), false);
});

test('a retry requires approval bound to the new attempt and assessment before effects', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-retry-approval-'));
  test.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const baseAdapter = fakeAdapter();
  const validation = await orchestrator.validate({ specPath: SPEC }, workflowDependencies(baseAdapter));
  const step = validation.steps[0];
  step.schemaVersion = '2.0.0';
  step.changeType = 'feature';
  step.predictedFiles = [`docs/${step.id}.md`];
  step.allowedAreas = ['docs'];
  validation.steps = [step];
  validation.riskAssessments = [{ stepId: step.id, assessment: assessRisk({ policyRecord: validation.riskPolicy, step }) }];
  validation.dag = { order: [step.id], dependencies: { [step.id]: [] }, hash: validation.dag.hash };
  const assessment = validation.riskAssessments[0].assessment;
  const requestId = `approval-${step.id}-pre-execution-1`;
  const persisted = {
    status: 'RUNNING',
    steps: [{
      id: step.id, status: 'READY', attempt: 0,
      approval: { id: requestId, checkpoint: 'pre-execution', status: 'satisfied', binding: { assessmentHash: assessment.hash } },
    }],
  };
  const adapter = fakeAdapter({ persisted, failExecutorOnce: true });

  const resumed = await orchestrator.resume({ specPath: SPEC, baseSha: validation.baseSha }, {
    ...workflowDependencies(adapter), validationResult: validation,
  });

  assert.equal(resumed.code, 'RISK_APPROVAL_REQUIRED');
  assert.equal(adapter.calls.filter((call) => call.startsWith('worktree:')).length, 1);
  assert.equal(adapter.calls.filter((call) => call.startsWith('executor:')).length, 1);
  assert.equal(adapter.calls.includes('risk:retry'), true);
  assert.equal(adapter.calls.includes('state:AWAITING_PRE_APPROVAL'), true);

  const retryRequest = adapter.persisted.steps[0].approval;
  const decisionFile = path.join(directory, 'decision.json');
  fs.writeFileSync(decisionFile, JSON.stringify({
    schemaVersion: '1.0.0', requestId: retryRequest.id, outcome: 'approved', actor: 'local-user',
    justification: 'Approve the second attempt', nextAction: null,
  }), { mode: 0o600 });
  const secondResume = await orchestrator.resume({
    specPath: SPEC, baseSha: validation.baseSha, decisionFile,
  }, { ...workflowDependencies(adapter), validationResult: validation });
  assert.equal(secondResume.code, 'COMMIT_AWAITING_HUMAN');
  assert.equal(adapter.calls.filter((call) => call.startsWith('worktree:')).length, 2);
  assert.equal(adapter.calls.filter((call) => call.startsWith('executor:')).length, 2);
  assert.equal(adapter.calls.filter((call) => call === 'state:AWAITING_PRE_APPROVAL').length, 1);
});

test('restricted v1 pauses after review with the exact diff binding before acceptance', async () => {
  const adapter = fakeAdapter({ preApproved: true, diffHash: '1'.repeat(64), reviewHash: '2'.repeat(64) });
  const dependencies = workflowDependencies(adapter);
  const validation = await orchestrator.validate({ specPath: SPEC }, dependencies);
  const step = validation.steps[0];
  validation.steps = [step];
  validation.riskAssessments = validation.riskAssessments.slice(0, 1);
  validation.dag = { order: [step.id], dependencies: { [step.id]: [] }, hash: validation.dag.hash };
  validation.spec.execution.autoCommit = true;

  const run = await orchestrator.run({ specPath: SPEC, baseSha: validation.baseSha, allowCommit: true }, {
    ...dependencies, validationResult: validation,
  });

  assert.equal(step.schemaVersion, '1.0.0');
  assert.equal(run.code, 'RISK_APPROVAL_REQUIRED');
  assert.equal(run.approval.checkpoint, 'post-review');
  assert.equal(run.approval.binding.diffHash, '1'.repeat(64));
  assert.equal(run.approval.binding.reviewHash, '2'.repeat(64));
  assert.ok(adapter.calls.indexOf(`review:${step.id}`) < adapter.calls.indexOf('revalidate:after-review'));
  assert.ok(adapter.calls.indexOf('revalidate:after-review') < adapter.calls.indexOf('state:AWAITING_DIFF_APPROVAL'));
  assert.equal(adapter.calls.includes(`accept:${step.id}`), false);
  assert.equal(adapter.calls.includes(`commit:${step.id}`), false);
});

test('a step escalated to restricted only by the local review receives the same post-review checkpoint', async () => {
  const adapter = fakeAdapter({ reviewAssessment: { effectiveLevel: 'restricted', hash: '3'.repeat(64) } });
  const dependencies = workflowDependencies(adapter);
  const validation = await orchestrator.validate({ specPath: SPEC }, dependencies);
  const step = validation.steps[0];
  validation.steps = [step];
  validation.riskAssessments = validation.riskAssessments.slice(0, 1);
  validation.dag = { order: [step.id], dependencies: { [step.id]: [] }, hash: validation.dag.hash };
  makeAutonomous(validation, [step]);
  validation.spec.execution.autoCommit = true;

  const run = await orchestrator.run({ specPath: SPEC, baseSha: validation.baseSha, allowCommit: true }, {
    ...dependencies, validationResult: validation,
  });

  assert.equal(run.code, 'RISK_APPROVAL_REQUIRED');
  assert.equal(run.approval.checkpoint, 'post-review');
  assert.equal(adapter.calls.includes('state:AWAITING_PRE_APPROVAL'), false);
  assert.equal(adapter.calls.includes(`accept:${step.id}`), false);
});

test('a high finding escalates through the envelope but remains technically blocking after risk approval', async () => {
  const adapter = fakeAdapter({
    diffApproved: true,
    reviewFindings: [{ id: 'finding-high-1', severity: 'high', title: 'Blocking defect' }],
  });
  const dependencies = workflowDependencies(adapter);
  const validation = await orchestrator.validate({ specPath: SPEC }, dependencies);
  const step = validation.steps[0];
  validation.steps = [step];
  validation.riskAssessments = validation.riskAssessments.slice(0, 1);
  validation.dag = { order: [step.id], dependencies: { [step.id]: [] }, hash: validation.dag.hash };
  makeAutonomous(validation, [step]);
  validation.spec.execution.autoCommit = true;

  const run = await orchestrator.run({ specPath: SPEC, baseSha: validation.baseSha, allowCommit: true }, {
    ...dependencies, validationResult: validation,
  });

  assert.equal(adapter.riskAssessments.get(step.id).effectiveLevel, 'restricted');
  assert.equal(adapter.riskAssessments.get(step.id).signals[0].kind, 'high-finding');
  assert.equal(run.code, 'LOCAL_ACCEPTANCE_REJECTED');
  assert.equal(adapter.calls.includes(`accept:${step.id}`), true);
  assert.equal(adapter.calls.includes(`commit:${step.id}`), false);
});

test('policy drift and invalid or incomplete v2 steps block before adapter effects', async () => {
  const drifted = fakeAdapter();
  await assert.rejects(
    orchestrator.run({ specPath: SPEC, baseSha: 'f24be0c353e28b370018b65ea3163908fa72e2cb' }, {
      ...workflowDependencies(drifted),
      loadRiskPolicy: async () => ({ ok: false, errors: [{ code: 'GIT_RISK_POLICY_READ_ERROR' }] }),
    }),
    { code: 'RISK_POLICY_INVALID' },
  );
  assert.deepEqual(drifted.calls, []);

  const unknown = fakeAdapter();
  const dependencies = workflowDependencies(unknown);
  const validation = await orchestrator.validate({ specPath: SPEC }, dependencies);
  validation.steps = [validation.steps[0]];
  validation.steps[0].schemaVersion = '3.0.0';
  validation.riskAssessments = validation.riskAssessments.slice(0, 1);
  await assert.rejects(
    orchestrator.run({ specPath: SPEC, baseSha: validation.baseSha }, { ...dependencies, validationResult: validation }),
    { code: 'RISK_STEP_VERSION_INVALID' },
  );
  assert.deepEqual(unknown.calls, []);

  const missingType = fakeAdapter();
  const missingDependencies = workflowDependencies(missingType);
  const missingValidation = await orchestrator.validate({ specPath: SPEC }, missingDependencies);
  missingValidation.steps = [missingValidation.steps[0]];
  missingValidation.steps[0].schemaVersion = '2.0.0';
  delete missingValidation.steps[0].changeType;
  missingValidation.riskAssessments = missingValidation.riskAssessments.slice(0, 1);
  await assert.rejects(
    orchestrator.run({ specPath: SPEC, baseSha: missingValidation.baseSha }, {
      ...missingDependencies, validationResult: missingValidation,
    }),
    { code: 'RISK_CHANGE_TYPE_UNKNOWN' },
  );
  assert.deepEqual(missingType.calls, []);
});

// processStep accepts both spellings of the committed status and returns the adapter's object as
// it came; the global phase accepts only the upper-case one. Persisted state cannot reach here
// spelling it lower-case — readRunState rejects it against state.schema.json, whose stepState enum
// is upper-case only — but nothing validates what an adapter returns, so this seam is the one way
// in. The check exists to block it; without it, an out-of-contract adapter would carry a step the
// global phase never confirmed straight into gates and global acceptance.
test('a step the adapter reconciles out of contract does not reach the global phase', async () => {
  const adapter = fakeAdapter({ persisted: { status: 'RUNNING', steps: [] } });
  adapter.reconcileStep = async ({ step, persisted }) => {
    adapter.calls.push('reconcile');
    return { id: step.id, status: 'committed', attempt: persisted.attempt, commit: { sha: 'c'.repeat(40) } };
  };
  const dependencies = workflowDependencies(adapter);
  const validation = await orchestrator.validate({ specPath: SPEC }, dependencies);
  const step = validation.steps[0];
  validation.steps = [step];
  validation.riskAssessments = validation.riskAssessments.filter((entry) => entry.stepId === step.id);
  validation.dag = { order: [step.id], dependencies: { [step.id]: [] }, hash: validation.dag.hash };
  makeAutonomous(validation, [step]);
  validation.spec.execution.autoCommit = true;
  adapter.persisted.steps = [{ id: step.id, status: 'ACCEPTED', attempt: 1 }];
  const run = await orchestrator.resume({ specPath: SPEC, baseSha: validation.baseSha, allowCommit: true }, {
    ...dependencies, validationResult: validation,
  });
  assert.equal(run.code, 'GLOBAL_STEPS_NOT_COMMITTED');
  assert.equal(run.ok, false);
  assert.equal(adapter.calls.some((call) => call.startsWith('gate:')), false);
  assert.equal(adapter.calls.includes('accept:global'), false);
});

// The global gates are the union of the required steps' testing.gateIds, and step 1 declares one,
// so a second is declared here to reach a gate that fails after another already passed. Both ids
// are real catalog gates. The local gates from verification.gateIds run first and share an id with
// the global ones, so every assertion goes through gateExecutions, which records scope.
test('a failing global gate blocks the run at that gate, after revalidating the ones before it', async () => {
  const adapter = fakeAdapter();
  const runGate = adapter.runGate;
  adapter.runGate = async (input) => {
    const result = await runGate(input);
    return input.scope === 'global' && input.id === 'verify-pack' ? { ...result, ok: false } : result;
  };
  const dependencies = workflowDependencies(adapter);
  const validation = await orchestrator.validate({ specPath: SPEC }, dependencies);
  const step = validation.steps[0];
  validation.steps = [step];
  validation.riskAssessments = validation.riskAssessments.filter((entry) => entry.stepId === step.id);
  validation.dag = { order: [step.id], dependencies: { [step.id]: [] }, hash: validation.dag.hash };
  makeAutonomous(validation, [step]);
  validation.spec.execution.autoCommit = true;
  step.testing.gateIds = ['workflow-tests', 'verify-pack'];
  const run = await orchestrator.run({ specPath: SPEC, baseSha: validation.baseSha, allowCommit: true }, {
    ...dependencies, validationResult: validation,
  });
  assert.equal(run.code, 'GLOBAL_GATE_FAILED');
  assert.equal(run.gateId, 'verify-pack');
  const globalGates = adapter.gateExecutions.filter((entry) => entry.scope === 'global').map((entry) => entry.id);
  assert.deepEqual(globalGates, ['workflow-tests', 'verify-pack']);
  // The gate that passed was revalidated before the next one ran; the one that failed was not.
  assert.ok(adapter.calls.indexOf('gate:workflow-tests') < adapter.calls.indexOf('revalidate:after-global-gate:workflow-tests'));
  assert.ok(adapter.calls.indexOf('revalidate:after-global-gate:workflow-tests') < adapter.calls.lastIndexOf('gate:verify-pack'));
  assert.equal(adapter.calls.includes('revalidate:after-global-gate:verify-pack'), false);
  assert.equal(adapter.calls.includes('review:global'), false);
  assert.equal(adapter.calls.includes('accept:global'), false);
});

// The agent call is fenced by a revalidation on each side (orchestrator.cjs:797 and :799). Drift on
// the near side must stop the call from happening; drift on the far side must stop the step even
// though the agent already ran and its output looks fine — the evidence it produced was gathered
// against a base that has since moved, so it cannot be accepted.
test('drift before the agent call prevents it; drift after it invalidates the call that already ran', async () => {
  const before = fakeAdapter({ drift: 'before-agent-call' });
  const beforeRun = await singleStepRun(before);
  assert.equal(beforeRun.run.code, 'REVALIDATION_DRIFT');
  assert.equal(before.calls.some((call) => call.startsWith('executor:')), false);

  const after = fakeAdapter({ drift: 'after-agent-call' });
  const afterRun = await singleStepRun(after);
  assert.equal(afterRun.run.code, 'REVALIDATION_DRIFT');
  assert.equal(after.calls.filter((call) => call.startsWith('executor:')).length, 1);
  // The call happened, so it is charged and its evidence is dropped: no gate, review or acceptance
  // may run on top of it.
  assert.equal(after.calls.some((call) => call.startsWith('gate:')), false);
  assert.equal(after.calls.some((call) => call.startsWith('review:')), false);
  assert.equal(after.calls.some((call) => call.startsWith('accept:')), false);
});

test('validate and dry-run wrappers use real contracts, DAG, and filesystem catalogs', () => {
  const commands = [
    ['validate-spec.sh', [SPEC]],
    ['run-spec.sh', [SPEC, '--dry-run']],
  ];
  for (const [wrapper, args] of commands) {
    const result = spawnSync('bash', [path.join(__dirname, wrapper), ...args], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.ok, true);
    assert.equal(output.dag.order.length, output.steps.length);
  }
});

test('CLI run executes sequential attempts and resume does not repeat calls or commits', async () => {
  const firstAttemptRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-attempt-1-'));
  const secondAttemptRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-attempt-2-'));
  test.after(() => fs.rmSync(firstAttemptRoot, { recursive: true, force: true }));
  test.after(() => fs.rmSync(secondAttemptRoot, { recursive: true, force: true }));
  const adapter = fakeAdapter({ failExecutorOnce: true, preApproved: true, attemptRoots: [firstAttemptRoot, secondAttemptRoot] });
  const originalLoad = workflowDependencies(adapter).loadCatalogs;
  const dependencies = workflowDependencies(adapter);
  dependencies.loadCatalogs = originalLoad;
  dependencies.adapter = adapter;
  const validation = await orchestrator.validate({ specPath: SPEC }, dependencies);
  validation.steps = [validation.steps[0]];
  validation.riskAssessments = validation.riskAssessments.slice(0, 1);
  validation.dag = { order: [validation.steps[0].id], dependencies: { [validation.steps[0].id]: [] }, hash: validation.dag.hash };
  makeAutonomous(validation);
  validation.spec.execution.autoCommit = true;
  dependencies.validationResult = validation;
  const run = await orchestrator.run({ specPath: SPEC, baseSha: validation.baseSha, allowCommit: true }, {
    ...dependencies,
    validationResult: validation,
  });
  assert.equal(run.status, 'SUCCEEDED');
  assert.equal(run.correctionStep, undefined);
  assert.equal(adapter.calls.includes('diagnostician:spec-automated-pipeline-step-1'), false);
  const effects = adapter.calls.filter((call) => call.startsWith('executor:') || call.startsWith('review:') || call.startsWith('commit:')).length;
  const resumed = await orchestrator.resume({ specPath: SPEC, baseSha: validation.baseSha, allowCommit: true }, { ...dependencies, validationResult: validation });
  assert.equal(resumed.status, 'SUCCEEDED');
  assert.equal(adapter.calls.filter((call) => call.startsWith('executor:') || call.startsWith('review:') || call.startsWith('commit:')).length, effects);
  assert.ok(adapter.calls.indexOf('gate:workflow-tests') < adapter.calls.indexOf('review:global'));
  assert.ok(adapter.calls.indexOf('gate:verify-pack') < adapter.calls.indexOf('review:global'));
  assert.equal(run.steps[0].attempt, 2);
  assert.ok(adapter.gateExecutions.some((entry) => entry.scope === 'local' && entry.worktree === secondAttemptRoot));
  assert.ok(adapter.gateExecutions.some((entry) => entry.scope === 'global' && entry.worktree === secondAttemptRoot));
  assert.equal(adapter.gateExecutions.some((entry) => entry.worktree === firstAttemptRoot), false);
  assert.equal(adapter.gateExecutions.some((entry) => entry.worktree === ROOT), false);
  assert.ok(adapter.gateExecutions.filter((entry) => entry.scope === 'global').every((entry) => entry.attemptId.endsWith('-2')));
  assert.equal(adapter.calls.includes(`cleanup:${run.steps[0].worktreeId}`), true);
  assert.equal(adapter.globalReviewInput.attemptId, run.steps[0].attemptId);
  assert.equal(adapter.globalReviewInput.worktreeId, run.steps[0].worktreeId);
  assert.equal(adapter.globalReviewInput.latestRevalidation.factualTrigger, 'before-final-review');
  assert.ok(adapter.reportInput.revalidations.every((entry) => entry.factualTrigger === entry.trigger));
});

test('BLOCKED resume persists explicit run and step recovery before effects while terminal states remain closed', async () => {
  const baseAdapter = fakeAdapter();
  const validation = await orchestrator.validate({ specPath: SPEC }, workflowDependencies(baseAdapter));
  makeAutonomous(validation);
  validation.spec.execution.autoCommit = true;
  const first = validation.steps[0];
  const persisted = { status: 'BLOCKED', causeResolved: true, steps: [{ id: first.id, status: 'BLOCKED', attempt: 1 }] };
  const adapter = fakeAdapter({ persisted, preApproved: true });
  const result = await orchestrator.resume({ specPath: SPEC, baseSha: validation.baseSha, allowCommit: true }, {
    ...workflowDependencies(adapter), validationResult: validation,
  });
  assert.equal(result.status, 'SUCCEEDED');
  assert.ok(adapter.calls.indexOf('revalidate:on-resume') < adapter.calls.indexOf('state:RUNNING'));
  assert.ok(adapter.calls.indexOf('state:RUNNING') < adapter.calls.indexOf('state:READY'));
  assert.ok(adapter.calls.indexOf('state:READY') < adapter.calls.indexOf(`worktree:${first.id}:2`));

  const failedPersistence = fakeAdapter({
    persisted: { status: 'BLOCKED', causeResolved: true, steps: [{ id: first.id, status: 'BLOCKED', attempt: 1 }] },
    persistResumeFails: true,
  });
  await assert.rejects(orchestrator.resume({ specPath: SPEC, baseSha: validation.baseSha }, {
    ...workflowDependencies(failedPersistence), validationResult: validation,
  }), { code: 'STATE_WRITE_FAILED' });
  assert.equal(failedPersistence.calls.some((call) => call.startsWith('worktree:')), false);

  const unresolved = fakeAdapter({ persisted: { status: 'BLOCKED', causeResolved: false, steps: [{ id: first.id, status: 'BLOCKED', attempt: 1 }] } });
  const unresolvedResult = await orchestrator.resume({ specPath: SPEC, baseSha: validation.baseSha }, {
    ...workflowDependencies(unresolved), validationResult: validation,
  });
  assert.equal(unresolvedResult.code, 'BLOCKED_CAUSE_UNRESOLVED');
  assert.equal(unresolved.calls.some((call) => call.startsWith('state:') || call.startsWith('worktree:')), false);

  for (const status of ['FAILED', 'CANCELLED']) {
    const terminal = fakeAdapter({ persisted: { status, steps: [] } });
    const closed = await orchestrator.resume({ specPath: SPEC, baseSha: validation.baseSha }, {
      ...workflowDependencies(terminal), validationResult: validation,
    });
    assert.equal(closed.status, status);
    assert.equal(closed.terminal, true);
    assert.equal(terminal.calls.some((call) => call.startsWith('state:') || call.startsWith('revalidate:') || call.startsWith('worktree:')), false);
  }
});

test('mutable run requires an explicit base SHA before adapter effects', async () => {
  const adapter = fakeAdapter();
  const validation = await orchestrator.validate({ specPath: SPEC }, workflowDependencies(adapter));
  await assert.rejects(orchestrator.run({ specPath: SPEC }, { ...workflowDependencies(adapter), validationResult: validation }), { code: 'BASE_SHA_REQUIRED' });
  assert.deepEqual(adapter.calls, []);
});

test('deterministic failure blocks step and run without retry or diagnosis', async () => {
  const adapter = fakeAdapter({ failExecutorDeterministic: true });
  const validation = await orchestrator.validate({ specPath: SPEC }, workflowDependencies(adapter));
  makeAutonomous(validation);
  validation.spec.execution.autoCommit = true;
  const result = await orchestrator.run({ specPath: SPEC, baseSha: validation.baseSha, allowCommit: true }, {
    ...workflowDependencies(adapter), validationResult: validation,
  });
  assert.equal(result.blocked, true);
  assert.equal(adapter.persisted.status, 'BLOCKED');
  assert.equal(adapter.calls.filter((call) => call.startsWith('executor:')).length, 1);
  assert.equal(adapter.calls.some((call) => call.startsWith('diagnostician:')), false);
});

test('human acceptance pauses without retrying or diagnosing', async () => {
  const adapter = fakeAdapter({ awaitingAcceptance: true });
  const validation = await orchestrator.validate({ specPath: SPEC }, workflowDependencies(adapter));
  makeAutonomous(validation);
  validation.spec.execution.autoCommit = true;
  const result = await orchestrator.run({ specPath: SPEC, baseSha: validation.baseSha, allowCommit: true }, {
    ...workflowDependencies(adapter), validationResult: validation,
  });
  assert.equal(result.awaitingHuman, true);
  assert.equal(result.code, 'ACCEPTANCE_AWAITING_HUMAN');
  assert.equal(adapter.persisted.status, 'BLOCKED');
  assert.equal(adapter.calls.filter((call) => call.startsWith('executor:')).length, 1);
  assert.equal(adapter.calls.some((call) => call.startsWith('diagnostician:')), false);
});

test('default wait resumes through reconciliation without repeating the agent', async () => {
  const adapter = fakeAdapter({ reconcileCommitted: true });
  const validation = await orchestrator.validate({ specPath: SPEC }, workflowDependencies(adapter));
  makeAutonomous(validation);
  validation.spec.execution.autoCommit = false;
  const first = await orchestrator.run({ specPath: SPEC, baseSha: validation.baseSha }, { ...workflowDependencies(adapter), validationResult: validation });
  assert.equal(first.code, 'COMMIT_AWAITING_HUMAN');
  const firstStepCalls = () => adapter.calls.filter((call) => call === 'executor:spec-automated-pipeline-step-1').length;
  const effects = firstStepCalls();
  const resumed = await orchestrator.resume({ specPath: SPEC, baseSha: validation.baseSha }, { ...workflowDependencies(adapter), validationResult: validation });
  assert.equal(firstStepCalls(), effects);
  assert.ok(['COMMIT_AWAITING_HUMAN', undefined].includes(resumed.code));
});

test('review uses a closed read-only snapshot and never calls mutation capabilities', async () => {
  const adapter = fakeAdapter();
  const result = await orchestrator.review({ specPath: SPEC }, workflowDependencies(adapter));
  assert.equal(result.ok, true);
  assert.equal(result.readOnly, true);
  assert.deepEqual(adapter.calls, ['snapshot', 'review:global', 'accept:global']);
});

test('mutable run fails before preflight when no complete adapter exists', async () => {
  const adapter = { async preflight() { throw new Error('must not run'); } };
  await assert.rejects(
      orchestrator.run({ specPath: SPEC, baseSha: 'a'.repeat(40) }, { ...workflowDependencies(adapter) }),
    { code: 'WORKFLOW_ADAPTER_UNAVAILABLE' },
  );
});

test('default adapter preflight does not execute an agent binary before base validation', async () => {
  const calls = [];
  const validationResult = await orchestrator.validate(
    { command: 'validate', specPath: SPEC },
    { repoRoot: ROOT, loadCatalogs: loadCatalogsFromFilesystem, loadRiskPolicy: loadApprovedRiskPolicy },
  );
  await assert.rejects(
    orchestrator.run({ command: 'run', specPath: SPEC, baseSha: validationResult.baseSha }, {
      repoRoot: ROOT,
      validationResult,
      async runProcess(input) {
        calls.push([input.executable, ...input.args]);
        return { ok: false, stdout: { text: '' }, stderr: { text: 'not installed' } };
      },
    }),
    { code: 'GIT_BASE_BRANCH_INVALID' },
  );
  assert.deepEqual(calls, [['git', 'branch', '--show-current']]);
});

test('budget and concurrent lock failures stop before worktree and agent calls', async () => {
  for (const [option, code] of [['budgetExhausted', 'BUDGET_EXCEEDED'], ['locked', 'LOCK_CONCURRENT']]) {
    const adapter = fakeAdapter({ [option]: true });
    await assert.rejects(
      orchestrator.run({ specPath: SPEC, baseSha: (await orchestrator.validate({ specPath: SPEC }, workflowDependencies(adapter))).baseSha }, { ...workflowDependencies(adapter), validationResult: {
        ...(await orchestrator.validate({ specPath: SPEC }, workflowDependencies(adapter))),
        spec: {
          ...(await orchestrator.validate({ specPath: SPEC }, workflowDependencies(adapter))).spec,
          execution: { autoCommit: true },
        },
      } }),
      { code },
    );
    assert.equal(adapter.calls.some((call) => call.startsWith('worktree:') || call.startsWith('executor:')), false);
  }
});

test('review fails closed when the fake reports a trust-boundary mutation', async () => {
  const adapter = fakeAdapter({ mutateReview: true });
  await assert.rejects(orchestrator.review({ specPath: SPEC }, workflowDependencies(adapter)), {
    code: 'READ_ONLY_MUTATION_DETECTED',
  });
  assert.equal(adapter.calls.includes('accept:global'), false);
});

test('fake adapter exposes no external service capability', () => {
  const adapter = fakeAdapter();
  assert.equal(adapter.runProcess, undefined);
  assert.equal(adapter.openCode, undefined);
  assert.equal(adapter.github, undefined);
  assert.equal(adapter.network, undefined);
});

test('workflow discovery rejects spec components and steps directories that resolve outside the repository', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-paths-'));
  test.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const root = path.join(parent, 'root');
  const outside = path.join(parent, 'outside');
  fs.mkdirSync(root);
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, 'spec.md'), '---\nid: outside\n---\n# Outside\n');
  fs.symlinkSync(outside, path.join(root, 'specs'));
  assert.throws(() => orchestrator.workflowPaths('specs/spec.md', root), { code: 'SPEC_PATH_OUTSIDE_REPOSITORY' });

  fs.rmSync(path.join(root, 'specs'));
  fs.mkdirSync(path.join(root, 'specs'));
  fs.writeFileSync(path.join(root, 'specs/spec.md'), '---\nid: inside\n---\n# Inside\n');
  fs.mkdirSync(path.join(outside, 'steps'));
  fs.symlinkSync(path.join(outside, 'steps'), path.join(root, 'specs/steps'));
  assert.throws(() => orchestrator.workflowPaths('specs/spec.md', root), { code: 'STEPS_PATH_OUTSIDE_REPOSITORY' });
});

test('semantic validation fails closed for provenance, coverage, resources, gates, execution, hashes, and plan drift', async () => {
  const validation = await orchestrator.validate({ specPath: SPEC }, workflowDependencies(fakeAdapter()));
  const paths = orchestrator.workflowPaths(SPEC, ROOT);
  const catalog = { ok: true, value: validation.catalogs };
  const cases = [
    ['SPEC_SOURCE_HASH_MISMATCH', ({ spec }) => { spec.source.hash = '0'.repeat(64); }],
    ['STEP_SOURCE_PATH_MISMATCH', ({ steps }) => { steps[0].source.path = steps[1].source.path; }],
    ['STEP_SOURCE_HASH_MISMATCH', ({ steps }) => { steps[0].source.hash = '0'.repeat(64); }],
    ['UNKNOWN_TESTING_GATE_ID', ({ steps }) => { steps[0].testing.gateIds = ['missing-gate']; }],
    ['REQUIRED_TESTING_GATES_EMPTY', ({ steps }) => { steps[0].testing.gateIds = []; }],
    ['GLOBAL_GATE_NOT_REQUIRED_BY_ANY_STEP', ({ spec }) => { spec.globalGates = [...spec.globalGates, 'revalidation']; }],
    ['GLOBAL_GATE_NOT_DECLARED', ({ spec }) => { spec.globalGates = spec.globalGates.slice(1); }],
    ['UNKNOWN_ACCEPTANCE_CRITERION', ({ steps }) => { steps[0].acceptanceCriteria[0].id = 'AC-99'; }],
    ['ACCEPTANCE_CRITERION_UNCOVERED', ({ spec }) => { spec.acceptanceCriteria.push({ id: 'AC-99', description: 'Uncovered.' }); }],
    ['RESOURCE_ROLE_INCOMPATIBLE', ({ steps }) => { steps[0].resources.reviewer = 'opencode'; }],
    ['STEP_CONTEXT_PATH_MISMATCH', ({ steps }) => { steps[0].context.stepPath = steps[1].source.path; }],
    ['STEP_CONTEXT_SPEC_PATH_MISMATCH', ({ steps }) => { steps[0].context.specPath = 'specs/other.md'; }],
    ['STEP_PROVENANCE_MISMATCH', ({ steps }) => { steps[0].context.baseSha = '0'.repeat(40); }],
    ['STEP_EXECUTION_MISMATCH', ({ steps }) => { steps[0].execution.autoCommit = true; }],
    ['IMPLEMENTATION_PLAN_STEP_MISMATCH', ({ options }) => { options.specDocument.body = options.specDocument.body.replace(/^20\. Adicionar CI.*$/m, ''); }],
  ];
  for (const [code, mutate] of cases) {
    const input = { spec: structuredClone(validation.spec), steps: structuredClone(validation.steps), options: structuredClone(paths) };
    mutate(input);
    assert.throws(
      () => orchestrator.validateSemantics(input.spec, { steps: input.steps }, catalog, input.options),
      (error) => error.code === 'WORKFLOW_SEMANTIC_INVALID' && error.details.errors.some((entry) => entry.code === code),
      code,
    );
  }
});
