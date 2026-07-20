'use strict';

const { isDeepStrictEqual } = require('node:util');
const { validate } = require('./contracts.cjs');

const HASH = /^[0-9a-f]{64}$/;
const SHA = /^[0-9a-f]{40,64}$/;
const RUN_ID = /^run-[A-Za-z0-9][A-Za-z0-9._-]*$/;
const STEP_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*-step-[1-9][0-9]*$/;
const REQUEST_ID = /^approval-[a-z0-9]+(?:[._-][a-z0-9]+)*$/;
const DECISION_ID = /^decision-[A-Za-z0-9][A-Za-z0-9._-]*$/;
const TRANSITION_ID = /^transition-[A-Za-z0-9][A-Za-z0-9._-]*$/;
const ARTIFACT_ID = /^artifact-[A-Za-z0-9][A-Za-z0-9._-]*$/;
const ATTEMPT_ID = /^attempt-[A-Za-z0-9][A-Za-z0-9._-]*$/;
const WORKTREE_ID = /^worktree-[A-Za-z0-9][A-Za-z0-9._-]*$/;
const TIMESTAMP = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,9})?Z$/;
const BASE_BINDING = Object.freeze({
  repoIdentity: HASH, runId: RUN_ID, baseSha: SHA, specHash: HASH, stepsHash: HASH,
  stepId: STEP_ID, stepHash: HASH, policyHash: HASH, assessmentHash: HASH,
});
const REVIEW_BINDING = Object.freeze({
  attemptId: ATTEMPT_ID, parentSha: SHA, worktreeId: WORKTREE_ID, worktreePath: /^\//, worktreeHeadSha: SHA,
  factualIdentityHash: HASH,
  diffArtifactId: ARTIFACT_ID, diffHash: HASH, snapshotSourceHash: HASH,
  reviewArtifactId: ARTIFACT_ID, reviewHash: HASH,
});

class HitlDecisionError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'HitlDecisionError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new HitlDecisionError(code, message, details);
}

function assertTimestamp(value, field) {
  if (typeof value !== 'string' || !TIMESTAMP.test(value) || Number.isNaN(Date.parse(value))) {
    fail('HITL_TIMESTAMP_INVALID', `${field} must be a UTC timestamp`);
  }
}

function assertBinding(binding, checkpoint) {
  if (!binding || typeof binding !== 'object' || Array.isArray(binding)) fail('HITL_BINDING_INVALID', 'Approval binding must be an object');
  const allowed = new Set([...Object.keys(BASE_BINDING), ...Object.keys(REVIEW_BINDING)]);
  const required = checkpoint === 'post-review' ? { ...BASE_BINDING, ...REVIEW_BINDING } : BASE_BINDING;
  if (!['pre-execution', 'post-review'].includes(checkpoint)
    || Object.keys(binding).some((field) => !allowed.has(field))
    || Object.entries(required).some(([field, pattern]) => typeof binding[field] !== 'string' || !pattern.test(binding[field]))) {
    fail('HITL_BINDING_INVALID', `Approval binding is incomplete or invalid for ${checkpoint}`);
  }
  return binding;
}

function createApprovalRequest({ id, checkpoint, contextArtifactRef, binding, createdAt }) {
  if (typeof id !== 'string' || !REQUEST_ID.test(id)) fail('HITL_REQUEST_ID_INVALID', 'Approval request ID is invalid');
  if (typeof contextArtifactRef !== 'string' || !ARTIFACT_ID.test(contextArtifactRef)) {
    fail('HITL_CONTEXT_ARTIFACT_INVALID', 'Approval context artifact reference is invalid');
  }
  assertTimestamp(createdAt, 'createdAt');
  assertBinding(binding, checkpoint);
  return { id, checkpoint, status: 'pending', contextArtifactRef, binding: structuredClone(binding), createdAt };
}

function decisionInput(record) {
  return {
    schemaVersion: record.schemaVersion,
    requestId: record.requestId,
    outcome: record.outcome,
    actor: record.actor,
    justification: record.justification,
    nextAction: record.nextAction,
  };
}

function replay(existing, decision, transitionId) {
  if (!isDeepStrictEqual(decisionInput(existing), decision)) {
    fail('HITL_DECISION_CONFLICT', 'A different decision is already recorded for this request', { requestId: decision.requestId });
  }
  if (existing.consumedByTransitionId !== null && existing.consumedByTransitionId !== transitionId) {
    fail('HITL_DECISION_ALREADY_CONSUMED', 'Decision was consumed by another transition', { requestId: decision.requestId });
  }
  return existing.consumedAt === null ? 'stale' : existing.outcome === 'approved' ? 'satisfied' : 'rejected';
}

function applyApprovalDecision({ request, decisions, decision, currentBinding, decisionId, transitionId, recordedAt }) {
  if (!request || typeof request !== 'object' || !Array.isArray(decisions)) fail('HITL_STATE_INVALID', 'Approval request and decision history are required');
  const contract = validate('approval-decision', decision);
  if (!contract.ok) fail('HITL_DECISION_INVALID', 'Approval decision contract validation failed', { errors: contract.errors });
  if (decision.requestId !== request.id) fail('HITL_REQUEST_MISMATCH', 'Decision targets another approval request');
  if (typeof transitionId !== 'string' || !TRANSITION_ID.test(transitionId)) fail('HITL_TRANSITION_ID_INVALID', 'A valid transition ID is required');
  const duplicates = decisions.filter((entry) => entry.requestId === request.id);
  if (duplicates.length > 1) fail('HITL_DECISION_HISTORY_INVALID', 'Approval request has multiple recorded decisions');
  if (duplicates.length === 1) {
    const classification = replay(duplicates[0], decision, transitionId);
    return { classification, request, decision: duplicates[0], replayed: true };
  }
  if (request.status !== 'pending') fail('HITL_REQUEST_NOT_PENDING', 'Approval request is not pending', { status: request.status });
  if (typeof decisionId !== 'string' || !DECISION_ID.test(decisionId)) fail('HITL_DECISION_ID_INVALID', 'Persisted decision ID is invalid');
  assertTimestamp(recordedAt, 'recordedAt');
  assertBinding(request.binding, request.checkpoint);
  assertBinding(currentBinding, request.checkpoint);

  const stale = !isDeepStrictEqual(request.binding, currentBinding);
  const classification = stale ? 'stale' : decision.outcome === 'approved' ? 'satisfied' : 'rejected';
  const persistedDecision = {
    schemaVersion: '1.0.0', id: decisionId, requestId: decision.requestId,
    outcome: decision.outcome, nextAction: decision.nextAction, actor: decision.actor,
    justification: decision.justification, binding: structuredClone(request.binding), recordedAt,
    consumedAt: stale ? null : recordedAt,
    consumedByTransitionId: stale ? null : transitionId,
  };
  return {
    classification,
    request: { ...request, status: classification === 'satisfied' ? 'satisfied' : classification },
    decision: persistedDecision,
    replayed: false,
  };
}

module.exports = {
  HitlDecisionError,
  applyApprovalDecision,
  createApprovalRequest,
};
