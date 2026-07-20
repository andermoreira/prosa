'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { applyApprovalDecision, createApprovalRequest } = require('./lib/hitl-decision.cjs');

const HASH = 'a'.repeat(64);
const SHA = 'b'.repeat(40);

function binding(overrides = {}) {
  return {
    repoIdentity: HASH, runId: 'run-hitl', baseSha: SHA, specHash: HASH, stepsHash: HASH,
    stepId: 'pipeline-step-1', stepHash: HASH, policyHash: HASH, assessmentHash: HASH,
    ...overrides,
  };
}

function request(overrides = {}) {
  return createApprovalRequest({
    id: 'approval-pipeline-step-1-pre', checkpoint: 'pre-execution',
    contextArtifactRef: 'artifact-approval-context', binding: binding(),
    createdAt: '2026-07-19T00:00:00.000Z', ...overrides,
  });
}

function decision(overrides = {}) {
  return {
    schemaVersion: '1.0.0', requestId: 'approval-pipeline-step-1-pre', outcome: 'approved',
    actor: 'local-user', justification: 'Risk reviewed and accepted', nextAction: null, ...overrides,
  };
}

function apply(overrides = {}) {
  const approvalRequest = overrides.request || request();
  return applyApprovalDecision({
    request: approvalRequest, decisions: [], decision: decision(), currentBinding: approvalRequest.binding,
    decisionId: 'decision-pipeline-step-1-pre', transitionId: 'transition-hitl-pre',
    recordedAt: '2026-07-19T00:01:00.000Z', ...overrides,
  });
}

test('satisfies and consumes a matching approval exactly once', () => {
  const result = apply();
  assert.equal(result.classification, 'satisfied');
  assert.equal(result.request.status, 'satisfied');
  assert.equal(result.decision.consumedByTransitionId, 'transition-hitl-pre');
  assert.equal(result.decision.consumedAt, '2026-07-19T00:01:00.000Z');
  assert.deepEqual(result.decision.binding, result.request.binding);
});

test('classifies a divergent binding as stale without consuming the decision', () => {
  const approvalRequest = request();
  const result = apply({ request: approvalRequest, currentBinding: binding({ assessmentHash: 'c'.repeat(64) }) });
  assert.equal(result.classification, 'stale');
  assert.equal(result.request.status, 'stale');
  assert.equal(result.decision.consumedAt, null);
  assert.equal(result.decision.consumedByTransitionId, null);
});

test('reconciles an identical replay by transition ID and rejects ambiguous reuse', () => {
  const first = apply();
  const replay = applyApprovalDecision({
    request: first.request, decisions: [first.decision], decision: decision(), currentBinding: first.request.binding,
    decisionId: first.decision.id, transitionId: 'transition-hitl-pre', recordedAt: '2026-07-19T00:02:00.000Z',
  });
  assert.equal(replay.classification, 'satisfied');
  assert.equal(replay.replayed, true);
  assert.strictEqual(replay.decision, first.decision);

  assert.throws(() => applyApprovalDecision({
    request: first.request, decisions: [first.decision], decision: decision(), currentBinding: first.request.binding,
    decisionId: first.decision.id, transitionId: 'transition-other', recordedAt: '2026-07-19T00:02:00.000Z',
  }), { code: 'HITL_DECISION_ALREADY_CONSUMED' });
  assert.throws(() => applyApprovalDecision({
    request: first.request, decisions: [first.decision],
    decision: decision({ outcome: 'rejected', nextAction: 'abort' }), currentBinding: first.request.binding,
    decisionId: first.decision.id, transitionId: 'transition-hitl-pre', recordedAt: '2026-07-19T00:02:00.000Z',
  }), { code: 'HITL_DECISION_CONFLICT' });
});

test('records an explicit rejection and requires complete post-review facts', () => {
  const rejected = apply({ decision: decision({ outcome: 'rejected', nextAction: 'retry' }) });
  assert.equal(rejected.classification, 'rejected');
  assert.equal(rejected.request.status, 'rejected');
  assert.equal(rejected.decision.nextAction, 'retry');

  assert.throws(() => request({ checkpoint: 'post-review' }), { code: 'HITL_BINDING_INVALID' });
  const postReview = request({
    id: 'approval-pipeline-step-1-review', checkpoint: 'post-review',
    binding: binding({
      attemptId: 'attempt-pipeline-step-1-1', parentSha: SHA, worktreeId: 'worktree-pipeline-step-1-1',
      worktreePath: '/tmp/worktree', worktreeHeadSha: SHA, factualIdentityHash: HASH, diffArtifactId: 'artifact-diff', diffHash: HASH,
      snapshotSourceHash: HASH, reviewArtifactId: 'artifact-review', reviewHash: HASH,
    }),
  });
  assert.equal(postReview.checkpoint, 'post-review');
});
