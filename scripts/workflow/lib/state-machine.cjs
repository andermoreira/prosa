'use strict';

/**
 * state-machine.cjs — grafo de transições do run e de cada step, com pré-condições por aresta.
 *
 * As transições permitidas (RUN_TRANSITIONS/STEP_TRANSITIONS) e o mapa PRECONDITIONS são a
 * autoridade sobre o que pode acontecer. `transitionRun`/`transitionStep` são puros e recusam
 * qualquer passo fora do grafo ou sem as pré-condições provadas pelo caller (ex.: lockHeld,
 * revalidated, budgetAvailable); cada passo anexa um registro auditável a `transitions`.
 * `assertValidStateMachine` reexecuta todo o histórico no resume para provar que o `state`
 * persistido não foi corrompido nem adulterado. Terminais: SUCCEEDED/FAILED/CANCELLED/BLOCKED.
 * Ver docs/workflows/automated-spec-pipeline.md § Gates e estado.
 */

const crypto = require('node:crypto');

const RUN_ACTIVE = ['CREATED', 'VALIDATED', 'LOCKED', 'RUNNING', 'FINAL_REVIEW', 'GLOBAL_ACCEPTANCE', 'REPORTING'];
const STEP_EXECUTION_ACTIVE = ['PENDING', 'READY', 'WORKTREE_READY', 'EXECUTING', 'GATING', 'REVALIDATING', 'REVIEWING', 'ACCEPTING', 'RETRY_PENDING', 'DIAGNOSING'];
const STEP_AWAITING_APPROVAL = ['AWAITING_PRE_APPROVAL', 'AWAITING_DIFF_APPROVAL'];
const STEP_ACTIVE = [...STEP_EXECUTION_ACTIVE, ...STEP_AWAITING_APPROVAL];
const RUN_TRANSITIONS = transitionMap([
  ['CREATED', 'VALIDATED'], ['VALIDATED', 'LOCKED'], ['LOCKED', 'RUNNING'],
  ['RUNNING', 'FINAL_REVIEW'], ['FINAL_REVIEW', 'GLOBAL_ACCEPTANCE'],
  ['GLOBAL_ACCEPTANCE', 'REPORTING'], ['REPORTING', 'SUCCEEDED'], ['BLOCKED', 'VALIDATED'], ['BLOCKED', 'RUNNING'],
  ...RUN_ACTIVE.flatMap((from) => ['BLOCKED', 'FAILED', 'CANCELLED'].map((to) => [from, to])),
]);
const STEP_TRANSITIONS = transitionMap([
  ['PENDING', 'READY'], ['READY', 'AWAITING_PRE_APPROVAL'], ['AWAITING_PRE_APPROVAL', 'READY'],
  ['READY', 'WORKTREE_READY'], ['WORKTREE_READY', 'EXECUTING'],
  ['EXECUTING', 'GATING'], ['GATING', 'REVALIDATING'], ['REVALIDATING', 'REVIEWING'],
  ['REVIEWING', 'AWAITING_DIFF_APPROVAL'], ['AWAITING_DIFF_APPROVAL', 'ACCEPTING'],
  ['REVIEWING', 'ACCEPTING'], ['ACCEPTING', 'ACCEPTED'], ['ACCEPTED', 'COMMITTED'],
  ...['EXECUTING', 'GATING', 'REVALIDATING', 'REVIEWING', 'ACCEPTING'].map((from) => [from, 'RETRY_PENDING']),
  ...STEP_AWAITING_APPROVAL.flatMap((from) => ['RETRY_PENDING', 'CANCELLED'].map((to) => [from, to])),
  ['RETRY_PENDING', 'DIAGNOSING'], ['RETRY_PENDING', 'READY'], ['DIAGNOSING', 'READY'],
  ['BLOCKED', 'READY'],
  ...[...STEP_EXECUTION_ACTIVE, 'ACCEPTED'].map((from) => [from, 'BLOCKED']),
  ...STEP_EXECUTION_ACTIVE.flatMap((from) => ['FAILED', 'CANCELLED'].map((to) => [from, to])),
]);

const PRECONDITIONS = Object.freeze({
  'run:VALIDATED->LOCKED': ['lockHeld'],
  'run:BLOCKED->RUNNING': ['resumeRequested', 'causeResolved', 'lockHeld', 'revalidated'],
  'run:BLOCKED->VALIDATED': ['resumeRequested', 'lockHeld', 'revalidated'],
  'step:PENDING->READY': ['dependenciesAccepted'],
  'step:READY->AWAITING_PRE_APPROVAL': ['lockHeld', 'preApprovalRequestPending'],
  'step:AWAITING_PRE_APPROVAL->READY': ['lockHeld', 'approvalSatisfied', 'revalidated'],
  'step:READY->WORKTREE_READY': ['worktreeReady'],
  'step:WORKTREE_READY->EXECUTING': ['revalidated'],
  'step:EXECUTING->GATING': ['executionSucceeded'],
  'step:GATING->REVALIDATING': ['gatesPassed'],
  'step:REVALIDATING->REVIEWING': ['revalidated'],
  'step:REVIEWING->AWAITING_DIFF_APPROVAL': ['lockHeld', 'reviewPassed', 'diffApprovalRequestPending'],
  'step:AWAITING_DIFF_APPROVAL->ACCEPTING': ['lockHeld', 'approvalSatisfied', 'revalidated'],
  'step:REVIEWING->ACCEPTING': ['reviewPassed'],
  'step:ACCEPTING->ACCEPTED': ['acceptancePassed'],
  'step:ACCEPTED->COMMITTED': ['commitAuthorized', 'commitCreated'],
  'step:RETRY_PENDING->DIAGNOSING': ['budgetAvailable', 'diagnosisReserved'],
  'step:RETRY_PENDING->READY': ['retryApproved', 'revalidated'],
  'step:DIAGNOSING->READY': ['diagnosisAllowsRetry', 'revalidated'],
  'step:BLOCKED->READY': ['resumeRequested', 'causeResolved', 'lockHeld', 'revalidated'],
  ...Object.fromEntries(STEP_AWAITING_APPROVAL.flatMap((from) => [
    [`step:${from}->RETRY_PENDING`, ['lockHeld', 'approvalRejected', 'rejectionActionRetry']],
    [`step:${from}->CANCELLED`, ['lockHeld', 'approvalRejected', 'rejectionActionCancel']],
  ])),
});

class StateMachineError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'StateMachineError';
    this.code = code;
    this.details = details;
  }
}

function transitionMap(pairs) {
  const result = new Map();
  for (const [from, to] of pairs) {
    if (!result.has(from)) result.set(from, new Set());
    result.get(from).add(to);
  }
  return result;
}

function assertTransition(kind, from, to, context) {
  const transitions = kind === 'run' ? RUN_TRANSITIONS : STEP_TRANSITIONS;
  if (!transitions.get(from)?.has(to)) {
    throw new StateMachineError('STATE_TRANSITION_INVALID', `Invalid ${kind} transition: ${from} -> ${to}`, { kind, from, to });
  }
  const required = [...(PRECONDITIONS[`${kind}:${from}->${to}`] || [])];
  // Pré-condições implícitas somadas às da tabela: qualquer run já em estado mutável só avança
  // enquanto segura o lock, e todo caminho de retry exige elegibilidade + budget (fail-closed).
  if (kind === 'run' && RUN_ACTIVE.includes(from) && ['LOCKED', 'RUNNING', 'FINAL_REVIEW', 'GLOBAL_ACCEPTANCE', 'REPORTING'].includes(from)) {
    required.push('lockHeld');
  }
  if (to === 'RETRY_PENDING') required.push('retryEligible', 'budgetAvailable');
  const missing = [...new Set(required)].filter((name) => context[name] !== true);
  if (missing.length > 0) {
    throw new StateMachineError('STATE_PRECONDITION_FAILED', `Missing preconditions for ${from} -> ${to}: ${missing.join(', ')}`, { missing });
  }
}

function createRecord(kind, stepId, from, to, context) {
  if (typeof context.cause !== 'string' || context.cause.trim() === '') {
    throw new StateMachineError('STATE_CAUSE_REQUIRED', 'A non-empty transition cause is required');
  }
  const at = context.at || new Date().toISOString();
  const suffix = crypto.randomBytes(12).toString('hex');
  return {
    id: context.id || `transition-${suffix}`,
    kind,
    stepId,
    from,
    to,
    at,
    cause: context.cause,
    usageRevision: context.usageRevision,
  };
}

function transitionRun(state, to, context = {}) {
  assertTransition('run', state.state, to, context);
  const record = createRecord('run', null, state.state, to, { ...context, usageRevision: state.usage.revision });
  return { ...state, state: to, revision: state.revision + 1, updatedAt: record.at, transitions: [...state.transitions, record] };
}

function transitionStep(state, stepId, to, context = {}) {
  const index = state.steps.findIndex((step) => step.id === stepId);
  if (index < 0) throw new StateMachineError('STATE_STEP_UNKNOWN', `Unknown step: ${stepId}`);
  const current = state.steps[index];
  assertTransition('step', current.state, to, context);
  const record = createRecord('step', stepId, current.state, to, { ...context, usageRevision: state.usage.revision });
  const steps = state.steps.map((step, position) => position === index
    ? { ...step, state: to, updatedAt: record.at, cause: context.cause }
    : step);
  return { ...state, steps, revision: state.revision + 1, updatedAt: record.at, transitions: [...state.transitions, record] };
}

// Replay do histórico a partir da gênese (run=CREATED, cada step=PENDING): reaplica cada
// transição registrada exigindo que `from` bata com o estado corrente e que a aresta exista.
// No fim, o estado replayado tem de coincidir com o `state` persistido — é o que detecta um
// state.json corrompido ou adulterado antes de o resume confiar nele.
function validateTransitionHistory(state) {
  const run = { value: 'CREATED' };
  const steps = new Map(state.steps.map((step) => [step.id, 'PENDING']));
  for (const transition of state.transitions) {
    const current = transition.kind === 'run' ? run.value : steps.get(transition.stepId);
    const allowed = transition.kind === 'run' ? RUN_TRANSITIONS : STEP_TRANSITIONS;
    if (current !== transition.from || !allowed.get(transition.from)?.has(transition.to)) return false;
    if (transition.kind === 'run') run.value = transition.to;
    else if (!steps.has(transition.stepId)) return false;
    else steps.set(transition.stepId, transition.to);
  }
  return run.value === state.state && state.steps.every((step) => steps.get(step.id) === step.state);
}

function assertValidStateMachine(state) {
  if (!state || !Array.isArray(state.transitions) || !Array.isArray(state.steps) || !validateTransitionHistory(state)) {
    throw new StateMachineError('STATE_HISTORY_INVALID', 'Persisted transition history does not match current state');
  }
  return state;
}

module.exports = {
  RUN_ACTIVE,
  RUN_TRANSITIONS,
  STEP_ACTIVE,
  STEP_TRANSITIONS,
  StateMachineError,
  assertValidStateMachine,
  transitionRun,
  transitionStep,
};
