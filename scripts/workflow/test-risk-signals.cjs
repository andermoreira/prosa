'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { assessRisk, validateRiskPolicySource } = require('./lib/risk-policy.cjs');
const { createRiskSignal, retrySignals, reviewSignals, sandboxSignals, scopeSignals } = require('./lib/risk-signals.cjs');

const ROOT = path.resolve(__dirname, '../..');
const POLICY = validateRiskPolicySource(fs.readFileSync(path.join(ROOT, 'workflow/risk-policy.yaml'), 'utf8'), { type: 'test' }).value;
const STEP = { schemaVersion: '2.0.0', changeType: 'documentation', predictedFiles: ['docs/planned.md'], allowedAreas: ['docs'] };
const OBSERVED_AT = '2026-07-19T12:00:00.000Z';

test('review, retry, scope, and sandbox producers emit monotonic envelopes', () => {
  const retry = retrySignals({ attempt: 2, attemptId: 'attempt-step-2', observedAt: OBSERVED_AT });
  const unpredicted = scopeSignals({ scope: { unpredicted: ['docs/unplanned.md'] }, attemptId: 'attempt-step-2', observedAt: OBSERVED_AT });
  const review = reviewSignals({ review: { findings: [{ severity: 'high' }] }, evidenceRef: 'artifact-review-2', attempt: 2, observedAt: OBSERVED_AT });
  const sandbox = sandboxSignals({ error: { code: 'SANDBOX_VIOLATION' }, evidenceRef: 'artifact-sandbox-2', operationId: 'run-step-executor-2', observedAt: OBSERVED_AT });
  const raised = assessRisk({ policyRecord: POLICY, step: STEP, signals: [...retry, ...unpredicted] });
  assert.equal(raised.effectiveLevel, 'approval_required');
  const restricted = assessRisk({ policyRecord: POLICY, step: STEP, signals: [...retry, ...unpredicted, ...review, ...sandbox], previousEffectiveLevel: raised.effectiveLevel });
  assert.equal(restricted.effectiveLevel, 'restricted');
  assert.equal(restricted.signals.length, 4);
  assert.equal(assessRisk({ policyRecord: POLICY, step: STEP, previousEffectiveLevel: restricted.effectiveLevel }).effectiveLevel, 'restricted');
});

test('duplicate envelopes collapse by fingerprint and a fictitious producer needs no aggregator change', () => {
  const future = createRiskSignal({
    source: { type: 'future-analyzer', id: 'prototype' }, kind: 'novel-risk', minimumLevel: 'restricted',
    reason: 'A future producer observed a restricted risk', evidenceRefs: ['artifact-future-1'], observedAt: OBSERVED_AT,
  });
  const assessment = assessRisk({ policyRecord: POLICY, step: STEP, signals: [future, future] });
  assert.equal(assessment.effectiveLevel, 'restricted');
  assert.equal(assessment.signals.length, 1);
  assert.equal(assessment.signals[0].source.type, 'future-analyzer');
});

test('invalid and tampered producer envelopes fail closed with stable diagnostics', () => {
  const signal = createRiskSignal({
    source: { type: 'attempt', id: 'attempt-2' }, kind: 'retry', minimumLevel: 'approval_required',
    reason: 'Second attempt started', evidenceRefs: ['attempt-step-2'], observedAt: OBSERVED_AT,
  });
  assert.throws(() => assessRisk({ policyRecord: POLICY, step: STEP, signals: [{ ...signal, reason: 'Tampered' }] }), { code: 'RISK_SIGNAL_FINGERPRINT_INVALID' });
  assert.throws(() => assessRisk({ policyRecord: POLICY, step: STEP, signals: [{ ...signal, source: { type: 'INVALID', id: 'attempt-2' } }] }), { code: 'RISK_SIGNAL_INVALID' });
});
