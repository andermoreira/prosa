'use strict';

const DEFAULT_MAX_BYTES = 256 * 1024;
const REDACTED = '[REDACTED]';
const ENVIRONMENT_REDACTED = '[REDACTED:ENVIRONMENT]';

function sanitizeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

const ENVIRONMENT_KEY = /^(?:env|environment|processEnv)$/i;
const SECRET_KEY_SUFFIXES = Object.freeze([
  'token', 'apikey', 'accesstoken', 'refreshtoken', 'authtoken', 'ghtoken', 'npmtoken',
  'authorization', 'auth', 'bearer', 'clientsecret', 'cookie', 'setcookie', 'credential',
  'jwt', 'password', 'passwd', 'privatekey', 'secret', 'session', 'sessionid',
]);
const SECRET_KEY_SEGMENTS = new Set([
  'auth', 'authorization', 'bearer', 'cookie', 'credential', 'jwt', 'passwd', 'password',
  'secret', 'session', 'token',
]);
const SECRET_KEY_COMPOUNDS = Object.freeze([
  'accesstoken', 'apikey', 'authtoken', 'clientsecret', 'ghtoken', 'npmtoken',
  'privatekey', 'refreshtoken', 'sessionid', 'setcookie',
]);
const SECRET_LABEL = String.raw`(?:api[\s_.-]*key|access[\s_.-]*token|refresh[\s_.-]*token|auth[\s_.-]*token|gh[\s_.-]*token|npm[\s_.-]*token|token|auth(?:orization)?|bearer|client[\s_.-]*secret|set[\s_.-]*cookie|cookie|credential|jwt|password|passwd|private[\s_.-]*key|secret|session(?:[\s_.-]*id)?)`;
const TEXT_RULES = [
  [/(-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----)[\s\S]*?(-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----)/g, '$1\n[REDACTED]\n$2'],
  [/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[REDACTED:JWT]'],
  [/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, '[REDACTED:API_KEY]'],
  [/\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{12,}\b/g, '[REDACTED:API_KEY]'],
  [/\b(?:gh[opsur]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, '[REDACTED:API_KEY]'],
  [/(https?:\/\/[^\s:/@]+:)[^\s@/]+(@[^\s]+)/gi, '$1[REDACTED]$2'],
  [new RegExp(`\\b(${SECRET_LABEL}\\s*[:=]\\s*)(?!\\[REDACTED)(?:"(?:\\\\.|[^"])*"|'(?:\\\\.|[^'])*'|[^\\s,;}&]+)`, 'gi'), '$1[REDACTED]'],
  [new RegExp(`\\b([A-Z][A-Z0-9_.-]*${SECRET_LABEL}\\s*=\\s*)(?:"[^"]*"|'[^']*'|[^\\s]+)`, 'gi'), '$1[REDACTED]'],
  [/\b((?:set-cookie|cookie|authorization)\s*:\s*)[^\r\n]+/gi, '$1[REDACTED]'],
];

function truncateUtf8(value, maxBytes) {
  const bytes = Buffer.byteLength(value);
  if (bytes <= maxBytes) return { value, truncated: false, originalBytes: bytes };
  const marker = '\n[TRUNCATED]';
  const available = Math.max(0, maxBytes - Buffer.byteLength(marker));
  let kept = Buffer.from(value).subarray(0, available).toString('utf8');
  if (kept.endsWith('\uFFFD')) kept = kept.slice(0, -1);
  return { value: `${kept}${marker}`, truncated: true, originalBytes: bytes };
}

function redactText(input) {
  let value = input;
  let redacted = false;
  const environmentBlock = /(?:^(?:[A-Za-z_][A-Za-z0-9_]*=)[^\r\n]*(?:\r?\n|$)){3,}/gm;
  if (environmentBlock.test(value)) {
    environmentBlock.lastIndex = 0;
    value = value.replace(environmentBlock, `${ENVIRONMENT_REDACTED}\n`);
    redacted = true;
  }
  for (const [pattern, replacement] of TEXT_RULES) {
    pattern.lastIndex = 0;
    if (pattern.test(value)) {
      pattern.lastIndex = 0;
      value = value.replace(pattern, replacement);
      redacted = true;
    }
  }
  return { value, redacted };
}

function isSecretKey(key) {
  const normalized = key.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  const segments = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  if (segments.some((segment) => SECRET_KEY_SEGMENTS.has(segment))) return true;
  if (SECRET_KEY_COMPOUNDS.some((compound) => normalized.includes(compound))) return true;
  return normalized.startsWith('cookie') || normalized.startsWith('session')
    || SECRET_KEY_SUFFIXES.some((suffix) => normalized === suffix || normalized.endsWith(suffix));
}

function sanitizeStructured(input, seen = new WeakSet()) {
  if (input === null || typeof input === 'number' || typeof input === 'boolean') return { value: input, redacted: false };
  if (typeof input === 'string') return redactText(input);
  if (typeof input !== 'object' || Buffer.isBuffer(input) || ArrayBuffer.isView(input)) {
    throw sanitizeError('ARTIFACT_NOT_SANITIZABLE', 'Artifact contains an unsupported value');
  }
  if (seen.has(input)) throw sanitizeError('ARTIFACT_NOT_SANITIZABLE', 'Artifact contains a circular value');
  seen.add(input);
  let redacted = false;
  const value = Array.isArray(input) ? [] : {};
  for (const [key, item] of Object.entries(input)) {
    if (item === undefined) {
      if (Array.isArray(input)) value[key] = null;
      continue;
    } else if (ENVIRONMENT_KEY.test(key)) {
      value[key] = ENVIRONMENT_REDACTED;
      redacted = true;
    } else if (isSecretKey(key)) {
      value[key] = REDACTED;
      redacted = true;
    } else {
      const sanitized = sanitizeStructured(item, seen);
      value[key] = sanitized.value;
      redacted ||= sanitized.redacted;
    }
  }
  seen.delete(input);
  return { value, redacted };
}

function sanitize(input, options = {}) {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 64) throw sanitizeError('SANITIZE_LIMIT_INVALID', 'maxBytes must be an integer of at least 64');
  let sanitized;
  let text;
  if (typeof input === 'string') {
    sanitized = redactText(input);
    text = sanitized.value;
  } else {
    sanitized = sanitizeStructured(input);
    text = `${JSON.stringify(sanitized.value, null, 2)}\n`;
  }
  const bounded = truncateUtf8(text, maxBytes);
  return {
    content: bounded.value,
    redacted: sanitized.redacted,
    truncated: bounded.truncated,
    originalBytes: bounded.originalBytes,
    bytes: Buffer.byteLength(bounded.value),
  };
}

function sanitizeJsonDocument(input, options = {}) {
  if (typeof input !== 'string') throw sanitizeError('UNTRUSTED_JSON_INVALID', 'Untrusted structured output must be a JSON document');
  let value;
  try { value = JSON.parse(input); }
  catch { throw sanitizeError('UNTRUSTED_JSON_INVALID', 'Untrusted structured output must be one complete JSON document'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw sanitizeError('UNTRUSTED_JSON_INVALID', 'Untrusted structured output must be a JSON object');
  }
  const result = sanitize(value, options);
  if (result.truncated) throw sanitizeError('UNTRUSTED_JSON_TOO_LARGE', 'Untrusted structured output exceeds its persistence limit');
  return { ...result, value: JSON.parse(result.content) };
}

function summarizeOpaque(input, options = {}) {
  const value = Buffer.isBuffer(input) ? input : Buffer.from(String(input ?? ''));
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 64) throw sanitizeError('SANITIZE_LIMIT_INVALID', 'maxBytes must be an integer of at least 64');
  return {
    format: 'opaque-summary',
    hash: require('node:crypto').createHash('sha256').update(value).digest('hex'),
    bytes: value.length,
    persisted: false,
  };
}

module.exports = {
  DEFAULT_MAX_BYTES,
  ENVIRONMENT_REDACTED,
  REDACTED,
  redactText,
  sanitize,
  sanitizeJsonDocument,
  sanitizeStructured,
  summarizeOpaque,
};
