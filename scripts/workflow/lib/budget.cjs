'use strict';

/**
 * budget.cjs — ledger de budget com modelo reserve-then-reconcile, resiliente a crash.
 *
 * Cada ação custosa (attempt, agent-call, review, diagnosis) primeiro RESERVA a métrica
 * (reserveBudget) e só depois CONSOME ou LIBERA na reconciliação (reconcileReservation). Um crash
 * entre os dois deixa a reserva pendente; `restoreBudgetLedger` a detecta no resume e força
 * reconciliação — nunca gasta duas vezes (fail-closed). Métricas: attempts, agentCalls,
 * review/diagnosisCycles, elapsedMinutes, estimatedCost, tokens, nos escopos step e total.
 *
 * `elapsedMinutes` vem de segmentos ativos acumulados por um relógio MONOTÔNICO (performance.now),
 * não do calendário: `pauseBudget` para o relógio em AWAITING_COMMIT para a espera humana não
 * consumir budget. Ver docs/workflows/automated-spec-pipeline.md § Budgets e artifacts.
 */

const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');

const METRICS = Object.freeze([
  'attempts',
  'agentCalls',
  'reviewCycles',
  'diagnosisCycles',
  'elapsedMinutes',
  'estimatedCost',
  'tokens',
]);
const NULLABLE_METRICS = new Set(['estimatedCost', 'tokens']);
const ACTION_METRICS = Object.freeze({
  attempt: { attempts: 1 },
  'agent-call': { agentCalls: 1 },
  review: { agentCalls: 1, reviewCycles: 1 },
  diagnosis: { agentCalls: 1, diagnosisCycles: 1 },
});
const SPEC_NAMES = Object.freeze({
  attempts: ['maxAttemptsPerStep', 'maxAttemptsTotal'],
  agentCalls: ['maxAgentCallsPerStep', 'maxAgentCallsTotal'],
  reviewCycles: ['maxReviewCyclesPerStep', 'maxReviewCyclesTotal'],
  diagnosisCycles: ['maxDiagnosisCyclesPerStep', 'maxDiagnosisCyclesTotal'],
  elapsedMinutes: ['maxElapsedMinutesPerStep', 'maxElapsedMinutesTotal'],
  estimatedCost: ['maxEstimatedCostPerStep', 'maxEstimatedCostTotal'],
  tokens: ['maxTokensPerStep', 'maxTokensTotal'],
});
const STEP_NAMES = Object.freeze({
  attempts: 'maxAttempts',
  agentCalls: 'maxAgentCalls',
  reviewCycles: 'maxReviewCycles',
  diagnosisCycles: 'maxDiagnosisCycles',
  elapsedMinutes: 'maxElapsedMinutes',
  estimatedCost: 'maxEstimatedCost',
  tokens: 'maxTokens',
});

function budgetError(code, path, message) {
  const error = new Error(message);
  error.code = code;
  error.path = path;
  return error;
}

function assertLimit(value, path, nullable, integer) {
  if (nullable && value === null) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || (integer && !Number.isInteger(value))) {
    throw budgetError('INVALID_BUDGET_POLICY', path, `${path} must be a finite positive${integer ? ' integer' : ' number'}${nullable ? ' or null' : ''}`);
  }
}

function validateBudgetPolicy(specBudgets, stepBudgetsById) {
  if (!specBudgets || typeof specBudgets !== 'object' || Array.isArray(specBudgets)) {
    throw budgetError('INVALID_BUDGET_POLICY', '/specBudgets', 'Spec budgets must be an object');
  }
  if (!stepBudgetsById || typeof stepBudgetsById !== 'object' || Array.isArray(stepBudgetsById) || Object.keys(stepBudgetsById).length === 0) {
    throw budgetError('INVALID_BUDGET_POLICY', '/stepBudgetsById', 'At least one step budget is required');
  }

  for (const metric of METRICS) {
    const [perStepName, totalName] = SPEC_NAMES[metric];
    const nullable = NULLABLE_METRICS.has(metric);
    const integer = ['attempts', 'agentCalls', 'reviewCycles', 'diagnosisCycles', 'tokens'].includes(metric);
    assertLimit(specBudgets[perStepName], `/specBudgets/${perStepName}`, nullable, integer);
    assertLimit(specBudgets[totalName], `/specBudgets/${totalName}`, nullable, integer);
  }

  for (const [stepId, budgets] of Object.entries(stepBudgetsById)) {
    if (!stepId || !budgets || typeof budgets !== 'object' || Array.isArray(budgets)) {
      throw budgetError('INVALID_BUDGET_POLICY', `/stepBudgetsById/${stepId}`, 'Each step budget must be an object');
    }
    for (const metric of METRICS) {
      const name = STEP_NAMES[metric];
      assertLimit(
        budgets[name],
        `/stepBudgetsById/${stepId}/${name}`,
        NULLABLE_METRICS.has(metric),
        ['attempts', 'agentCalls', 'reviewCycles', 'diagnosisCycles', 'tokens'].includes(metric),
      );
    }
  }
  return true;
}

function effectiveLimit(specLimit, stepLimit) {
  if (specLimit === null) return stepLimit;
  if (stepLimit === null) return specLimit;
  return Math.min(specLimit, stepLimit);
}

function metric(limit, nullable) {
  return { limit, consumed: nullable && limit === null ? null : 0, reserved: 0 };
}

function counters(limits) {
  const value = {};
  for (const name of METRICS) value[name] = metric(limits[name], NULLABLE_METRICS.has(name));
  value.agentCallsByRole = { executor: 0, reviewer: 0, diagnostician: 0 };
  return value;
}

function createBudgetLedger(specBudgets, stepBudgetsById, options = {}) {
  validateBudgetPolicy(specBudgets, stepBudgetsById);
  const now = options.now || (() => performance.now());
  const startedAtMs = now();
  if (!Number.isFinite(startedAtMs)) throw budgetError('INVALID_CLOCK', '/now', 'Clock must return a finite millisecond value');

  const totalLimits = {};
  for (const name of METRICS) totalLimits[name] = specBudgets[SPEC_NAMES[name][1]];
  const perStep = Object.entries(stepBudgetsById).map(([stepId, stepBudgets]) => {
    const limits = {};
    for (const name of METRICS) {
      limits[name] = effectiveLimit(specBudgets[SPEC_NAMES[name][0]], stepBudgets[STEP_NAMES[name]]);
    }
    return { stepId, counters: counters(limits) };
  });

  return {
    revision: 0,
    total: counters(totalLimits),
    perStep,
    reservations: [],
    timing: {
      totalActiveMs: 0,
      activeMsByStep: Object.fromEntries(perStep.map(({ stepId }) => [stepId, 0])),
      segmentStartedAtMs: startedAtMs,
      activeStepId: null,
      observedAtMs: startedAtMs,
    },
    now,
  };
}

function cloneLedger(ledger) {
  const copy = structuredClone({
    revision: ledger.revision,
    total: ledger.total,
    perStep: ledger.perStep,
    reservations: ledger.reservations,
    timing: ledger.timing,
  });
  copy.now = ledger.now;
  return copy;
}

function publicLedger(ledger) {
  const snapshot = cloneLedger(ledger);
  accumulateActive(snapshot);
  return structuredClone({
    revision: snapshot.revision,
    total: snapshot.total,
    perStep: snapshot.perStep,
    reservations: snapshot.reservations,
    timing: {
      totalActiveMs: snapshot.timing.totalActiveMs,
      activeMsByStep: snapshot.timing.activeMsByStep,
    },
  });
}

function restoreBudgetLedger(specBudgets, stepBudgetsById, persisted, options = {}) {
  const ledger = createBudgetLedger(specBudgets, stepBudgetsById, options);
  if (!persisted || typeof persisted !== 'object' || Array.isArray(persisted)) {
    throw budgetError('INVALID_BUDGET_LEDGER', '/usage', 'Persisted budget ledger must be an object');
  }
  const expectedKeys = ['revision', 'total', 'perStep', 'reservations', 'timing'];
  const keys = Object.keys(persisted).sort();
  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys.sort())) {
    throw budgetError('INVALID_BUDGET_LEDGER', '/usage', 'Persisted budget ledger has unknown or missing fields');
  }
  if (!Number.isSafeInteger(persisted.revision) || persisted.revision < 0 || !Array.isArray(persisted.perStep)
    || !Array.isArray(persisted.reservations)) {
    throw budgetError('INVALID_BUDGET_LEDGER', '/usage', 'Persisted budget ledger shape is invalid');
  }

  const validateCounters = (value, expected, pointer) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(Object.keys(expected).sort())) {
      throw budgetError('INVALID_BUDGET_LEDGER', pointer, 'Persisted budget counters are incomplete');
    }
    for (const name of METRICS) {
      const counter = value[name];
      const integer = ['attempts', 'agentCalls', 'reviewCycles', 'diagnosisCycles', 'tokens'].includes(name);
      if (!counter || counter.limit !== expected[name].limit || typeof counter.reserved !== 'number'
        || !Number.isFinite(counter.reserved) || counter.reserved < 0
        || (integer && !Number.isInteger(counter.reserved))
        || (counter.consumed !== null && (typeof counter.consumed !== 'number' || !Number.isFinite(counter.consumed) || counter.consumed < 0
          || (integer && !Number.isInteger(counter.consumed))))) {
        throw budgetError('INVALID_BUDGET_LEDGER', `${pointer}/${name}`, 'Persisted budget metric is invalid or its policy changed');
      }
    }
    const roles = value.agentCallsByRole;
    if (!roles || Object.keys(roles).sort().join() !== 'diagnostician,executor,reviewer'
      || Object.values(roles).some((count) => !Number.isSafeInteger(count) || count < 0)) {
      throw budgetError('INVALID_BUDGET_LEDGER', `${pointer}/agentCallsByRole`, 'Persisted role counters are invalid');
    }
    if (Object.values(roles).reduce((sum, count) => sum + count, 0) !== value.agentCalls.consumed) {
      throw budgetError('INVALID_BUDGET_LEDGER', `${pointer}/agentCallsByRole`, 'Persisted role counters do not match consumed agent calls');
    }
  };

  validateCounters(persisted.total, ledger.total, '/usage/total');
  if (persisted.perStep.length !== ledger.perStep.length) {
    throw budgetError('INVALID_BUDGET_LEDGER', '/usage/perStep', 'Persisted step budgets do not match the validated DAG');
  }
  for (const expected of ledger.perStep) {
    const actual = persisted.perStep.find((entry) => entry?.stepId === expected.stepId);
    if (!actual || Object.keys(actual).sort().join() !== 'counters,stepId') {
      throw budgetError('INVALID_BUDGET_LEDGER', `/usage/perStep/${expected.stepId}`, 'Persisted step budget is missing or invalid');
    }
    validateCounters(actual.counters, expected.counters, `/usage/perStep/${expected.stepId}/counters`);
  }

  const pending = new Map();
  for (const reservation of persisted.reservations) {
    if (!reservation || typeof reservation.id !== 'string' || !ledger.perStep.some((entry) => entry.stepId === reservation.stepId)
      || !METRICS.includes(reservation.metric) || typeof reservation.amount !== 'number' || !Number.isFinite(reservation.amount)
      || reservation.amount <= 0
      || (['attempts', 'agentCalls', 'reviewCycles', 'diagnosisCycles', 'tokens'].includes(reservation.metric) && !Number.isInteger(reservation.amount))
      || !['reserved', 'consumed', 'released', 'reconciliation-required'].includes(reservation.status)) {
      throw budgetError('INVALID_BUDGET_LEDGER', '/usage/reservations', 'Persisted reservation is invalid');
    }
    if (['reserved', 'reconciliation-required'].includes(reservation.status)) {
      const key = `${reservation.stepId}:${reservation.metric}`;
      pending.set(key, (pending.get(key) || 0) + reservation.amount);
    }
  }
  // Invariante de crash-recovery: os contadores `reserved` persistidos têm de bater exatamente com a
  // soma das reservas ainda pendentes. Qualquer divergência indica ledger corrompido → recusa o resume.
  for (const entry of persisted.perStep) {
    for (const name of METRICS) {
      if (entry.counters[name].reserved !== (pending.get(`${entry.stepId}:${name}`) || 0)) {
        throw budgetError('INVALID_BUDGET_LEDGER', `/usage/perStep/${entry.stepId}/counters/${name}/reserved`, 'Reserved counters do not match pending reservations');
      }
    }
  }
  for (const name of METRICS) {
    const total = [...pending.entries()].filter(([key]) => key.endsWith(`:${name}`)).reduce((sum, [, amount]) => sum + amount, 0);
    if (persisted.total[name].reserved !== total) {
      throw budgetError('INVALID_BUDGET_LEDGER', `/usage/total/${name}/reserved`, 'Total reserved counters do not match pending reservations');
    }
  }

  ledger.revision = persisted.revision;
  ledger.total = structuredClone(persisted.total);
  ledger.perStep = structuredClone(persisted.perStep);
  ledger.reservations = structuredClone(persisted.reservations);
  const timing = persisted.timing;
  const stepIds = ledger.perStep.map(({ stepId }) => stepId).sort();
  if (!timing || typeof timing !== 'object' || Array.isArray(timing)
    || Object.keys(timing).sort().join() !== 'activeMsByStep,totalActiveMs'
    || !Number.isFinite(timing.totalActiveMs) || timing.totalActiveMs < 0
    || !timing.activeMsByStep || typeof timing.activeMsByStep !== 'object' || Array.isArray(timing.activeMsByStep)
    || JSON.stringify(Object.keys(timing.activeMsByStep).sort()) !== JSON.stringify(stepIds)
    || Object.values(timing.activeMsByStep).some((value) => !Number.isFinite(value) || value < 0)
    || persisted.total.elapsedMinutes.consumed !== timing.totalActiveMs / 60000
    || ledger.perStep.some(({ stepId, counters: stepCounters }) => (
      stepCounters.elapsedMinutes.consumed !== timing.activeMsByStep[stepId] / 60000
    ))) {
    throw budgetError('INVALID_BUDGET_LEDGER', '/usage/timing', 'Persisted active budget timing is invalid or inconsistent');
  }
  const segmentStartedAtMs = ledger.timing.segmentStartedAtMs;
  ledger.timing = {
    totalActiveMs: timing.totalActiveMs,
    activeMsByStep: structuredClone(timing.activeMsByStep),
    segmentStartedAtMs: options.startActive === false ? null : segmentStartedAtMs,
    activeStepId: null,
    observedAtMs: segmentStartedAtMs,
  };
  return ledger;
}

function commitCandidate(ledger, candidate, persist) {
  candidate.revision += 1;
  if (persist) persist(publicLedger(candidate));
  Object.assign(ledger, candidate);
}

function stepUsage(ledger, stepId) {
  const step = ledger.perStep.find((entry) => entry.stepId === stepId);
  if (!step) throw budgetError('UNKNOWN_STEP', '/stepId', `Unknown step: ${stepId}`);
  return step.counters;
}

function syncElapsedCounters(candidate) {
  candidate.total.elapsedMinutes.consumed = candidate.timing.totalActiveMs / 60000;
  for (const { stepId, counters: stepCounters } of candidate.perStep) {
    stepCounters.elapsedMinutes.consumed = candidate.timing.activeMsByStep[stepId] / 60000;
  }
}

function clockNow(candidate) {
  const nowMs = candidate.now();
  if (!Number.isFinite(nowMs) || nowMs < candidate.timing.observedAtMs) {
    throw budgetError('INVALID_CLOCK', '/now', 'Clock must be finite and monotonic');
  }
  return nowMs;
}

// Fecha o segmento ativo corrente: soma o tempo decorrido (relógio monotônico) ao total e ao step
// ativo, e reabre uma nova âncora. Com segmentStartedAtMs === null o relógio está pausado (ex.:
// AWAITING_COMMIT) e nada é acumulado — a espera humana não conta como tempo ativo.
function accumulateActive(candidate) {
  if (candidate.timing.segmentStartedAtMs === null) return;
  const nowMs = clockNow(candidate);
  const elapsedMs = nowMs - candidate.timing.segmentStartedAtMs;
  candidate.timing.totalActiveMs += elapsedMs;
  if (candidate.timing.activeStepId !== null) {
    candidate.timing.activeMsByStep[candidate.timing.activeStepId] += elapsedMs;
  }
  candidate.timing.observedAtMs = nowMs;
  candidate.timing.segmentStartedAtMs = nowMs;
  syncElapsedCounters(candidate);
}

function observeElapsed(candidate, stepId) {
  if (candidate.timing.segmentStartedAtMs === null) {
    const nowMs = clockNow(candidate);
    candidate.timing.segmentStartedAtMs = nowMs;
    candidate.timing.observedAtMs = nowMs;
  } else {
    accumulateActive(candidate);
  }
  candidate.timing.activeStepId = stepId;
}

function pauseBudget(ledger, persist) {
  const candidate = cloneLedger(ledger);
  accumulateActive(candidate);
  candidate.timing.segmentStartedAtMs = null;
  candidate.timing.activeStepId = null;
  commitCandidate(ledger, candidate, persist);
  return { ok: true, totalActiveMs: candidate.timing.totalActiveMs };
}

function block(metricName, scope, value, requested, reason = 'limit') {
  const code = reason === 'measurement' ? 'BUDGET_MEASUREMENT_REQUIRED' : 'BUDGET_EXCEEDED';
  return {
    ok: false,
    blocked: {
      code,
      metric: metricName,
      scope,
      limit: value.limit,
      consumed: value.consumed,
      reserved: value.reserved,
      requested,
    },
    nextAction: 'BLOCKED',
  };
}

function requestedMetrics(action, options) {
  const base = ACTION_METRICS[action];
  if (!base) throw budgetError('UNKNOWN_BUDGET_ACTION', '/action', `Unknown budget action: ${action}`);
  const requested = { ...base };
  if (base.agentCalls) {
    requested.estimatedCost = options.estimatedCost;
    requested.tokens = options.tokens;
  }
  return requested;
}

function validateAmount(name, amount) {
  if (amount === null || amount === undefined) return;
  const integer = ['attempts', 'agentCalls', 'reviewCycles', 'diagnosisCycles', 'tokens'].includes(name);
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || (integer && !Number.isInteger(amount))) {
    throw budgetError('INVALID_RESERVATION', `/amounts/${name}`, `${name} reservation must be a finite non-negative${integer ? ' integer' : ' number'}`);
  }
}

function reserveBudget(ledger, options, persist) {
  const candidate = cloneLedger(ledger);
  const step = stepUsage(candidate, options.stepId);
  observeElapsed(candidate, options.stepId);
  const requested = requestedMetrics(options.action, options);

  for (const [name, amount] of Object.entries(requested)) {
    validateAmount(name, amount);
    for (const [scope, values] of [['step', step], ['total', candidate.total]]) {
      const value = values[name];
      if (NULLABLE_METRICS.has(name) && value.limit !== null && (amount === null || amount === undefined || value.consumed === null)) {
        return block(name, scope, value, amount ?? null, 'measurement');
      }
      if (value.limit !== null && value.consumed + value.reserved + (amount || 0) > value.limit) {
        return block(name, scope, value, amount || 0);
      }
    }
  }

  // A reached limit blocks every subsequent costly action, even if that action does not debit that metric.
  for (const [scope, values] of [['step', step], ['total', candidate.total]]) {
    for (const name of METRICS) {
      const value = values[name];
      if (value.limit !== null && (value.consumed === null || value.consumed + value.reserved >= value.limit)) {
        return block(name, scope, value, requested[name] || 0, value.consumed === null ? 'measurement' : 'limit');
      }
    }
  }

  const id = options.reservationId || `reservation-${crypto.randomUUID()}`;
  const reservedAt = new Date(options.wallTimeMs ?? Date.now()).toISOString();
  for (const [name, amount] of Object.entries(requested)) {
    if (amount === null || amount === undefined || amount === 0) continue;
    step[name].reserved += amount;
    candidate.total[name].reserved += amount;
    candidate.reservations.push({
      id,
      stepId: options.stepId,
      metric: name,
      amount,
      status: 'reserved',
      reservedAt,
      reconciledAt: null,
    });
  }
  commitCandidate(ledger, candidate, persist);
  return { ok: true, reservationId: id, nextAction: options.action };
}

function reconcileReservation(ledger, reservationId, result, persist) {
  const candidate = cloneLedger(ledger);
  const reservations = candidate.reservations.filter((entry) => (
    entry.id === reservationId && ['reserved', 'reconciliation-required'].includes(entry.status)
  ));
  if (reservations.length === 0) throw budgetError('UNKNOWN_RESERVATION', '/reservationId', `No pending reservation: ${reservationId}`);
  const status = result.status;
  if (!['consumed', 'released', 'reconciliation-required'].includes(status)) {
    throw budgetError('INVALID_RECONCILIATION', '/status', 'Reconciliation status must be consumed, released, or reconciliation-required');
  }
  observeElapsed(candidate, reservations[0].stepId);
  const step = stepUsage(candidate, reservations[0].stepId);
  const measured = { estimatedCost: result.estimatedCost, tokens: result.tokens };

  for (const reservation of reservations) {
    const totalMetric = candidate.total[reservation.metric];
    const stepMetric = step[reservation.metric];
    if (status !== 'reconciliation-required') {
      totalMetric.reserved -= reservation.amount;
      stepMetric.reserved -= reservation.amount;
    }
    if (status === 'consumed') {
      let amount = reservation.amount;
      if (NULLABLE_METRICS.has(reservation.metric)) {
        const report = measured[reservation.metric];
        if (report === null || report === undefined) {
          totalMetric.consumed = null;
          stepMetric.consumed = null;
          amount = null;
        } else {
          validateAmount(reservation.metric, report);
          amount = report;
        }
      }
      if (amount !== null) {
        totalMetric.consumed += amount;
        stepMetric.consumed += amount;
      }
      if (reservation.metric === 'agentCalls') {
        const role = result.role;
        if (!['executor', 'reviewer', 'diagnostician'].includes(role)) {
          throw budgetError('INVALID_RECONCILIATION', '/role', 'Consumed agent calls require a valid role');
        }
        candidate.total.agentCallsByRole[role] += reservation.amount;
        step.agentCallsByRole[role] += reservation.amount;
      }
    }
    reservation.status = status;
    reservation.reconciledAt = status === 'reconciliation-required' ? null : new Date(result.wallTimeMs ?? Date.now()).toISOString();
  }
  commitCandidate(ledger, candidate, persist);
  return { ok: true, reservationId, status };
}

function reconcilePendingReservations(ledger, decisions, persist) {
  const ids = [...new Set(ledger.reservations
    .filter((entry) => ['reserved', 'reconciliation-required'].includes(entry.status))
    .map((entry) => entry.id))];
  for (const id of ids) {
    const decision = decisions?.[id] || { status: 'reconciliation-required' };
    reconcileReservation(ledger, id, decision, persist);
  }
  const unresolved = [...new Set(ledger.reservations
    .filter((entry) => entry.status === 'reconciliation-required')
    .map((entry) => entry.id))];
  return unresolved.length === 0
    ? { ok: true, reconciled: ids.length }
    : { ok: false, reconciled: ids.length - unresolved.length, unresolved, nextAction: 'BLOCKED' };
}

module.exports = {
  METRICS,
  createBudgetLedger,
  pauseBudget,
  publicLedger,
  reconcilePendingReservations,
  reconcileReservation,
  reserveBudget,
  restoreBudgetLedger,
  validateBudgetPolicy,
};
