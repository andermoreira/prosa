'use strict';

const crypto = require('node:crypto');
const Ajv2020 = require('ajv/dist/2020');
const { parseYaml, validate } = require('./contracts.cjs');
const { runProcess } = require('./process.cjs');

const POLICY_PATH = 'workflow/risk-policy.yaml';
const LEVELS = Object.freeze(['autonomous', 'approval_required', 'restricted']);
const LEVEL_RANK = Object.freeze(Object.fromEntries(LEVELS.map((level, rank) => [level, rank])));
const REQUIRED_CHANGE_TYPES = Object.freeze([
  'bugfix', 'test', 'vetted_dependency', 'documentation', 'feature', 'api_contract',
  'database_migration', 'architecture', 'security', 'irreversible', 'infrastructure', 'permissions',
]);
const SHA_PATTERN = /^[0-9a-f]{40,64}$/i;
const POLICY_HARD_LIMIT = 1024 * 1024;
const PATH_PATTERN = '^(?!/)(?!.*(?:^|/)\\.\\.(?:/|$))[^\\u0000-\\u001f\\u007f-\\u009f]+/$';
const IDENTIFIER_PATTERN = '^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$';
const CHANGE_TYPE_PATTERN = '^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$';

const policySchema = {
  type: 'object', additionalProperties: false,
  required: ['schemaVersion', 'decisionSemanticsVersion', 'levels', 'legacyStep', 'changeTypes', 'areaRules', 'limits'],
  properties: {
    schemaVersion: { const: '1.0.0' },
    decisionSemanticsVersion: { const: '1.0.0' },
    levels: {
      type: 'array', minItems: 3, maxItems: 3,
      items: {
        type: 'object', additionalProperties: false, required: ['id', 'rank'],
        properties: { id: { enum: LEVELS }, rank: { type: 'integer', minimum: 0, maximum: 2 } },
      },
    },
    legacyStep: {
      type: 'object', additionalProperties: false,
      required: ['schemaVersion', 'level', 'signalKind', 'reason'],
      properties: {
        schemaVersion: { const: '1.0.0' },
        level: { const: 'restricted' },
        signalKind: { const: 'legacy-step-without-change-type' },
        reason: { type: 'string', minLength: 1, maxLength: 2000, pattern: '^[^\\u0000-\\u001f\\u007f-\\u009f]+$' },
      },
    },
    changeTypes: {
      type: 'object', minProperties: 1, maxProperties: 64,
      propertyNames: { pattern: CHANGE_TYPE_PATTERN },
      additionalProperties: { enum: LEVELS },
    },
    areaRules: {
      type: 'array', maxItems: 128,
      items: {
        type: 'object', additionalProperties: false, required: ['id', 'prefix', 'minimumLevel'],
        properties: {
          id: { type: 'string', pattern: IDENTIFIER_PATTERN, maxLength: 128 },
          prefix: { type: 'string', pattern: PATH_PATTERN, maxLength: 512 },
          minimumLevel: { enum: LEVELS },
        },
      },
    },
    limits: {
      type: 'object', additionalProperties: false,
      required: ['maxPolicyBytes', 'maxSignals', 'maxReasonLength', 'maxEvidenceRefs', 'maxEvidenceRefLength'],
      properties: {
        maxPolicyBytes: { type: 'integer', minimum: 1024, maximum: POLICY_HARD_LIMIT },
        maxSignals: { type: 'integer', minimum: 1, maximum: 1024 },
        maxReasonLength: { type: 'integer', minimum: 1, maximum: 2000 },
        maxEvidenceRefs: { type: 'integer', minimum: 1, maximum: 20 },
        maxEvidenceRefLength: { type: 'integer', minimum: 1, maximum: 256 },
      },
    },
  },
};

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validatePolicySchema = ajv.compile(policySchema);

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function canonicalJson(value) {
  return JSON.stringify(canonical(value));
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function policyError(code, path, message) {
  return { code, path: path || '/', message };
}

function failure(code, path, message) {
  return { ok: false, errors: [policyError(code, path, message)] };
}

function riskError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function schemaErrors(errors = []) {
  return errors.map((error) => {
    const property = error.params.missingProperty || error.params.additionalProperty;
    return policyError(
      `RISK_POLICY_SCHEMA_${error.keyword.toUpperCase()}`,
      property ? `${error.instancePath}/${property}` : error.instancePath,
      error.message || 'Risk policy schema validation failed',
    );
  });
}

function semanticErrors(policy, source) {
  const errors = [];
  if (Buffer.byteLength(source) > policy.limits.maxPolicyBytes) {
    errors.push(policyError('RISK_POLICY_TOO_LARGE', '/', `Risk policy exceeds its ${policy.limits.maxPolicyBytes} byte limit`));
  }
  if (policy.levels.some((entry, index) => entry.id !== LEVELS[index] || entry.rank !== index)) {
    errors.push(policyError('RISK_POLICY_LEVELS_INVALID', '/levels', 'Risk levels and ranks must use the canonical order'));
  }
  for (const changeType of REQUIRED_CHANGE_TYPES) {
    if (!(changeType in policy.changeTypes)) errors.push(policyError('RISK_POLICY_CHANGE_TYPE_REQUIRED', `/changeTypes/${changeType}`, `Required changeType is missing: ${changeType}`));
  }
  for (const property of ['id', 'prefix']) {
    const seen = new Set();
    for (const [index, rule] of policy.areaRules.entries()) {
      if (seen.has(rule[property])) errors.push(policyError(`RISK_POLICY_DUPLICATE_AREA_${property.toUpperCase()}`, `/areaRules/${index}/${property}`, `Duplicate area rule ${property}: ${rule[property]}`));
      seen.add(rule[property]);
    }
  }
  return errors;
}

function validateRiskPolicySource(source, origin = { type: 'memory' }) {
  if (typeof source !== 'string') return failure('RISK_POLICY_INPUT_TYPE', '/', 'Risk policy source must be a string');
  if (Buffer.byteLength(source) > POLICY_HARD_LIMIT) return failure('RISK_POLICY_TOO_LARGE', '/', `Risk policy exceeds ${POLICY_HARD_LIMIT} bytes`);
  const parsed = parseYaml(source, { maxDocumentBytes: POLICY_HARD_LIMIT });
  if (!parsed.ok) return { ok: false, errors: parsed.errors.map((error) => ({ ...error, code: `RISK_POLICY_${error.code}` })) };
  if (!validatePolicySchema(parsed.value)) return { ok: false, errors: schemaErrors(validatePolicySchema.errors) };
  const errors = semanticErrors(parsed.value, source);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: deepFreeze({ policy: parsed.value, hash: sha256(source), origin }), errors: [] };
}

async function loadRiskPolicyFromGit(repoRoot, baseSha) {
  if (typeof baseSha !== 'string' || !SHA_PATTERN.test(baseSha)) {
    return failure('INVALID_BASE_SHA', '/baseSha', 'Base SHA must be a full hexadecimal object ID');
  }
  const result = await runProcess({
    executable: 'git', args: ['show', `${baseSha}:${POLICY_PATH}`], root: repoRoot, cwd: '.',
    envAllowlist: ['HOME', 'PATH', 'TMPDIR'], timeoutMs: 30000, maxOutputBytes: POLICY_HARD_LIMIT,
  });
  if (!result.ok) return failure('GIT_RISK_POLICY_READ_ERROR', '/', `Unable to read ${POLICY_PATH} from approved base`);
  return validateRiskPolicySource(result.stdout.text, { type: 'git', baseSha: baseSha.toLowerCase(), path: POLICY_PATH });
}

function assertPolicyRecord(policyRecord) {
  if (!policyRecord?.policy || !/^[0-9a-f]{64}$/.test(policyRecord.hash || '')) {
    throw riskError('RISK_POLICY_INVALID', 'A validated risk policy record is required');
  }
  const source = canonicalJson(policyRecord.policy);
  if (!validatePolicySchema(policyRecord.policy) || semanticErrors(policyRecord.policy, source).some((error) => error.code !== 'RISK_POLICY_TOO_LARGE')) {
    throw riskError('RISK_POLICY_INVALID', 'Risk policy record is invalid');
  }
}

function maxLevel(...levels) {
  for (const level of levels) {
    if (!(level in LEVEL_RANK)) throw riskError('RISK_LEVEL_INVALID', `Unknown risk level: ${level}`);
  }
  return levels.reduce((highest, level) => LEVEL_RANK[level] > LEVEL_RANK[highest] ? level : highest, 'autonomous');
}

function matchesPrefix(candidate, prefix) {
  const directory = prefix.slice(0, -1);
  return candidate === directory || candidate.startsWith(prefix);
}

function assertStepPaths(step) {
  const collections = [
    ['predictedFiles', step.predictedFiles, 5],
    ['allowedAreas', step.allowedAreas, 128],
  ];
  for (const [name, values, maxItems] of collections) {
    if (!Array.isArray(values) || values.length < 1 || values.length > maxItems) {
      throw riskError('RISK_STEP_PATHS_INVALID', `Step ${name} must contain between 1 and ${maxItems} paths`);
    }
    if (new Set(values).size !== values.length) throw riskError('RISK_STEP_PATHS_INVALID', `Step ${name} must not contain duplicate paths`);
    for (const candidate of values) {
      const segments = typeof candidate === 'string' ? candidate.split('/') : [];
      if (typeof candidate !== 'string' || candidate.length < 1 || candidate.length > 512 || candidate.startsWith('/') || candidate.startsWith('./')
        || candidate.includes('\\') || /[\u0000-\u001f\u007f-\u009f]/.test(candidate)
        || segments.some((segment, index) => segment === '.' || segment === '..' || (segment === '' && index < segments.length - 1))) {
        throw riskError('RISK_STEP_PATHS_INVALID', `Step ${name} contains a noncanonical repository path`);
      }
    }
  }
}

function classifyStep(policy, step) {
  if (!step || typeof step !== 'object' || Array.isArray(step)) throw riskError('RISK_STEP_INVALID', 'Step must be an object');
  if (!['1.0.0', '2.0.0'].includes(step.schemaVersion)) throw riskError('RISK_STEP_VERSION_INVALID', `Unsupported step schema version: ${step.schemaVersion}`);
  assertStepPaths(step);

  const declaredPaths = [...step.predictedFiles, ...step.allowedAreas];
  const matchedAreaRules = policy.areaRules.filter((rule) => declaredPaths.some((candidate) => matchesPrefix(candidate, rule.prefix)));
  if (step.schemaVersion === '1.0.0') {
    return {
      changeType: null,
      typeLevel: policy.legacyStep.level,
      baseLevel: policy.legacyStep.level,
      matchedAreaRules,
      legacySignal: { kind: policy.legacyStep.signalKind, minimumLevel: policy.legacyStep.level, reason: policy.legacyStep.reason },
    };
  }
  if (typeof step.changeType !== 'string' || !(step.changeType in policy.changeTypes)) {
    throw riskError('RISK_CHANGE_TYPE_UNKNOWN', `Unknown or missing v2 changeType: ${step.changeType}`);
  }
  const typeLevel = policy.changeTypes[step.changeType];
  const areaLevel = maxLevel(...matchedAreaRules.map((rule) => rule.minimumLevel));
  return { changeType: step.changeType, typeLevel, baseLevel: maxLevel(typeLevel, areaLevel), matchedAreaRules, legacySignal: null };
}

function signalIdentity(signal) {
  const { fingerprint: ignored, ...identity } = signal;
  return identity;
}

function fingerprintRiskSignal(signal) {
  return sha256(canonicalJson(signalIdentity(signal)));
}

function normalizeRiskSignals(policy, signals) {
  if (!Array.isArray(signals)) throw riskError('RISK_SIGNALS_INVALID', 'Risk signals must be an array');
  if (signals.length > policy.limits.maxSignals) throw riskError('RISK_SIGNALS_LIMIT', `Risk signals exceed the ${policy.limits.maxSignals} item limit`);
  const byFingerprint = new Map();
  for (const signal of signals) {
    const result = validate('risk-signal', signal);
    if (!result.ok) throw riskError('RISK_SIGNAL_INVALID', 'Risk signal contract validation failed', { errors: result.errors });
    if (signal.reason.length > policy.limits.maxReasonLength
      || signal.evidenceRefs.length > policy.limits.maxEvidenceRefs
      || signal.evidenceRefs.some((reference) => reference.length > policy.limits.maxEvidenceRefLength)) {
      throw riskError('RISK_SIGNAL_LIMIT', 'Risk signal exceeds policy limits');
    }
    const expectedFingerprint = fingerprintRiskSignal(signal);
    if (signal.fingerprint !== expectedFingerprint) throw riskError('RISK_SIGNAL_FINGERPRINT_INVALID', 'Risk signal fingerprint does not match its content');
    const normalized = canonical(signal);
    const existing = byFingerprint.get(signal.fingerprint);
    if (existing && canonicalJson(existing) !== canonicalJson(normalized)) {
      throw riskError('RISK_SIGNAL_FINGERPRINT_CONFLICT', `Conflicting signal fingerprint: ${signal.fingerprint}`);
    }
    byFingerprint.set(signal.fingerprint, normalized);
  }
  return [...byFingerprint.values()].sort((left, right) => left.fingerprint.localeCompare(right.fingerprint));
}

function assessRisk({ policyRecord, step, signals = [], previousEffectiveLevel = 'autonomous' }) {
  assertPolicyRecord(policyRecord);
  const classification = classifyStep(policyRecord.policy, step);
  const normalizedSignals = normalizeRiskSignals(policyRecord.policy, signals);
  const effectiveLevel = maxLevel(
    classification.baseLevel,
    previousEffectiveLevel,
    ...normalizedSignals.map((signal) => signal.minimumLevel),
  );
  const assessment = {
    schemaVersion: '1.0.0',
    policy: { schemaVersion: policyRecord.policy.schemaVersion, hash: policyRecord.hash, origin: policyRecord.origin || null },
    step: { schemaVersion: step.schemaVersion, changeType: classification.changeType },
    typeLevel: classification.typeLevel,
    baseLevel: classification.baseLevel,
    effectiveLevel,
    matchedAreaRules: classification.matchedAreaRules.map(({ id, prefix, minimumLevel }) => ({ id, prefix, minimumLevel })),
    signals: normalizedSignals,
    legacySignal: classification.legacySignal,
  };
  return { ...assessment, hash: sha256(canonicalJson(assessment)) };
}

module.exports = {
  LEVELS,
  POLICY_PATH,
  assessRisk,
  fingerprintRiskSignal,
  loadRiskPolicyFromGit,
  maxLevel,
  normalizeRiskSignals,
  validateRiskPolicySource,
};
