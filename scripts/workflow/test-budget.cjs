'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  createBudgetLedger,
  pauseBudget,
  publicLedger,
  reconcilePendingReservations,
  reconcileReservation,
  reserveBudget,
  restoreBudgetLedger,
  validateBudgetPolicy,
} = require('./lib/budget.cjs');
const { classifyFailure, failureFingerprint, retryDecision } = require('./lib/retry.cjs');

function policies(overrides = {}) {
  return {
    spec: {
      maxAttemptsPerStep: 2,
      maxAttemptsTotal: 3,
      maxAgentCallsPerStep: 3,
      maxAgentCallsTotal: 4,
      maxReviewCyclesPerStep: 1,
      maxReviewCyclesTotal: 2,
      maxDiagnosisCyclesPerStep: 1,
      maxDiagnosisCyclesTotal: 2,
      maxElapsedMinutesPerStep: 10,
      maxElapsedMinutesTotal: 20,
      maxEstimatedCostPerStep: null,
      maxEstimatedCostTotal: null,
      maxTokensPerStep: null,
      maxTokensTotal: null,
      ...overrides.spec,
    },
    steps: {
      'pipeline-step-1': {
        maxAttempts: 2,
        maxAgentCalls: 3,
        maxReviewCycles: 1,
        maxDiagnosisCycles: 1,
        maxElapsedMinutes: 10,
        maxEstimatedCost: null,
        maxTokens: null,
        ...overrides.step,
      },
      ...(overrides.steps || {}),
    },
  };
}

function ledgerFor(overrides = {}, clock) {
  const { spec, steps } = policies(overrides);
  return createBudgetLedger(spec, steps, clock ? { now: clock } : {});
}

test('validates every required spec and step limit', () => {
  const { spec, steps } = policies();
  assert.equal(validateBudgetPolicy(spec, steps), true);
  delete spec.maxAttemptsTotal;
  assert.throws(() => validateBudgetPolicy(spec, steps), { code: 'INVALID_BUDGET_POLICY', path: '/specBudgets/maxAttemptsTotal' });
});

test('reserves step and total atomically and blocks before exceeding a reached limit', () => {
  const ledger = ledgerFor();
  const persisted = [];
  const first = reserveBudget(ledger, { stepId: 'pipeline-step-1', action: 'attempt', reservationId: 'reservation-attempt-1' }, (value) => persisted.push(value));
  assert.equal(first.ok, true);
  assert.equal(ledger.perStep[0].counters.attempts.reserved, 1);
  assert.equal(ledger.total.attempts.reserved, 1);
  assert.equal(persisted.length, 1);
  reconcileReservation(ledger, first.reservationId, { status: 'consumed' });
  const second = reserveBudget(ledger, { stepId: 'pipeline-step-1', action: 'attempt', reservationId: 'reservation-attempt-2' });
  reconcileReservation(ledger, second.reservationId, { status: 'consumed' });
  const blocked = reserveBudget(ledger, { stepId: 'pipeline-step-1', action: 'agent-call' });
  assert.deepEqual(
    { ok: blocked.ok, code: blocked.blocked.code, metric: blocked.blocked.metric, scope: blocked.blocked.scope, nextAction: blocked.nextAction },
    { ok: false, code: 'BUDGET_EXCEEDED', metric: 'attempts', scope: 'step', nextAction: 'BLOCKED' },
  );
});

test('failed persistence does not expose an unpersisted reservation', () => {
  const ledger = ledgerFor();
  assert.throws(
    () => reserveBudget(ledger, { stepId: 'pipeline-step-1', action: 'attempt' }, () => { throw new Error('disk full'); }),
    /disk full/,
  );
  assert.equal(ledger.revision, 0);
  assert.equal(ledger.total.attempts.reserved, 0);
  assert.equal(ledger.reservations.length, 0);
});

test('crash reservations remain charged until explicit resume reconciliation', () => {
  const ledger = ledgerFor();
  reserveBudget(ledger, { stepId: 'pipeline-step-1', action: 'attempt', reservationId: 'reservation-crash' });
  const unknown = reconcilePendingReservations(ledger, {});
  assert.deepEqual({ ok: unknown.ok, unresolved: unknown.unresolved, nextAction: unknown.nextAction }, {
    ok: false, unresolved: ['reservation-crash'], nextAction: 'BLOCKED',
  });
  assert.equal(ledger.reservations[0].status, 'reconciliation-required');
  assert.equal(ledger.total.attempts.reserved, 1);
  reconcilePendingReservations(ledger, { 'reservation-crash': { status: 'consumed' } });
  assert.equal(ledger.reservations[0].status, 'consumed');
  assert.equal(ledger.total.attempts.reserved, 0);
  assert.equal(ledger.total.attempts.consumed, 1);

  const resumed = ledgerFor();
  reserveBudget(resumed, { stepId: 'pipeline-step-1', action: 'attempt', reservationId: 'reservation-released' });
  reconcilePendingReservations(resumed, { 'reservation-released': { status: 'released' } });
  assert.equal(resumed.total.attempts.reserved, 0);
  assert.equal(resumed.reservations[0].status, 'released');
});

test('active elapsed is accumulated, paused, and restored without charging the process gap', () => {
  let now = 0;
  const limits = { spec: { maxElapsedMinutesPerStep: 2, maxElapsedMinutesTotal: 2 }, step: { maxElapsedMinutes: 2 } };
  const first = ledgerFor(limits, () => now);
  reserveBudget(first, { stepId: 'pipeline-step-1', action: 'attempt', reservationId: 'reservation-before-restart' });
  now = 30000;
  reconcileReservation(first, 'reservation-before-restart', { status: 'consumed' });
  now = 45000;
  pauseBudget(first);
  const persisted = publicLedger(first);
  assert.equal(persisted.timing.totalActiveMs, 45000);
  assert.equal(persisted.timing.activeMsByStep['pipeline-step-1'], 45000);
  assert.equal(persisted.total.elapsedMinutes.consumed, 0.75);
  assert.equal(persisted.perStep[0].counters.elapsedMinutes.consumed, 0.75);

  now = 3600000;
  const { spec, steps } = policies(limits);
  const restored = restoreBudgetLedger(spec, steps, persisted, { now: () => now });
  assert.equal(publicLedger(restored).timing.totalActiveMs, 45000);
  now += 15000;
  const resumed = reserveBudget(restored, { stepId: 'pipeline-step-1', action: 'agent-call', reservationId: 'reservation-after-restart' });
  assert.equal(resumed.ok, true);
  now += 15000;
  reconcileReservation(restored, resumed.reservationId, { status: 'consumed', role: 'executor' });
  const afterResume = publicLedger(restored);
  assert.equal(afterResume.timing.totalActiveMs, 75000);
  assert.equal(afterResume.timing.activeMsByStep['pipeline-step-1'], 60000);

  const forged = structuredClone(persisted);
  forged.total.attempts.reserved = 1;
  assert.throws(() => restoreBudgetLedger(spec, steps, forged, { now: () => now }), { code: 'INVALID_BUDGET_LEDGER' });
});

test('paused snapshots do not depend on later clock readings', () => {
  let now = 0;
  const ledger = ledgerFor({}, () => now);
  reserveBudget(ledger, { stepId: 'pipeline-step-1', action: 'attempt', reservationId: 'reservation-pause' });
  now = 60000;
  pauseBudget(ledger);
  const paused = publicLedger(ledger);
  now = 600000;
  assert.deepEqual(publicLedger(ledger).timing, paused.timing);
  assert.equal(publicLedger(ledger).total.elapsedMinutes.consumed, 1);
});

test('nullable reporting is persisted and cannot bypass a configured maximum', () => {
  const unlimited = ledgerFor();
  const call = reserveBudget(unlimited, { stepId: 'pipeline-step-1', action: 'agent-call', reservationId: 'reservation-null' });
  reconcileReservation(unlimited, call.reservationId, { status: 'consumed', role: 'executor', estimatedCost: null, tokens: null });
  assert.equal(unlimited.total.estimatedCost.consumed, null);
  assert.equal(unlimited.total.tokens.consumed, null);

  const limited = ledgerFor({
    spec: { maxEstimatedCostPerStep: 5, maxEstimatedCostTotal: 10, maxTokensPerStep: 100, maxTokensTotal: 200 },
    step: { maxEstimatedCost: 5, maxTokens: 100 },
  });
  const missingEstimate = reserveBudget(limited, { stepId: 'pipeline-step-1', action: 'agent-call' });
  assert.equal(missingEstimate.blocked.code, 'BUDGET_MEASUREMENT_REQUIRED');
  const measured = reserveBudget(limited, {
    stepId: 'pipeline-step-1', action: 'agent-call', estimatedCost: 1, tokens: 10, reservationId: 'reservation-measured',
  });
  reconcileReservation(limited, measured.reservationId, { status: 'consumed', role: 'executor', estimatedCost: null, tokens: null });
  const afterNull = reserveBudget(limited, { stepId: 'pipeline-step-1', action: 'attempt' });
  assert.equal(afterNull.blocked.code, 'BUDGET_MEASUREMENT_REQUIRED');
});

test('fake monotonic clock measures elapsed for total and step and blocks the next action', () => {
  let now = 0;
  const ledger = ledgerFor({ spec: { maxElapsedMinutesPerStep: 1, maxElapsedMinutesTotal: 2 }, step: { maxElapsedMinutes: 1 } }, () => now);
  reserveBudget(ledger, { stepId: 'pipeline-step-1', action: 'attempt', reservationId: 'reservation-clock' });
  now = 60000;
  reconcileReservation(ledger, 'reservation-clock', { status: 'consumed' });
  assert.equal(ledger.perStep[0].counters.elapsedMinutes.consumed, 1);
  assert.equal(ledger.total.elapsedMinutes.consumed, 1);
  const blocked = reserveBudget(ledger, { stepId: 'pipeline-step-1', action: 'agent-call' });
  assert.equal(blocked.blocked.metric, 'elapsedMinutes');
  assert.equal(blocked.nextAction, 'BLOCKED');
});

test('review and diagnosis reserve calls and their own cycles before execution', () => {
  const ledger = ledgerFor();
  const review = reserveBudget(ledger, { stepId: 'pipeline-step-1', action: 'review', reservationId: 'reservation-review' });
  assert.equal(review.ok, true);
  assert.equal(ledger.total.agentCalls.reserved, 1);
  assert.equal(ledger.total.reviewCycles.reserved, 1);
  reconcileReservation(ledger, review.reservationId, { status: 'consumed', role: 'reviewer' });
  const blocked = reserveBudget(ledger, { stepId: 'pipeline-step-1', action: 'review' });
  assert.equal(blocked.blocked.metric, 'reviewCycles');

  const diagnosisLedger = ledgerFor();
  const diagnosis = reserveBudget(diagnosisLedger, {
    stepId: 'pipeline-step-1', action: 'diagnosis', reservationId: 'reservation-diagnosis',
  });
  assert.equal(diagnosis.ok, true);
  assert.equal(diagnosisLedger.total.agentCalls.reserved, 1);
  assert.equal(diagnosisLedger.total.diagnosisCycles.reserved, 1);
});

test('retry classification is allowlisted and excludes deterministic boundaries', () => {
  assert.deepEqual(classifyFailure({ code: 'RATE_LIMITED' }), { classification: 'transient', retryable: true });
  // A timeout is terminal: retrying costs a full timeout window with the same prompt and the same
  // conditions, unlike the transient codes, which fail in seconds. It keeps its own classification
  // so the evidence says "died on the timeout" instead of "deterministic failure".
  assert.deepEqual(classifyFailure({ code: 'TIMEOUT' }), { classification: 'timeout', retryable: false });
  assert.deepEqual(classifyFailure({ status: 'timed_out' }), { classification: 'timeout', retryable: false });
  for (const classification of ['schema', 'authorization', 'scope', 'trust-boundary', 'gate', 'deterministic']) {
    assert.equal(classifyFailure({ classification, code: 'TIMEOUT' }).retryable, false, classification);
  }
  assert.equal(classifyFailure({ classification: 'transient', code: 'UNKNOWN' }).retryable, false);

  // OpenCode's ApiError carries its own `isRetryable`; its verdict outranks the status code, so an
  // explicit "not retryable" is not rescued by a 429 and a retryable failure is not lost.
  assert.deepEqual(
    classifyFailure({ code: 'OPENCODE_EVENT_ERROR', httpStatus: 429, providerRetryable: true }),
    { classification: 'transient', retryable: true },
  );
  assert.deepEqual(
    classifyFailure({ code: 'OPENCODE_EVENT_ERROR', httpStatus: 429, providerRetryable: false }),
    { classification: 'deterministic', retryable: false },
  );
  // A timeout stays terminal even when the provider calls it retryable.
  assert.equal(classifyFailure({ code: 'TIMEOUT', providerRetryable: true }).retryable, false);
  // An auth failure is terminal: no key becomes valid by trying again.
  assert.equal(classifyFailure({ classification: 'authorization', providerRetryable: true }).retryable, false);
});

test('retries are finite and require a fresh read-only diagnosis after the second equivalent failure', () => {
  const failure = { code: 'SERVICE_UNAVAILABLE', phase: 'executor', role: 'executor' };
  assert.equal(retryDecision({ failures: [failure], maxAttempts: 3 }).nextAction, 'RETRY');
  const diagnose = retryDecision({ failures: [failure, { ...failure }], maxAttempts: 3 });
  assert.equal(diagnose.nextAction, 'DIAGNOSE');
  assert.deepEqual(diagnose.diagnostician, { fresh: true, readOnly: true, correctionStep: false });
  assert.equal(retryDecision({
    failures: [failure, { ...failure }],
    maxAttempts: 3,
    diagnoses: [{ failureFingerprint: failureFingerprint(failure), afterFailureIndex: 1, fresh: false, readOnly: true }],
  }).nextAction, 'DIAGNOSE');
  assert.equal(retryDecision({
    failures: [failure, { ...failure }],
    maxAttempts: 3,
    diagnoses: [{ failureFingerprint: failureFingerprint(failure), afterFailureIndex: 1, fresh: true, readOnly: true }],
  }).nextAction, 'RETRY');
  assert.equal(retryDecision({ failures: [failure, failure, failure], maxAttempts: 3 }).reason, 'RETRY_LIMIT_REACHED');
  assert.equal(retryDecision({ failures: [{ classification: 'schema' }], maxAttempts: 3 }).reason, 'NON_RETRYABLE');
});
