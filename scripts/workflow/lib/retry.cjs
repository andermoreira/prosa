'use strict';

// Every code here is cheap to retry: it fails in seconds and the next attempt is likely to work.
// TIMEOUT is deliberately absent — it is the only failure that costs a full timeout window to
// retry, with the same prompt and the same conditions, so it is terminal. See TIMEOUT_CODE below.
const TRANSIENT_CODES = new Set([
  'CONNECTION_RESET',
  'NETWORK_UNAVAILABLE',
  'PROCESS_INTERRUPTED',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
]);
const TIMEOUT_CODE = 'TIMEOUT';
const TERMINAL_CLASSIFICATIONS = new Set([
  'schema',
  'authorization',
  'auth',
  'scope',
  'trust-boundary',
  'trust',
  'gate',
  'deterministic',
  'timeout',
  'budget',
  'drift',
  'sanitization',
]);

function normalize(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function classifyFailure(failure = {}) {
  const classification = normalize(failure.classification);
  if (TERMINAL_CLASSIFICATIONS.has(classification)) {
    return { classification: classification === 'auth' ? 'authorization' : classification, retryable: false };
  }
  const code = typeof failure.code === 'string' ? failure.code.trim().toUpperCase() : '';
  const status = normalize(failure.status);
  // Checked before the transient branch: a timeout must never fall through to a retry, and an
  // explicit `providerRetryable: false` must not be rescued by its status code either.
  if (code === TIMEOUT_CODE || status === 'timed_out') return { classification: 'timeout', retryable: false };
  if (failure.providerRetryable === false) return { classification: 'deterministic', retryable: false };
  // The provider classifies its own failures; only it knows a rate limit from a bad key.
  if (failure.providerRetryable === true) return { classification: 'transient', retryable: true };
  if (TRANSIENT_CODES.has(code) || failure.httpStatus === 429 || failure.httpStatus === 503) {
    return { classification: 'transient', retryable: true };
  }
  return { classification: 'deterministic', retryable: false };
}

function failureFingerprint(failure = {}) {
  const classified = classifyFailure(failure);
  return [
    classified.classification,
    typeof failure.code === 'string' ? failure.code.trim().toUpperCase() : '',
    normalize(failure.phase),
    normalize(failure.role),
  ].join(':');
}

function retryDecision(options) {
  if (!Number.isInteger(options.maxAttempts) || options.maxAttempts <= 0) {
    throw Object.assign(new Error('maxAttempts must be a finite positive integer'), { code: 'INVALID_RETRY_POLICY' });
  }
  const failures = Array.isArray(options.failures) ? options.failures : [];
  if (failures.length === 0) return { retry: false, nextAction: 'EXECUTE', reason: 'NO_FAILURE' };

  const latest = failures.at(-1);
  const classified = classifyFailure(latest);
  if (!classified.retryable) {
    return { retry: false, nextAction: 'BLOCKED', reason: 'NON_RETRYABLE', classification: classified.classification };
  }
  if (failures.length >= options.maxAttempts) {
    return { retry: false, nextAction: 'BLOCKED', reason: 'RETRY_LIMIT_REACHED', classification: 'transient' };
  }

  const fingerprint = failureFingerprint(latest);
  const equivalentFailures = failures.filter((failure) => failureFingerprint(failure) === fingerprint);
  if (equivalentFailures.length >= 2) {
    const secondFailureIndex = failures.lastIndexOf(equivalentFailures.at(-1));
    const diagnosis = (options.diagnoses || []).find((entry) => (
      entry.failureFingerprint === fingerprint
      && entry.afterFailureIndex >= secondFailureIndex
      && entry.fresh === true
      && entry.readOnly === true
    ));
    if (!diagnosis) {
      return {
        retry: false,
        nextAction: 'DIAGNOSE',
        reason: 'DIAGNOSIS_REQUIRED',
        classification: 'transient',
        failureFingerprint: fingerprint,
        diagnostician: { fresh: true, readOnly: true, correctionStep: false },
      };
    }
  }

  return { retry: true, nextAction: 'RETRY', reason: 'TRANSIENT_FAILURE', classification: 'transient' };
}

module.exports = {
  TRANSIENT_CODES,
  classifyFailure,
  failureFingerprint,
  retryDecision,
};
