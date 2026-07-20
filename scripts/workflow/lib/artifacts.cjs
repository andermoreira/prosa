'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { assertSecureRuntimePath, secureMkdir } = require('./runtime.cjs');
const { DEFAULT_MAX_BYTES, sanitize, sanitizeJsonDocument, summarizeOpaque } = require('./sanitize.cjs');

const KIND_FILES = Object.freeze({
  diff: 'diff.patch',
  status: 'status.json',
  'executor-response': 'executor-response.txt',
  'agent-response': 'agent-response.txt',
  'agent-log': 'agent.log',
  verification: 'verification.json',
  review: 'review.json',
  diagnosis: 'diagnosis.json',
});
const TEXT_MEDIA_TYPES = new Set(['text/plain', 'text/x-diff', 'text/x-patch', 'application/x-ndjson']);
const JSON_MEDIA_TYPES = new Set(['application/json']);
// Single source for the artifact kind of an agent response: preserveAgentResponse writes it and
// findAgentResponse looks it up. They diverged once — the lookup guessed a /response$/ suffix that
// 'review' and 'diagnosis' never had — and reconciliation silently failed for those two roles.
const AGENT_RESPONSE_KIND_BY_ROLE = Object.freeze({
  executor: 'executor-response',
  reviewer: 'review',
  diagnostician: 'diagnosis',
});
const FALLBACK_AGENT_RESPONSE_KIND = 'agent-response';
const AGENT_RESPONSE_KINDS = Object.freeze(new Set([
  ...Object.values(AGENT_RESPONSE_KIND_BY_ROLE),
  FALLBACK_AGENT_RESPONSE_KIND,
]));
// Deliberately outside AGENT_RESPONSE_KINDS: an unparseable response is diagnostic evidence, never
// something reconciliation may resume from.
const INVALID_RESPONSE_KIND = 'agent-response-invalid';

function artifactError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function hash(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function assertSegment(value, name) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) {
    throw artifactError('ARTIFACT_PATH_INVALID', `${name} must be a safe path segment`);
  }
  return value;
}

function atomicWriteFile(filePath, content, options = {}) {
  const io = options.fs || fs;
  const primaryRoot = options.primaryRoot;
  if (primaryRoot && io === fs) secureMkdir(primaryRoot, path.dirname(filePath));
  else io.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`);
  let descriptor;
  try {
    descriptor = io.openSync(temporary, 'wx', 0o600);
    io.writeFileSync(descriptor, content, 'utf8');
    io.fsyncSync(descriptor);
    io.closeSync(descriptor);
    descriptor = undefined;
    options.beforeRename?.(temporary, filePath);
    if (primaryRoot && io === fs) {
      assertSecureRuntimePath(primaryRoot, temporary);
      assertSecureRuntimePath(primaryRoot, filePath);
    }
    io.renameSync(temporary, filePath);
    const directory = io.openSync(path.dirname(filePath), 'r');
    try { io.fsyncSync(directory); } finally { io.closeSync(directory); }
  } finally {
    if (descriptor !== undefined) io.closeSync(descriptor);
    io.rmSync(temporary, { force: true });
  }
}

function createArtifactStore(options = {}) {
  if (typeof options.runtimeRoot !== 'string' || !path.isAbsolute(options.runtimeRoot)) {
    throw artifactError('ARTIFACT_RUNTIME_INVALID', 'runtimeRoot must be absolute');
  }
  const runtimeRoot = path.resolve(options.runtimeRoot);
  const primaryRoot = path.dirname(path.dirname(path.dirname(runtimeRoot)));
  const protectedRuntime = path.basename(path.dirname(runtimeRoot)) === 'runs'
    && path.basename(path.dirname(path.dirname(runtimeRoot))) === '.workflow-runtime';
  const artifactsRoot = path.join(runtimeRoot, 'artifacts');
  if (protectedRuntime) secureMkdir(primaryRoot, artifactsRoot);
  else fs.mkdirSync(artifactsRoot, { recursive: true, mode: 0o700 });
  if (options.worktree && path.resolve(artifactsRoot).startsWith(`${path.resolve(options.worktree)}${path.sep}`)) {
    throw artifactError('ARTIFACT_RUNTIME_IN_WORKTREE', 'Artifacts must be stored outside the attempt worktree');
  }
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const now = options.now || (() => new Date().toISOString());

  function attemptDirectory(stepId, attempt) {
    assertSegment(stepId, 'stepId');
    if (!Number.isSafeInteger(attempt) || attempt < 1) throw artifactError('ARTIFACT_PATH_INVALID', 'attempt must be a positive integer');
    const directory = path.join(artifactsRoot, stepId, `attempt-${attempt}`);
    const relative = path.relative(artifactsRoot, directory);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw artifactError('ARTIFACT_PATH_INVALID', 'Artifact path escaped runtime');
    return directory;
  }

  function readManifest(directory) {
    const manifestPath = path.join(directory, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return { schemaVersion: '1.0.0', artifacts: [] };
    try {
      if (fs.lstatSync(manifestPath).isSymbolicLink()) throw new Error('symlink');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (manifest.schemaVersion !== '1.0.0' || !Array.isArray(manifest.artifacts)) throw new Error('shape');
      return manifest;
    } catch {
      throw artifactError('ARTIFACT_MANIFEST_INVALID', 'Artifact manifest is invalid');
    }
  }

  function preserve(input) {
    const kind = assertSegment(input.kind, 'kind');
    const fileName = KIND_FILES[kind] || `${kind}.${JSON_MEDIA_TYPES.has(input.mediaType) ? 'json' : 'txt'}`;
    let mediaType = input.mediaType || (fileName.endsWith('.json') ? 'application/json' : 'text/plain');
    if (!TEXT_MEDIA_TYPES.has(mediaType) && !JSON_MEDIA_TYPES.has(mediaType)) {
      throw artifactError('ARTIFACT_NOT_SANITIZABLE', 'Binary or unknown artifact media type is blocked');
    }
    const provenance = input.provenance;
    if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance) || Object.keys(provenance).length === 0) {
      throw artifactError('ARTIFACT_PROVENANCE_REQUIRED', 'Artifact provenance is required');
    }
    const directory = attemptDirectory(input.stepId, input.attempt);
    if (protectedRuntime) secureMkdir(primaryRoot, directory);
    else fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const realArtifactsRoot = fs.realpathSync(artifactsRoot);
    const realDirectory = fs.realpathSync(directory);
    if (realDirectory !== realArtifactsRoot && !realDirectory.startsWith(`${realArtifactsRoot}${path.sep}`)) {
      throw artifactError('ARTIFACT_PATH_INVALID', 'Artifact directory escaped runtime through a symlink');
    }
    let content = input.content;
    // Only coerce to JSON when the caller has not said the content is text. Deciding by kind alone
    // meant prose was replaced by a placeholder, which is what an executor actually emits.
    // A caller that declares JSON and hands over something else has a bug, and this module throws on
    // everything else it cannot preserve faithfully — the old silent '[OPAQUE OUTPUT OMITTED]'
    // substitution hid exactly the evidence someone would need to find that bug.
    if (typeof content === 'string' && kind !== 'diff' && !TEXT_MEDIA_TYPES.has(input.mediaType)) {
      content = sanitizeJsonDocument(content, { maxBytes }).value;
      mediaType = 'application/json';
    }
    const sanitized = sanitize(content, { maxBytes });
    const sanitizedProvenance = sanitizeStructuredProvenance(provenance);
    const artifactPath = path.join(directory, fileName);
    const ref = {
      id: `${input.stepId}/attempt-${input.attempt}/${kind}`,
      kind,
      path: path.relative(runtimeRoot, artifactPath).split(path.sep).join('/'),
      mediaType,
      schemaVersion: input.schemaVersion || '1.0.0',
      hash: hash(sanitized.content),
      provenance: sanitizedProvenance,
      sensitivity: input.sensitivity || 'internal',
      retention: input.retention || 'run',
      redaction: sanitized.redacted,
      truncation: sanitized.truncated,
      bytes: sanitized.bytes,
      originalBytes: sanitized.originalBytes,
      createdAt: now(),
    };
    const manifest = readManifest(directory);
    manifest.artifacts = manifest.artifacts.filter((entry) => entry.kind !== kind);
    manifest.artifacts.push(ref);
    atomicWriteFile(artifactPath, sanitized.content, { ...(options.atomic || {}), primaryRoot: protectedRuntime ? primaryRoot : undefined });
    atomicWriteFile(path.join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { ...(options.atomic || {}), primaryRoot: protectedRuntime ? primaryRoot : undefined });
    return ref;
  }

  function sanitizeStructuredProvenance(value) {
    const result = sanitize(value, { maxBytes });
    if (result.truncated) throw artifactError('ARTIFACT_PROVENANCE_INVALID', 'Artifact provenance exceeds its limit');
    return JSON.parse(result.content);
  }

  function read(ref) {
    if (!ref || typeof ref.path !== 'string' || !/^[0-9a-f]{64}$/.test(ref.hash || '')) {
      throw artifactError('ARTIFACT_REF_INVALID', 'Artifact reference is invalid');
    }
    const filePath = path.resolve(runtimeRoot, ref.path);
    if (protectedRuntime) assertSecureRuntimePath(primaryRoot, filePath);
    const relative = path.relative(artifactsRoot, filePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw artifactError('ARTIFACT_PATH_INVALID', 'Artifact reference escaped runtime');
    const manifest = readManifest(path.dirname(filePath));
    const recorded = manifest.artifacts.find((entry) => entry.id === ref.id);
    if (!recorded || recorded.path !== ref.path || recorded.hash !== ref.hash) {
      throw artifactError('ARTIFACT_REF_STALE', 'Artifact reference does not match its manifest');
    }
    let content;
    try {
      const realFile = fs.realpathSync(filePath);
      const realArtifactsRoot = fs.realpathSync(artifactsRoot);
      if (!realFile.startsWith(`${realArtifactsRoot}${path.sep}`)) throw new Error('symlink');
      content = fs.readFileSync(realFile, 'utf8');
    }
    catch { throw artifactError('ARTIFACT_MISSING', 'Artifact content is missing'); }
    if (hash(content) !== ref.hash) throw artifactError('ARTIFACT_HASH_MISMATCH', 'Artifact content failed integrity verification');
    return content;
  }

  // Recovers the JSON document from a response that carries commentary or a code fence around it.
  // Deliberately conservative: it only narrows to the outermost braces and hands the result back to
  // the same validator, so a response that is not really the document still fails.
  function extractJsonDocument(response) {
    if (typeof response !== 'string') return response;
    const fenced = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidate = (fenced ? fenced[1] : response).trim();
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end <= start) return response;
    return candidate.slice(start, end + 1);
  }

  // A response that fails to parse is the one worth keeping: it is the only record of what the agent
  // actually said, and without it the operator gets a code and has to reproduce the call by hand.
  // It is preserved under its own kind so reconciliation never mistakes it for a valid response, and
  // preserving it must never mask the parse failure that is the real outcome.
  function structuredResponse(response, { stepId, attempt, provenance }) {
    try {
      return sanitizeJsonDocument(response, { maxBytes }).value;
    } catch (error) {
      // Models think out loud. OpenCode cannot constrain a response to a schema — that is still an
      // open feature request — so the document arrives wrapped in whatever the model said around it,
      // and asking it not to is a request, not a guarantee. The parser has to be what holds.
      const extracted = extractJsonDocument(response);
      if (extracted !== response) {
        try { return sanitizeJsonDocument(extracted, { maxBytes }).value; }
        catch { /* the original failure below stays the outcome */ }
      }
      try {
        preserve({
          stepId,
          attempt,
          kind: INVALID_RESPONSE_KIND,
          mediaType: 'text/plain',
          content: typeof response === 'string' ? response : String(response),
          provenance: { ...provenance, invalidResponseCode: error.code || 'UNTRUSTED_JSON_INVALID' },
          sensitivity: 'sensitive',
        });
      } catch { /* the parse failure below is the outcome; failing to record it must not replace it */ }
      throw error;
    }
  }

  async function preserveAgentResponse(input) {
    if (!/^[0-9a-f]{64}$/.test(input.sandboxPolicyHash || '')) {
      throw artifactError('ARTIFACT_SANDBOX_POLICY_REQUIRED', 'Agent responses require the sandbox policy hash used for the call');
    }
    const stepId = input.role === 'reviewer' && input.reviewOperationId
      ? input.reviewOperationId : input.stepId || options.stepId;
    const attempt = input.attempt || options.attempt;
    const provenance = {
      operationId: input.operationId, role: input.role, process: input.process,
      runId: input.runId, stepId: input.provenanceStepId, attemptId: input.attemptId,
      sourceHash: input.sourceHash, reviewOperationId: input.reviewOperationId,
      originalSnapshotHash: input.originalSnapshotHash, sandboxPolicyHash: input.sandboxPolicyHash,
    };
    // Only the reviewer and the diagnostician answer with a schema-validated JSON document —
    // parseRoleOutput reads theirs. Nothing parses the executor's: its response is evidence, and an
    // executor answers in prose, as its own prompt asks it to. Demanding JSON from it rejected every
    // real agent and let only the literal test string through.
    const structuredRole = input.role !== 'executor';
    const response = preserve({
      stepId,
      attempt,
      kind: AGENT_RESPONSE_KIND_BY_ROLE[input.role] || FALLBACK_AGENT_RESPONSE_KIND,
      mediaType: structuredRole ? 'application/json' : 'text/plain',
      content: structuredRole
        ? structuredResponse(input.response, { stepId, attempt, provenance })
        : input.response,
      provenance,
      sensitivity: 'sensitive',
    });
    if (input.events || input.logs) preserve({
      stepId, attempt, kind: 'agent-log', mediaType: 'application/json',
      content: summarizeOpaque(input.logs || input.events.map((event) => JSON.stringify(event)).join('\n')), provenance, sensitivity: 'sensitive',
    });
    return response;
  }

  function findAgentResponse(operationId, sandboxPolicyHash, attemptId) {
    if (typeof operationId !== 'string' || operationId === '') return null;
    if (typeof sandboxPolicyHash !== 'string' || !/^[0-9a-f]{64}$/.test(sandboxPolicyHash)) return null;
    if (protectedRuntime) assertSecureRuntimePath(primaryRoot, artifactsRoot, { directory: true });
    for (const stepEntry of fs.readdirSync(artifactsRoot, { withFileTypes: true })) {
      if (!stepEntry.isDirectory()) continue;
      const stepDirectory = path.join(artifactsRoot, stepEntry.name);
      for (const attemptEntry of fs.readdirSync(stepDirectory, { withFileTypes: true })) {
        if (!attemptEntry.isDirectory()) continue;
        const manifest = readManifest(path.join(stepDirectory, attemptEntry.name));
        const artifactRef = manifest.artifacts.find((entry) => entry.provenance?.operationId === operationId
          && entry.provenance?.sandboxPolicyHash === sandboxPolicyHash
          && entry.provenance?.attemptId === attemptId
          && AGENT_RESPONSE_KINDS.has(entry.kind));
        if (artifactRef) {
          read(artifactRef);
          return { artifactRef };
        }
      }
    }
    return null;
  }

  return { findAgentResponse, preserve, preserveAgentResponse, read };
}

module.exports = {
  KIND_FILES,
  artifactError,
  atomicWriteFile,
  createArtifactStore,
  hash,
};
