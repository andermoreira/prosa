'use strict';

const crypto = require('node:crypto');
const { fingerprintRiskSignal } = require('./risk-policy.cjs');

function createRiskSignal(input) {
  const signal = {
    schemaVersion: '1.0.0', source: input.source, kind: input.kind,
    minimumLevel: input.minimumLevel, reason: input.reason,
    evidenceRefs: [...new Set(input.evidenceRefs)], observedAt: input.observedAt,
  };
  return { ...signal, fingerprint: fingerprintRiskSignal(signal) };
}

function reviewSignals({ review, evidenceRef, attempt, observedAt }) {
  const blocking = (review?.findings || []).filter((finding) => ['critical', 'high'].includes(finding.severity));
  if (blocking.length === 0) return [];
  return [createRiskSignal({
    source: { type: 'reviewer', id: `local-review-${attempt}` }, kind: 'high-finding',
    minimumLevel: 'restricted', reason: 'Local review reported a high or critical finding',
    evidenceRefs: [evidenceRef], observedAt,
  })];
}

function retrySignals({ attempt, attemptId, observedAt }) {
  if (!Number.isInteger(attempt) || attempt < 2) return [];
  return [createRiskSignal({
    source: { type: 'attempt', id: `attempt-${attempt}` }, kind: 'retry',
    minimumLevel: 'approval_required', reason: 'Second or later attempt started',
    evidenceRefs: [attemptId], observedAt,
  })];
}

function scopeSignals({ scope, attemptId, observedAt }) {
  if (!Array.isArray(scope?.unpredicted) || scope.unpredicted.length === 0) return [];
  return [createRiskSignal({
    source: { type: 'scope', id: attemptId }, kind: 'unpredicted-path',
    minimumLevel: 'approval_required', reason: 'Allowed changes include a path not predicted by the step',
    evidenceRefs: [attemptId], observedAt,
  })];
}

function sandboxSignals({ error, evidenceRef, operationId, observedAt }) {
  if (error?.code !== 'SANDBOX_VIOLATION') return [];
  const sourceId = crypto.createHash('sha256').update(operationId).digest('hex').slice(0, 24);
  return [createRiskSignal({
    source: { type: 'sandbox', id: `operation-${sourceId}` }, kind: 'sandbox-violation',
    minimumLevel: 'restricted', reason: 'The coercive sandbox recorded a blocked operation',
    evidenceRefs: [evidenceRef], observedAt,
  })];
}

module.exports = { createRiskSignal, retrySignals, reviewSignals, sandboxSignals, scopeSignals };
