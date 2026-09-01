'use strict';

/**
 * runtime.cjs — lock atômico do repositório e persistência durável do state.json.
 *
 * O lock é um `mkdir` (paths.lock): criar o diretório É a exclusão mútua — EEXIST significa lock
 * ocupado, e só então tenta-se recovery de órfão (com ausência de processo PROVADA + identidade igual
 * + confirmação do operador). O estado é gravado com write-temp → fsync → rename → fsync do diretório
 * (troca atômica e durável). Todo read/write valida em três camadas: schema (state.schema.json),
 * histórico da state machine e integridade referencial (assertStateReferences). Ver ADR 019 e
 * docs/workflows/automated-spec-pipeline.md § Execução e recovery.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { isDeepStrictEqual } = require('node:util');
const { validate } = require('./contracts.cjs');
const { policyHash } = require('./sandbox.cjs');
const { assertValidStateMachine } = require('./state-machine.cjs');

class RuntimeError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'RuntimeError';
    this.code = code;
    this.details = details;
  }
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function assessmentHash(assessment) {
  const { hash: ignoredHash, evaluatedAt: ignoredTimestamp, ...hashable } = assessment;
  return crypto.createHash('sha256').update(JSON.stringify(canonical(hashable))).digest('hex');
}

function runGit(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', shell: false });
  if (result.status !== 0) throw new RuntimeError('RUNTIME_GIT_ERROR', result.stderr.trim() || `git ${args[0]} failed`);
  return result.stdout.trim();
}

function identifyRepository(cwd) {
  const worktree = fs.realpathSync(runGit(cwd, ['rev-parse', '--show-toplevel']));
  const commonDirectory = fs.realpathSync(runGit(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']));
  const worktreeList = runGit(cwd, ['worktree', 'list', '--porcelain']);
  const primaryPath = worktreeList.split(/\r?\n/, 1)[0].replace(/^worktree /, '');
  if (!path.isAbsolute(primaryPath)) throw new RuntimeError('RUNTIME_GIT_ERROR', 'Git did not report an absolute primary worktree');
  const primaryRoot = fs.realpathSync(primaryPath);
  const stat = fs.statSync(commonDirectory);
  const identitySource = JSON.stringify({ primaryRoot, commonDirectory, device: stat.dev, inode: stat.ino });
  return {
    root: primaryRoot,
    realRoot: primaryRoot,
    worktree,
    commonDirectory,
    identity: crypto.createHash('sha256').update(identitySource).digest('hex'),
  };
}

function runtimePaths(repository, runId) {
  const root = path.join(repository.realRoot, '.workflow-runtime');
  return {
    root,
    locks: path.join(root, 'locks'),
    lock: path.join(root, 'locks', 'repository.lock'),
    run: path.join(root, 'runs', runId),
    state: path.join(root, 'runs', runId, 'state.json'),
  };
}

function within(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertSecureRuntimePath(primaryRoot, candidate, options = {}) {
  const requestedRoot = path.resolve(primaryRoot);
  const root = fs.realpathSync(requestedRoot);
  const requestedTarget = path.resolve(candidate);
  const target = within(requestedRoot, requestedTarget)
    ? path.join(root, path.relative(requestedRoot, requestedTarget))
    : requestedTarget;
  if (!within(root, target)) throw new RuntimeError('RUNTIME_PATH_ESCAPE', 'Runtime path escaped the primary repository root');
  const runtimeRoot = path.join(root, '.workflow-runtime');
  if (!within(runtimeRoot, target)) throw new RuntimeError('RUNTIME_PATH_INVALID', 'Protected path is not inside .workflow-runtime');

  let current = root;
  for (const segment of path.relative(root, target).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    let stat;
    try { stat = fs.lstatSync(current); }
    catch (error) {
      if (error.code === 'ENOENT') break;
      throw error;
    }
    if (stat.isSymbolicLink()) throw new RuntimeError('RUNTIME_SYMLINK_REJECTED', 'Runtime paths must not contain symbolic links', { path: current });
    if (within(runtimeRoot, current) && typeof process.getuid === 'function') {
      if (stat.uid !== process.getuid()) throw new RuntimeError('RUNTIME_OWNER_INVALID', 'Runtime path is not owned by the current user', { path: current });
      if ((stat.mode & 0o022) !== 0) throw new RuntimeError('RUNTIME_PERMISSIONS_INVALID', 'Runtime path must not be writable by group or others', { path: current });
    }
  }
  const existing = fs.existsSync(target) ? target : path.dirname(target);
  let ancestor = existing;
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  if (!within(root, fs.realpathSync(ancestor))) throw new RuntimeError('RUNTIME_PATH_ESCAPE', 'Runtime path escaped canonical repository containment');
  if (options.directory && fs.existsSync(target) && !fs.lstatSync(target).isDirectory()) {
    throw new RuntimeError('RUNTIME_PATH_INVALID', 'Runtime directory path is not a directory', { path: target });
  }
  return target;
}

function secureMkdir(primaryRoot, directory) {
  assertSecureRuntimePath(primaryRoot, directory, { directory: true });
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  assertSecureRuntimePath(primaryRoot, directory, { directory: true });
  try { fs.chmodSync(directory, 0o700); } catch (error) { if (error.code !== 'ENOSYS') throw error; }
  return directory;
}

function atomicWriteJson(filePath, value, options = {}) {
  const primaryRoot = options.primaryRoot || path.dirname(path.dirname(path.dirname(path.dirname(filePath))));
  secureMkdir(primaryRoot, path.dirname(filePath));
  assertSecureRuntimePath(primaryRoot, filePath);
  const temporaryPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`);
  let descriptor;
  // Durabilidade + atomicidade: grava num temp exclusivo (0600), força fsync, renomeia por cima (o
  // rename é atômico) e faz fsync do diretório. A checagem de path é refeita ao redor do rename para
  // fechar a janela TOCTOU entre validar e substituir.
  try {
    descriptor = fs.openSync(temporaryPath, 'wx', 0o600);
    fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    assertSecureRuntimePath(primaryRoot, filePath);
    assertSecureRuntimePath(primaryRoot, temporaryPath);
    fs.renameSync(temporaryPath, filePath);
    const directory = fs.openSync(path.dirname(filePath), 'r');
    try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    fs.rmSync(temporaryPath, { force: true });
  }
}

function readLock(lockPath) {
  try {
    const stat = fs.lstatSync(lockPath);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new RuntimeError('LOCK_INVALID', 'Lock path must be a real directory');
    const ownerPath = path.join(lockPath, 'owner.json');
    if (fs.lstatSync(ownerPath).isSymbolicLink()) throw new RuntimeError('LOCK_INVALID', 'Lock owner metadata must not be a symbolic link');
    const owner = JSON.parse(fs.readFileSync(ownerPath, 'utf8'));
    validateLockOwner(owner);
    return owner;
  } catch (error) {
    if (error instanceof RuntimeError) throw error;
    throw new RuntimeError('LOCK_INVALID', 'Existing lock metadata is missing or invalid');
  }
}

function validateLockOwner(owner) {
  const strings = ['token', 'host', 'startedAt', 'runId', 'spec', 'branch', 'worktree', 'repoRoot', 'repoIdentity'];
  if (!owner || strings.some((field) => typeof owner[field] !== 'string' || owner[field] === '')) {
    throw new RuntimeError('LOCK_INVALID', 'Lock owner metadata is incomplete');
  }
  if (!Number.isSafeInteger(owner.pid) || owner.pid < 1) throw new RuntimeError('LOCK_INVALID', 'Lock PID is invalid');
  if (!/^[0-9a-f]{64}$/.test(owner.token) || !/^[0-9a-f]{64}$/.test(owner.repoIdentity)) {
    throw new RuntimeError('LOCK_INVALID', 'Lock token or repository identity is invalid');
  }
  if (!path.isAbsolute(owner.worktree) || !path.isAbsolute(owner.repoRoot)) {
    throw new RuntimeError('LOCK_INVALID', 'Lock worktree and repository root must be absolute');
  }
}

function processIsAbsent(owner) {
  if (owner.host !== os.hostname()) return false;
  try {
    process.kill(owner.pid, 0);
    return false;
  } catch (error) {
    if (error.code === 'ESRCH') return true;
    return false;
  }
}

function validateRecovery(owner, options, repository) {
  if (!options.removeOrphanLock) throw new RuntimeError('LOCK_CONCURRENT', `Repository is locked by ${owner.runId}`, { owner });
  if (typeof options.confirmedBy !== 'string' || options.confirmedBy.trim() === '') {
    throw new RuntimeError('LOCK_RECOVERY_CONFIRMATION_REQUIRED', 'Explicit orphan-lock recovery requires confirmedBy');
  }
  if (owner.repoIdentity !== repository.identity || owner.repoRoot !== repository.realRoot) {
    throw new RuntimeError('LOCK_IDENTITY_MISMATCH', 'Orphan lock does not match the current repository identity');
  }
  if (!processIsAbsent(owner)) throw new RuntimeError('LOCK_PROCESS_NOT_PROVEN_ABSENT', 'Lock owner process absence could not be proven');
}

function removeOrphanLock(paths, owner, options, repository) {
  validateRecovery(owner, options, repository);
  const recovery = {
    processAbsenceProven: true,
    identityMatched: true,
    confirmedBy: options.confirmedBy,
    confirmedAt: new Date().toISOString(),
  };
  fs.rmSync(paths.lock, { recursive: true });
  return recovery;
}

function lockOwner(options, repository, recovery) {
  return {
    token: crypto.randomBytes(32).toString('hex'),
    pid: process.pid,
    host: os.hostname(),
    startedAt: new Date().toISOString(),
    runId: options.runId,
    spec: options.specPath,
    branch: options.branch || runGit(repository.worktree, ['branch', '--show-current']) || '(detached)',
    worktree: repository.worktree,
    repoRoot: repository.realRoot,
    repoIdentity: repository.identity,
    recovery,
  };
}

function assertOwner(handle) {
  const current = readLock(handle.paths.lock);
  if (current.token !== handle.owner.token || current.repoIdentity !== handle.repository.identity) {
    throw new RuntimeError('LOCK_OWNERSHIP_LOST', 'Lock ownership token or repository identity changed');
  }
  return current;
}

function releaseLock(handle) {
  if (handle.released) return false;
  assertOwner(handle);
  fs.rmSync(handle.paths.lock, { recursive: true });
  handle.released = true;
  handle.removeTraps?.();
  return true;
}

function installLockTraps(handle) {
  const onExit = () => {
    try { if (!handle.released) releaseLock(handle); }
    catch (error) { process.stderr.write(`LOCK_RELEASE_FAILED: ${error.message}\n`); }
  };
  const signals = new Map();
  for (const signal of ['SIGINT', 'SIGTERM']) {
    const listener = () => {
      onExit();
      process.removeListener(signal, listener);
      process.kill(process.pid, signal);
    };
    signals.set(signal, listener);
    process.once(signal, listener);
  }
  process.once('exit', onExit);
  return () => {
    process.removeListener('exit', onExit);
    for (const [signal, listener] of signals) process.removeListener(signal, listener);
  };
}

function acquireLock(options) {
  if (!options || typeof options.runId !== 'string' || typeof options.specPath !== 'string') {
    throw new RuntimeError('LOCK_INPUT_INVALID', 'runId and specPath are required');
  }
  const repository = identifyRepository(options.cwd || process.cwd());
  const paths = runtimePaths(repository, options.runId);
  secureMkdir(repository.realRoot, paths.locks);
  let recovery = null;
  try {
    // O mkdir é o mutex: é atômico no filesystem e falha com EEXIST se outro run já segura o lock.
    fs.mkdirSync(paths.lock, { mode: 0o700 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    recovery = removeOrphanLock(paths, readLock(paths.lock), options, repository);
    fs.mkdirSync(paths.lock, { mode: 0o700 });
  }
  const owner = lockOwner(options, repository, recovery);
  try {
    atomicWriteJson(path.join(paths.lock, 'owner.json'), owner, { primaryRoot: repository.realRoot });
  } catch (error) {
    fs.rmSync(paths.lock, { recursive: true, force: true });
    throw error;
  }
  const handle = { owner, paths, repository, released: false };
  handle.removeTraps = installLockTraps(handle);
  return handle;
}

function stateLock(owner) {
  return {
    repoIdentity: owner.repoIdentity,
    runId: owner.runId,
    pid: owner.pid,
    host: owner.host,
    acquiredAt: owner.startedAt,
    heartbeatAt: owner.startedAt,
    recovery: owner.recovery,
  };
}

// Integridade referencial do state.json: toda referência cruzada (attempt↔step, worktree↔step,
// commit/finding↔step, artifact↔evidence/finding/attempt, reserva↔step) precisa existir, ser única
// e pertencer ao dono certo. É o que torna o estado confiável no resume — além do schema e do
// histórico de transições. Qualquer inconsistência falha fechado antes de o pipeline agir.
function assertStateReferences(state) {
  const fail = (message, details = {}) => { throw new RuntimeError('STATE_REFERENCE_INVALID', message, details); };
  const index = (records, name) => {
    const values = new Map();
    for (const record of records) {
      if (values.has(record.id)) fail(`Duplicate ${name} id`, { id: record.id });
      values.set(record.id, record);
    }
    return values;
  };
  const steps = index(state.steps, 'step');
  const attempts = index(state.attempts, 'attempt');
  const commits = index(state.commits, 'commit');
  const findings = index(state.findings, 'finding');
  const worktrees = index(state.worktrees, 'worktree');
  const artifacts = index(state.artifacts, 'artifact');
  const approvalRequests = new Map();
  const approvalDecisions = new Map();
  const attemptNumbers = new Set();
  const references = (records, field) => records.flatMap((record) => record[field] || []);
  const count = (values, id) => values.filter((value) => value === id).length;
  const stepCommitRefs = references(state.steps, 'commitIds');
  const stepFindingRefs = references(state.steps, 'findingIds');
  const stepWorktreeRefs = state.steps.map((step) => step.worktreeId).filter(Boolean);
  const attemptArtifactRefs = references(state.attempts, 'artifactIds');
  const findingArtifactRefs = references(state.findings, 'artifactIds');
  const evidenceArtifactRefs = state.steps.flatMap((step) => step.evidence.map((entry) => entry.artifactId));
  const approvalContextRefs = state.steps.flatMap((step) => step.risk?.requests.map((request) => request.contextArtifactRef) || []);

  for (const step of state.steps) {
    const evidenceKeys = new Set();
    const sandboxOperationIds = new Set();
    for (const application of step.sandbox.applications) {
      if (sandboxOperationIds.has(application.operationId)) fail('Step has duplicate sandbox operation IDs', { stepId: step.id, operationId: application.operationId });
      sandboxOperationIds.add(application.operationId);
      const { policyHash: embeddedHash, ...hashablePolicy } = application.policy;
      if (application.policyHash !== embeddedHash || application.policyHash !== policyHash(hashablePolicy)
        || application.role !== application.policy.role || application.resourceId !== application.policy.resourceId) {
        fail('Sandbox application policy hash or identity is inconsistent', { stepId: step.id, operationId: application.operationId });
      }
    }
    for (const attemptId of step.attemptIds) {
      const attempt = attempts.get(attemptId);
      if (!attempt || attempt.stepId !== step.id) fail('Step references an absent or foreign attempt', { stepId: step.id, attemptId });
    }
    if (step.worktreeId !== null) {
      const worktree = worktrees.get(step.worktreeId);
      if (!worktree || worktree.stepId !== step.id) fail('Step references an absent or foreign worktree', { stepId: step.id, worktreeId: step.worktreeId });
    }
    for (const commitId of step.commitIds) {
      if (commits.get(commitId)?.stepId !== step.id) fail('Step references an absent or foreign commit', { stepId: step.id, commitId });
    }
    for (const findingId of step.findingIds) {
      if (findings.get(findingId)?.stepId !== step.id) fail('Step references an absent or foreign finding', { stepId: step.id, findingId });
    }
    for (const evidence of step.evidence) {
      const evidenceKey = `${evidence.acceptanceCriterionId}:${evidence.artifactId}`;
      if (evidenceKeys.has(evidenceKey)) fail('Step has duplicate evidence references', { stepId: step.id, artifactId: evidence.artifactId });
      evidenceKeys.add(evidenceKey);
      const artifact = artifacts.get(evidence.artifactId);
      if (!artifact || artifact.hash !== evidence.hash || artifact.provenance.stepId !== step.id) {
        fail('Evidence references an absent, foreign, or hash-mismatched artifact', { stepId: step.id, artifactId: evidence.artifactId });
      }
    }
    if (step.risk) {
      if (assessmentHash(step.risk.assessment) !== step.risk.assessment.hash) {
        fail('Risk assessment hash does not match its content', { stepId: step.id });
      }
      if (step.risk.assessmentHistory.some((assessment) => assessmentHash(assessment) !== assessment.hash)) {
        fail('Historical risk assessment hash does not match its content', { stepId: step.id });
      }
      const assessmentSequence = [...step.risk.assessmentHistory, step.risk.assessment];
      const levelRank = { autonomous: 0, approval_required: 1, restricted: 2 };
      const assessmentIds = new Set();
      for (let index = 0; index < assessmentSequence.length; index += 1) {
        const assessment = assessmentSequence[index];
        const previous = assessmentSequence[index - 1];
        if (assessmentIds.has(assessment.hash) || Number.isNaN(Date.parse(assessment.evaluatedAt))
          || assessment.policy.hash !== step.risk.assessment.policy.hash
          || (previous && (Date.parse(assessment.evaluatedAt) < Date.parse(previous.evaluatedAt)
            || levelRank[assessment.effectiveLevel] < levelRank[previous.effectiveLevel]
            || previous.signals.some((signal) => !assessment.signals.some((candidate) => candidate.fingerprint === signal.fingerprint))))) {
          fail('Risk assessment history is reordered, non-monotonic, or incomplete', { stepId: step.id });
        }
        assessmentIds.add(assessment.hash);
      }
      if (state.spec.riskPolicyHash && step.risk.assessment.policy.hash !== state.spec.riskPolicyHash) {
        fail('Risk assessment references another policy', { stepId: step.id });
      }
      const assessmentHashes = new Set([step.risk.assessment, ...step.risk.assessmentHistory].map((assessment) => assessment.hash));
      const transitionIds = new Set(state.transitions.map((transition) => transition.id));
      for (const request of step.risk.requests) {
        if (approvalRequests.has(request.id)) fail('Duplicate approval request id', { requestId: request.id });
        approvalRequests.set(request.id, { request, stepId: step.id });
        const artifact = artifacts.get(request.contextArtifactRef);
        if (!artifact || artifact.hash === undefined || artifact.provenance.stepId !== step.id) {
          fail('Approval request references an absent or foreign context artifact', { stepId: step.id, requestId: request.id });
        }
        const binding = request.binding;
        if (binding.repoIdentity !== state.repo.identity || binding.runId !== state.runId
          || binding.baseSha !== state.repo.baseSha || binding.specHash !== state.spec.hash
          || binding.stepsHash !== state.spec.stepsHash || binding.stepId !== step.id
          || binding.policyHash !== step.risk.assessment.policy.hash
          || !assessmentHashes.has(binding.assessmentHash)
          || (request.status === 'pending' && binding.assessmentHash !== step.risk.assessment.hash)) {
          fail('Approval request binding does not match its owning state', { stepId: step.id, requestId: request.id });
        }
        if (request.checkpoint === 'post-review') {
          const attempt = attempts.get(binding.attemptId);
          const worktree = worktrees.get(binding.worktreeId);
          const diff = artifacts.get(binding.diffArtifactId);
          const review = artifacts.get(binding.reviewArtifactId);
          if (!attempt || attempt.stepId !== step.id || !worktree || worktree.stepId !== step.id
            || worktree.path !== binding.worktreePath || worktree.headSha !== binding.worktreeHeadSha
            || typeof binding.factualIdentityHash !== 'string'
            || binding.parentSha !== step.parentSha
            || !diff || diff.hash !== binding.diffHash || diff.provenance.stepId !== step.id
            || !review || review.hash !== binding.reviewHash || review.provenance.stepId !== step.id
            || review.provenance.sourceHash !== binding.snapshotSourceHash) {
            fail('Post-review approval binding references absent or foreign facts', { stepId: step.id, requestId: request.id });
          }
        }
      }
      for (const decision of step.risk.decisions) {
        if (approvalDecisions.has(decision.id)) fail('Duplicate approval decision id', { decisionId: decision.id });
        approvalDecisions.set(decision.id, { decision, stepId: step.id });
        const owner = approvalRequests.get(decision.requestId);
        if (!owner || owner.stepId !== step.id || !isDeepStrictEqual(owner.request.binding, decision.binding)) {
          fail('Approval decision references an absent, foreign, or rebound request', { stepId: step.id, decisionId: decision.id });
        }
        const consumed = decision.consumedAt !== null;
        if (consumed !== (decision.consumedByTransitionId !== null)
          || (consumed && !transitionIds.has(decision.consumedByTransitionId))) {
          fail('Approval decision consumption is incomplete or references an absent transition', { stepId: step.id, decisionId: decision.id });
        }
      }
      for (const request of step.risk.requests) {
        const decisions = step.risk.decisions.filter((decision) => decision.requestId === request.id);
        if ((request.status === 'pending' && decisions.length !== 0) || (request.status !== 'pending' && decisions.length !== 1)) {
          fail('Approval request status disagrees with its decision history', { stepId: step.id, requestId: request.id });
        }
        if (decisions.length === 1) {
          const decision = decisions[0];
          const expected = decision.consumedAt === null ? 'stale' : decision.outcome === 'approved' ? 'satisfied' : 'rejected';
          if (request.status !== expected) fail('Approval request status disagrees with its recorded decision', { stepId: step.id, requestId: request.id });
        }
      }
    }
  }
  for (const attempt of state.attempts) {
    const numberKey = `${attempt.stepId}:${attempt.number}`;
    if (attemptNumbers.has(numberKey)) fail('Step has duplicate attempt numbers', { stepId: attempt.stepId, number: attempt.number });
    attemptNumbers.add(numberKey);
    const step = steps.get(attempt.stepId);
    if (!step || !step.attemptIds.includes(attempt.id)) fail('Attempt is not referenced by its step', { attemptId: attempt.id });
    if (attempt.status === 'succeeded' && attempt.sandboxPolicyHash === null) {
      fail('Succeeded attempt has no sandbox policy evidence', { attemptId: attempt.id });
    }
    if (attempt.sandboxPolicyHash !== null
      && !step.sandbox.applications.some((application) => application.role === attempt.role && application.policyHash === attempt.sandboxPolicyHash)) {
      fail('Attempt references an absent sandbox policy', { attemptId: attempt.id, policyHash: attempt.sandboxPolicyHash });
    }
    if ((attempt.status === 'running' || attempt.status === 'reserved' || attempt.status === 'reconciliation-required') !== (attempt.finishedAt === null)) {
      fail('Attempt status and finishedAt disagree', { attemptId: attempt.id });
    }
    for (const artifactId of attempt.artifactIds) {
      const artifact = artifacts.get(artifactId);
      if (!artifact || artifact.provenance.stepId !== attempt.stepId || artifact.provenance.attemptId !== attempt.id) {
        fail('Attempt references an absent or foreign artifact', { attemptId: attempt.id, artifactId });
      }
    }
  }
  for (const commit of state.commits) {
    if (!steps.has(commit.stepId) || count(stepCommitRefs, commit.id) !== 1) fail('Commit is not referenced exactly once by its owning step', { commitId: commit.id });
  }
  for (const finding of state.findings) {
    if (finding.stepId !== null && !steps.has(finding.stepId)) fail('Finding references an absent step', { findingId: finding.id });
    if (!['critical', 'high', 'medium', 'low'].includes(finding.severity)) fail('Finding severity is not canonical', { findingId: finding.id, severity: finding.severity });
    const ownerReferences = count(stepFindingRefs, finding.id);
    if ((finding.stepId === null && ownerReferences !== 0) || (finding.stepId !== null && ownerReferences !== 1)) {
      fail('Finding ownership reference cardinality is invalid', { findingId: finding.id, references: ownerReferences });
    }
    for (const artifactId of finding.artifactIds) {
      const artifact = artifacts.get(artifactId);
      if (!artifact || artifact.provenance.stepId !== finding.stepId) fail('Finding references an absent or foreign artifact', { findingId: finding.id, artifactId });
    }
  }
  for (const worktree of state.worktrees) {
    const step = steps.get(worktree.stepId);
    const attemptOwned = step?.attemptIds.some((attemptId) => {
      const attempt = attempts.get(attemptId);
      return attempt && worktree.id === `worktree-${step.id}-${attempt.number}`;
    });
    if (!step || count(stepWorktreeRefs, worktree.id) > 1
      || (count(stepWorktreeRefs, worktree.id) !== 1 && !attemptOwned)) {
      fail('Worktree is not referenced by exactly one owning step or attempt', { worktreeId: worktree.id });
    }
  }
  for (const artifact of state.artifacts) {
    if (artifact.provenance.runId !== state.runId) fail('Artifact provenance references another run', { artifactId: artifact.id });
    if (artifact.provenance.stepId !== null && !steps.has(artifact.provenance.stepId)) fail('Artifact provenance references an absent step', { artifactId: artifact.id });
    if (artifact.provenance.attemptId !== null) {
      const attempt = attempts.get(artifact.provenance.attemptId);
      if (!attempt || attempt.stepId !== artifact.provenance.stepId) fail('Artifact provenance references an absent or foreign attempt', { artifactId: artifact.id });
      if (count(attemptArtifactRefs, artifact.id) !== 1) fail('Artifact is not referenced exactly once by its owning attempt', { artifactId: artifact.id });
    } else if (count(attemptArtifactRefs, artifact.id) !== 0) {
      fail('Global or step artifact conflicts with an attempt reference', { artifactId: artifact.id });
    } else if (artifact.provenance.stepId !== null
      && count(evidenceArtifactRefs, artifact.id) + count(findingArtifactRefs, artifact.id) + count(approvalContextRefs, artifact.id) === 0) {
      fail('Step artifact has no owning evidence or finding reference', { artifactId: artifact.id });
    }
  }
  for (const reservation of state.usage.reservations) if (!steps.has(reservation.stepId)) fail('Reservation references an absent step', { reservationId: reservation.id });
  if (state.usage.perStep.length !== steps.size || state.usage.perStep.some((entry) => !steps.has(entry.stepId))
    || new Set(state.usage.perStep.map((entry) => entry.stepId)).size !== state.usage.perStep.length) {
    fail('Budget step counters do not match state steps');
  }
  return state;
}

function validateStateSchema(state) {
  return validate('state', state);
}

function createInitialRunState(handle, input) {
  assertOwner(handle);
  const at = input.createdAt || new Date().toISOString();
  const riskAssessments = new Map((input.riskAssessments || []).map((entry) => [entry.stepId, entry.assessment]));
  if (riskAssessments.size !== (input.riskAssessments || []).length
    || [...riskAssessments.keys()].some((stepId) => !input.steps.some((step) => step.id === stepId))) {
    throw new RuntimeError('STATE_RISK_ASSESSMENTS_INVALID', 'Risk assessments must uniquely reference run steps');
  }
  const spec = { ...input.spec };
  if (riskAssessments.size > 0) {
    if (riskAssessments.size !== input.steps.length) throw new RuntimeError('STATE_RISK_ASSESSMENTS_INVALID', 'Every run step requires a risk assessment');
    const policyHashes = new Set([...riskAssessments.values()].map((assessment) => assessment.policy?.hash));
    if (policyHashes.size !== 1) throw new RuntimeError('STATE_RISK_ASSESSMENTS_INVALID', 'Risk assessments must share one policy hash');
    spec.riskPolicyHash = [...policyHashes][0];
  }
  const state = {
    schemaVersion: '3.0.0', runId: handle.owner.runId, revision: 0,
    repo: { root: handle.repository.root, realRoot: handle.repository.realRoot, identity: handle.repository.identity, baseSha: input.baseSha, parentSha: input.parentSha },
    spec, state: 'CREATED', transitions: [], lock: stateLock(handle.owner),
    usage: input.usage,
    steps: input.steps.map((step) => {
      const assessment = riskAssessments.get(step.id);
      return {
        ...step,
        sandbox: step.sandbox || { policyVersion: '1', applications: [] },
        ...(assessment ? { risk: { assessment: { ...assessment, evaluatedAt: at }, assessmentHistory: [], requests: [], decisions: [] } } : {}),
      };
    }),
    attempts: [], commits: [], findings: [],
    worktrees: [], artifacts: [], createdAt: at, updatedAt: at,
  };
  const schema = validateStateSchema(state);
  if (!schema.ok) throw new RuntimeError('STATE_SCHEMA_INVALID', 'Initial run state does not match state.schema.json', { errors: schema.errors });
  return assertStateReferences(assertValidStateMachine(state));
}

function writeRunState(handle, state) {
  assertOwner(handle);
  if (state.runId !== handle.owner.runId) throw new RuntimeError('STATE_RUN_MISMATCH', 'State runId does not own this lock');
  if (state.schemaVersion !== '3.0.0') throw new RuntimeError('STATE_RISK_VERSION_REQUIRED', 'Run state predates versioned risk and HITL evidence');
  const schema = validateStateSchema(state);
  if (!schema.ok) throw new RuntimeError('STATE_SCHEMA_INVALID', 'Run state does not match state.schema.json', { errors: schema.errors });
  assertValidStateMachine(state);
  assertStateReferences(state);
  atomicWriteJson(handle.paths.state, state, { primaryRoot: handle.repository.realRoot });
  return handle.paths.state;
}

function readRunState(handle) {
  assertOwner(handle);
  assertSecureRuntimePath(handle.repository.realRoot, handle.paths.state);
  let state;
  try { state = JSON.parse(fs.readFileSync(handle.paths.state, 'utf8')); }
  catch (error) { throw new RuntimeError('STATE_READ_INVALID', `Run state cannot be read: ${error.message}`); }
  if (state.schemaVersion !== '3.0.0') throw new RuntimeError('STATE_RISK_VERSION_REQUIRED', 'Run state predates versioned risk and HITL evidence');
  const schema = validateStateSchema(state);
  if (!schema.ok) throw new RuntimeError('STATE_SCHEMA_INVALID', 'Run state does not match state.schema.json', { errors: schema.errors });
  if (state.runId !== handle.owner.runId || state.repo.identity !== handle.repository.identity
    || state.repo.realRoot !== handle.repository.realRoot || state.lock?.runId !== handle.owner.runId
    || state.lock?.repoIdentity !== handle.repository.identity) {
    throw new RuntimeError('STATE_OWNERSHIP_INVALID', 'Run state does not belong to the current repository and lock');
  }
  return assertStateReferences(assertValidStateMachine(state));
}

module.exports = {
  RuntimeError,
  acquireLock,
  assertSecureRuntimePath,
  assertStateReferences,
  atomicWriteJson,
  createInitialRunState,
  identifyRepository,
  readRunState,
  releaseLock,
  runtimePaths,
  secureMkdir,
  stateLock,
  writeRunState,
};
