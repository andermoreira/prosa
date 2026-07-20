'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { sanitize } = require('./sanitize.cjs');
const { compileSchemas } = require('./contracts.cjs');
const { appendFindingsBacklog, decisionForFindings } = require('./findings.cjs');

const SNAPSHOT_PARTS = Object.freeze([
  'spec', 'step', 'boundaries', 'invariants', 'acceptanceCriteria', 'adrs', 'agents', 'notes',
  'diff', 'gates', 'revalidation', 'artifacts', 'evidence', 'findings',
]);
const GLOBAL_SNAPSHOT_PARTS = Object.freeze([
  'spec', 'steps', 'adrs', 'boundaries', 'invariants', 'acceptanceCriteria', 'agents', 'notes',
  'diff', 'gates', 'revalidation', 'artifacts', 'findings', 'evidence',
]);
const roleValidators = compileSchemas();
const validateReviewOutput = roleValidators.review;
const validateDiagnosisOutput = roleValidators.diagnosis;

function reviewError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function hash(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function within(parent, child) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function createClosedSnapshot(options) {
  if (!path.isAbsolute(options.snapshotRoot) || !path.isAbsolute(options.worktree)) {
    throw reviewError('SNAPSHOT_PATH_INVALID', 'Snapshot root and worktree must be absolute');
  }
  const missing = SNAPSHOT_PARTS.filter((name) => options.sources?.[name] === undefined);
  if (missing.length > 0) throw reviewError('SNAPSHOT_INCOMPLETE', 'Snapshot is missing required parts', { missing });

  const sanitizedParts = Object.fromEntries(SNAPSHOT_PARTS.map((name) => {
    const sanitized = sanitize(options.sources[name], { maxBytes: options.maxBytes });
    if (sanitized.truncated) {
      throw reviewError('SNAPSHOT_PART_TRUNCATED', `Snapshot part exceeds its persistence limit: ${name}`, { part: name });
    }
    return [name, sanitized];
  }));

  fs.mkdirSync(options.snapshotRoot, { recursive: true, mode: 0o700 });
  const realWorktree = fs.realpathSync(options.worktree);
  const realSnapshotRoot = fs.realpathSync(options.snapshotRoot);
  if (within(realWorktree, realSnapshotRoot)) {
    throw reviewError('SNAPSHOT_INSIDE_WORKTREE', 'Review snapshot must be outside the worktree');
  }
  const directory = fs.mkdtempSync(path.join(realSnapshotRoot, 'review-'));
  const parts = {};
  for (const name of SNAPSHOT_PARTS) {
    const sanitized = sanitizedParts[name];
    const fileName = `${name}.snapshot`;
    fs.writeFileSync(path.join(directory, fileName), sanitized.content, { mode: 0o600, flag: 'wx' });
    parts[name] = { file: fileName, hash: hash(sanitized.content), redacted: sanitized.redacted, truncated: sanitized.truncated };
  }
  const sourceHash = hash(JSON.stringify(parts));
  const manifestContent = `${JSON.stringify({ schemaVersion: '1.0.0', closed: true, sourceHash, parts }, null, 2)}\n`;
  const manifestPath = path.join(directory, 'manifest.json');
  fs.writeFileSync(manifestPath, manifestContent, { mode: 0o400, flag: 'wx' });
  for (const part of Object.values(parts)) fs.chmodSync(path.join(directory, part.file), 0o400);
  fs.chmodSync(directory, 0o500);
  return { path: directory, manifestPath, hash: hash(manifestContent), sourceHash, parts, closed: true };
}

function captureGitState(worktree) {
  const run = (args) => execFileSync('git', ['-C', worktree, ...args], { maxBuffer: 16 * 1024 * 1024 });
  const realWorktree = fs.realpathSync(worktree);
  const untrackedPaths = run(['ls-files', '--others', '--exclude-standard', '-z']).toString('utf8').split('\0').filter(Boolean);
  const untracked = untrackedPaths.map((relativePath) => {
    const filePath = path.resolve(realWorktree, relativePath);
    if (!within(realWorktree, filePath)) throw reviewError('READ_ONLY_STATE_CAPTURE_FAILED', 'Untracked path escaped the target worktree');
    const stat = fs.lstatSync(filePath);
    const content = stat.isSymbolicLink() ? Buffer.from(fs.readlinkSync(filePath)) : fs.readFileSync(filePath);
    return { path: relativePath, hash: hash(content) };
  });
  const state = {
    head: run(['rev-parse', 'HEAD']).toString('utf8').trim(),
    statusHash: hash(run(['status', '--porcelain=v2', '--untracked-files=all', '-z'])),
    diffHash: hash(run(['diff', '--binary', 'HEAD', '--'])),
    untracked,
  };
  return { ...state, hash: hash(JSON.stringify(state)) };
}

function captureIntegratedDiff(worktree, baseSha) {
  if (!path.isAbsolute(worktree) || !/^[0-9a-f]{40}$/.test(baseSha || '')) {
    throw reviewError('GLOBAL_DIFF_INPUT_INVALID', 'An absolute worktree and base SHA are required');
  }
  const run = (args) => execFileSync('git', ['-C', worktree, ...args], { maxBuffer: 32 * 1024 * 1024 }).toString('utf8');
  const headSha = run(['rev-parse', 'HEAD']).trim();
  const content = run(['diff', '--binary', `${baseSha}..${headSha}`, '--']);
  return { baseSha, headSha, content, hash: hash(content), fresh: true };
}

function createGlobalReviewSnapshot(options) {
  const missing = GLOBAL_SNAPSHOT_PARTS.filter((name) => options.sources?.[name] === undefined);
  if (missing.length > 0) throw reviewError('GLOBAL_SNAPSHOT_INCOMPLETE', 'Global snapshot is missing required parts', { missing });
  return createClosedSnapshot({
    ...options,
    sources: {
      spec: options.sources.spec,
      step: options.sources.steps,
      boundaries: options.sources.boundaries,
      invariants: options.sources.invariants,
      acceptanceCriteria: options.sources.acceptanceCriteria,
      adrs: options.sources.adrs,
      agents: options.sources.agents,
      notes: options.sources.notes,
      diff: options.sources.diff,
      gates: options.sources.gates,
      revalidation: options.sources.revalidation,
      artifacts: options.sources.artifacts,
      evidence: options.sources.evidence,
      findings: options.sources.findings,
    },
  });
}

function backlogFinding(finding) {
  return {
    severity: finding.severity,
    summary: finding.title,
    details: finding.description,
    location: finding.file && finding.line ? { path: finding.file, line: finding.line } : null,
    acceptanceCriterionId: null,
    ruleId: finding.boundaryViolation ? 'boundary-violation' : (finding.invariantViolation ? 'invariant-violation' : null),
    gateId: null,
    evidence: finding.evidence,
  };
}

function parseRoleOutput(role, source) {
  let value;
  try { value = JSON.parse(source); }
  catch (error) { throw reviewError('ROLE_JSON_INVALID', 'Role response must be one complete JSON document', { message: error.message }); }
  const validator = role === 'reviewer' ? validateReviewOutput : validateDiagnosisOutput;
  if (!validator(value)) throw reviewError('ROLE_SCHEMA_INVALID', `${role} response failed its schema`, { errors: validator.errors });
  if (role === 'reviewer') {
    const expected = decisionForFindings(value.findings.map(backlogFinding));
    if (value.decision !== expected) {
      throw reviewError('REVIEW_DECISION_INVALID', 'Review decision does not match structured findings', { expected, actual: value.decision });
    }
  }
  return value;
}

function rolePrompt(role) {
  if (role === 'diagnostician') {
    return 'Diagnose the recorded failure from snapshot evidence. Return only JSON matching the diagnosis schema. Do not approve, edit, or propose an automatic correction step.';
  }
  return 'Review the closed snapshot. Return only JSON matching the review schema. Decisions and severities must use the closed enums; prose outside JSON has no authority.';
}

function createReviewRunner(dependencies) {
  if (typeof dependencies.orchestrator?.execute !== 'function' || typeof dependencies.artifacts?.read !== 'function') {
    throw reviewError('REVIEW_DEPENDENCY_INVALID', 'Orchestrator execution and artifact reading are required');
  }

  async function run(input) {
    const role = input.role;
    if (!['reviewer', 'diagnostician'].includes(role)) throw reviewError('REVIEW_ROLE_INVALID', 'Role must be reviewer or diagnostician');
    if (input.resource?.type !== 'agent' || input.resource.role !== role || !['opencode', 'agent'].includes(input.resource.executable) || input.resource.readOnly !== true) {
      throw reviewError('REVIEW_RESOURCE_INVALID', `${role} requires its read-only agent resource`);
    }
    if (!input.snapshot?.closed || !path.isAbsolute(input.snapshot.path)) throw reviewError('SNAPSHOT_INVALID', 'A closed absolute snapshot is required');
    const retries = input.invalidResponseRetries ?? 1;
    if (!Number.isInteger(retries) || retries < 0 || retries > 3) throw reviewError('REVIEW_RETRY_INVALID', 'Invalid response retries must be between zero and three');
    let lastError;
    for (let cycle = 0; cycle <= retries; cycle += 1) {
      const operationId = `${input.operationId}-${role}-${cycle + 1}`;
      const result = await dependencies.orchestrator.execute({
        ...input.agentInput,
        operationId,
        stepId: input.stepId,
        role,
        attempt: cycle + 1,
        budgetAction: role === 'reviewer' ? 'review' : 'diagnosis',
        resource: input.resource,
        worktree: input.snapshot.path,
        targetWorktree: input.targetWorktree,
        goal: rolePrompt(role),
        inScope: ['closed snapshot analysis'],
        outOfScope: ['editing', 'approval by prose', 'automatic correction'],
        predictedFiles: [],
        allowedAreas: ['.'],
        acceptanceCriteria: input.acceptanceCriteria || [],
        context: { snapshotHash: input.snapshot.hash, sourceHash: input.snapshot.sourceHash },
      });
      if (!result.ok) return result;
      try {
        const output = parseRoleOutput(role, dependencies.artifacts.read(result.artifactRef));
        if (role === 'diagnostician') return { ok: true, role, diagnosis: output, artifactRef: result.artifactRef, cycles: cycle + 1 };
        const backlog = appendFindingsBacklog({
          artifacts: dependencies.artifacts, findings: output.findings.map(backlogFinding), previous: input.previousFindings,
          reviewId: operationId, stepId: input.stepId, attempt: input.attempt || 1,
        });
        return { ok: true, role, review: output, artifactRef: result.artifactRef, backlog, cycles: cycle + 1, correctionCreationEnabled: false };
      } catch (error) {
        lastError = error;
      }
    }
    return { ok: false, blocked: true, code: lastError.code, error: lastError, cycles: retries + 1, correctionCreationEnabled: false };
  }

  return { diagnose: (input) => run({ ...input, role: 'diagnostician' }), review: (input) => run({ ...input, role: 'reviewer' }) };
}

module.exports = {
  GLOBAL_SNAPSHOT_PARTS,
  SNAPSHOT_PARTS,
  backlogFinding,
  captureGitState,
  captureIntegratedDiff,
  createClosedSnapshot,
  createGlobalReviewSnapshot,
  createReviewRunner,
  parseRoleOutput,
};
