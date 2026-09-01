'use strict';

/**
 * git.cjs — todas as operações Git do pipeline via argv com `shell: false` e trust boundary rígido.
 *
 * Responsável por: identidade estável do repositório (base do lock), validação do base SHA aprovado,
 * criação de worktree de attempt confinada em .workflow-runtime e detached no base SHA, coleta de
 * diff (name-status), staging que casa exatamente com os paths aceitos (commit determinístico) e
 * reconciliação de commit para crash-recovery. Nunca usa shell; toda entrada é tratada como dado.
 * Ver docs/workflows/automated-spec-pipeline.md § Trust Boundary e § Execução e recovery.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const LEGACY_COMMIT_TYPES = Object.freeze({
  feature: 'feat',
  feat: 'feat',
  fix: 'fix',
  bugfix: 'fix',
  'bug-fix': 'fix',
  refactor: 'refactor',
  documentation: 'docs',
  docs: 'docs',
  test: 'test',
  chore: 'chore',
});
const CHANGE_COMMIT_TYPES = Object.freeze({
  bugfix: 'fix',
  test: 'test',
  vetted_dependency: 'chore',
  documentation: 'docs',
  feature: 'feat',
  api_contract: 'feat',
  database_migration: 'feat',
  architecture: 'refactor',
  security: 'fix',
  irreversible: 'chore',
  infrastructure: 'chore',
  permissions: 'chore',
});
const CONTROL_CHARACTERS = /[\x00-\x1f\x7f]/;

class GitError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'GitError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new GitError(code, message, details);
}

function git(cwd, args, options = {}) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: options.encoding || 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    shell: false,
  });
  if (result.error) fail('GIT_PROCESS_FAILED', result.error.message);
  if (result.status !== 0) {
    const stderr = Buffer.isBuffer(result.stderr) ? result.stderr.toString('utf8') : result.stderr;
    fail(options.code || 'GIT_COMMAND_FAILED', stderr.trim() || `git ${args[0]} failed`, { command: args[0] });
  }
  return result.stdout;
}

function parseWorktrees(cwd) {
  const records = [];
  let current;
  for (const line of git(cwd, ['worktree', 'list', '--porcelain', '-z']).toString('utf8').split('\0')) {
    if (line.startsWith('worktree ')) {
      current = { path: line.slice('worktree '.length) };
      records.push(current);
    } else if (current && line.startsWith('HEAD ')) current.head = line.slice('HEAD '.length);
    else if (current && line.startsWith('branch ')) current.branch = line.slice('branch '.length).replace(/^refs\/heads\//, '');
    else if (current && line === 'detached') current.detached = true;
  }
  return records;
}

function identifyRepository(cwd = process.cwd()) {
  const worktree = fs.realpathSync(git(cwd, ['rev-parse', '--show-toplevel']).trim());
  const commonDirectory = fs.realpathSync(git(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']).trim());
  const listed = parseWorktrees(worktree);
  if (listed.length === 0 || !path.isAbsolute(listed[0].path)) fail('GIT_IDENTITY_INVALID', 'Git did not report an absolute main worktree');
  const mainWorktree = fs.realpathSync(listed[0].path);
  const stat = fs.statSync(commonDirectory);
  // device+inode do git-common-dir tornam a identidade estável mesmo quando o mesmo repositório é
  // alcançado por paths diferentes (symlink, bind mount). É esta identidade que ancora o lock.
  const source = JSON.stringify({ mainWorktree, commonDirectory, device: stat.dev, inode: stat.ino });
  return {
    identity: crypto.createHash('sha256').update(source).digest('hex'),
    worktree,
    commonDirectory,
    mainWorktree,
  };
}

function resolveCommit(cwd, revision) {
  if (typeof revision !== 'string' || !/^[0-9a-f]{40,64}$/.test(revision)) {
    fail('GIT_BASE_SHA_INVALID', 'Base SHA must be a full hexadecimal object ID');
  }
  return git(cwd, ['rev-parse', '--verify', `${revision}^{commit}`], { code: 'GIT_BASE_SHA_NOT_FOUND' }).trim();
}

function assertClean(cwd) {
  const status = git(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  if (status.length !== 0) fail('GIT_PREFLIGHT_DIRTY', 'Main worktree must be clean before an attempt');
}

function validateBase(options) {
  if (!options || options.approved !== true) fail('GIT_BASE_NOT_APPROVED', 'Base SHA requires explicit approval');
  if (typeof options.baseBranch !== 'string' || options.baseBranch === '' || options.baseBranch.includes('\0')) {
    fail('GIT_BASE_BRANCH_INVALID', 'Base branch must be a non-empty branch name');
  }
  const repository = identifyRepository(options.cwd);
  git(repository.mainWorktree, ['check-ref-format', '--branch', options.baseBranch], { code: 'GIT_BASE_BRANCH_INVALID' });
  assertClean(repository.mainWorktree);
  const baseSha = resolveCommit(repository.mainWorktree, options.baseSha);
  const branchSha = git(repository.mainWorktree, ['rev-parse', '--verify', `refs/heads/${options.baseBranch}^{commit}`], {
    code: 'GIT_BASE_BRANCH_NOT_FOUND',
  }).trim();
  const currentBranch = git(repository.mainWorktree, ['branch', '--show-current']).trim();
  const headSha = git(repository.mainWorktree, ['rev-parse', 'HEAD']).trim();
  // Tripla checagem: branch corrente, SHA da branch e HEAD do worktree principal têm de apontar para
  // o MESMO commit aprovado. Assim o base é inequívoco e o run/resume não sofre drift silencioso.
  if (currentBranch !== options.baseBranch || branchSha !== baseSha || headSha !== baseSha) {
    fail('GIT_BASE_MISMATCH', 'Approved branch, SHA, and main worktree HEAD must identify the same commit', {
      baseSha, branchSha, currentBranch, headSha,
    });
  }
  return { repository, baseSha, baseBranch: options.baseBranch };
}

function canonicalPotentialPath(candidate) {
  const missing = [];
  let existing = path.resolve(candidate);
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) fail('GIT_RUNTIME_INVALID', 'Runtime root has no existing ancestor');
    missing.unshift(path.basename(existing));
    existing = parent;
  }
  return path.join(fs.realpathSync(existing), ...missing);
}

function confinedRuntime(repository, runtimeRoot) {
  if (typeof runtimeRoot !== 'string' || !path.isAbsolute(runtimeRoot)) fail('GIT_RUNTIME_INVALID', 'Runtime root must be absolute');
  const expected = canonicalPotentialPath(path.join(repository.mainWorktree, '.workflow-runtime'));
  const canonicalRuntime = canonicalPotentialPath(runtimeRoot);
  const relative = path.relative(expected, canonicalRuntime);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail('GIT_RUNTIME_OUTSIDE_ROOT', 'Attempt worktrees must be under the repository runtime');
  }
  fs.mkdirSync(canonicalRuntime, { recursive: true, mode: 0o700 });
  const realRuntime = fs.realpathSync(canonicalRuntime);
  const realExpectedParent = fs.realpathSync(repository.mainWorktree);
  const realRelative = path.relative(realExpectedParent, realRuntime);
  if (realRelative === '..' || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) {
    fail('GIT_RUNTIME_OUTSIDE_ROOT', 'Runtime symlinks must not escape the main worktree');
  }
  return realRuntime;
}

function createAttemptWorktree(options) {
  if (!options || typeof options.attemptId !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(options.attemptId)) {
    fail('GIT_ATTEMPT_ID_INVALID', 'Attempt ID contains unsupported characters');
  }
  const repository = identifyRepository(options.cwd);
  const baseSha = resolveCommit(repository.mainWorktree, options.baseSha);
  const runtimeRoot = confinedRuntime(repository, options.runtimeRoot);
  const worktreesRoot = path.join(runtimeRoot, 'worktrees');
  fs.mkdirSync(worktreesRoot, { recursive: true, mode: 0o700 });
  if (fs.lstatSync(worktreesRoot).isSymbolicLink()) fail('GIT_RUNTIME_INVALID', 'Worktrees directory must not be a symlink');
  const worktreePath = path.join(worktreesRoot, options.attemptId);
  if (fs.existsSync(worktreePath)) fail('GIT_WORKTREE_EXISTS', 'Attempt worktree path already exists');
  git(repository.mainWorktree, ['worktree', 'add', '--detach', worktreePath, baseSha], { code: 'GIT_WORKTREE_CREATE_FAILED' });
  return validateAttemptWorktree({ cwd: repository.mainWorktree, worktreePath, baseSha });
}

function validateAttemptWorktree(options) {
  const repository = identifyRepository(options.cwd);
  const baseSha = resolveCommit(repository.mainWorktree, options.baseSha);
  if (typeof options.worktreePath !== 'string' || !path.isAbsolute(options.worktreePath) || !fs.existsSync(options.worktreePath)) {
    fail('GIT_WORKTREE_INVALID', 'Attempt worktree must be an existing absolute path');
  }
  const realPath = fs.realpathSync(options.worktreePath);
  const listed = parseWorktrees(repository.mainWorktree).find((entry) => {
    try { return fs.realpathSync(entry.path) === realPath; } catch { return false; }
  });
  if (!listed) fail('GIT_WORKTREE_NOT_LISTED', 'Attempt path is not a listed Git worktree');
  // allowedHead admits the recorded committed head so a crash between the removal-pending persist
  // and `git worktree remove` stays recoverable on resume; anything else still fails closed.
  const allowedHeads = options.allowedHead === undefined ? [baseSha] : [baseSha, options.allowedHead];
  if (!listed.detached || !allowedHeads.includes(listed.head)) {
    fail('GIT_WORKTREE_BASE_MISMATCH', 'Attempt worktree must remain detached at its approved base SHA', { expected: baseSha, actual: listed.head });
  }
  return { repository, path: realPath, baseSha, headSha: listed.head, detached: true };
}

function removeAttemptWorktree(options) {
  const attempt = validateAttemptWorktree(options);
  git(attempt.repository.mainWorktree, [
    'worktree', 'remove', ...(options.force === true ? ['--force'] : []), attempt.path,
  ], { code: 'GIT_WORKTREE_PRESERVED' });
  return { ...attempt, removed: true };
}

function parseNameStatus(output) {
  const fields = output.toString('utf8').split('\0');
  if (fields.at(-1) === '') fields.pop();
  const changes = [];
  for (let index = 0; index < fields.length;) {
    const status = fields[index++];
    if (/^[RC][0-9]{1,3}$/.test(status)) {
      if (index + 1 >= fields.length) fail('GIT_DIFF_INVALID', 'Git returned an incomplete rename/copy record');
      changes.push({ status, oldPath: fields[index++], path: fields[index++] });
    } else {
      if (!/^[A-Z?][A-Z0-9?]*$/.test(status) || index >= fields.length) fail('GIT_DIFF_INVALID', 'Git returned an invalid name-status record');
      changes.push({ status, path: fields[index++] });
    }
  }
  return changes;
}

function collectChanges(options) {
  const baseSha = resolveCommit(options.cwd, options.baseSha);
  const tracked = parseNameStatus(git(options.cwd, ['diff', '--name-status', '-z', '-M', baseSha, '--']));
  const untracked = git(options.cwd, ['ls-files', '--others', '--exclude-standard', '-z']).toString('utf8').split('\0').filter(Boolean);
  return {
    baseSha,
    changes: [...tracked, ...untracked.map((filePath) => ({ status: '?', path: filePath }))],
  };
}

function commitPath(candidate, label) {
  if (typeof candidate !== 'string' || candidate === '' || CONTROL_CHARACTERS.test(candidate)
    || path.posix.isAbsolute(candidate) || path.win32.isAbsolute(candidate) || candidate.includes('\\')) {
    fail('GIT_COMMIT_PATH_INVALID', `${label} must be a safe repository-relative path`);
  }
  const segments = candidate.split('/');
  const normalized = path.posix.normalize(candidate).replace(/^\.\//, '');
  if (segments.includes('..') || normalized === '.' || normalized.startsWith('../')) {
    fail('GIT_COMMIT_PATH_INVALID', `${label} must not traverse outside the repository`, { path: candidate });
  }
  return normalized;
}

function matchesPrediction(candidate, prediction) {
  return path.matchesGlob(candidate, prediction);
}

function normalizeCommitPaths(acceptedPaths, predictedFiles) {
  if (!Array.isArray(acceptedPaths) || acceptedPaths.length === 0) {
    fail('GIT_COMMIT_PATHS_REQUIRED', 'Commit requires a non-empty accepted path list');
  }
  const accepted = [...new Set(acceptedPaths.map((candidate) => commitPath(candidate, 'Accepted path')))];
  const predicted = (predictedFiles || []).map((candidate) => commitPath(candidate, 'Predicted path'));
  const protectedPaths = accepted.filter((candidate) => candidate === '.workflow-runtime'
    || candidate.startsWith('.workflow-runtime/') || candidate.startsWith('specs/'));
  const unpredictedProtected = protectedPaths.filter((candidate) => !predicted.some((pattern) => matchesPrediction(candidate, pattern)));
  if (unpredictedProtected.length > 0) {
    fail('GIT_COMMIT_PROTECTED_PATH', 'Runtime, spec, and step edits must be explicitly predicted', { paths: unpredictedProtected });
  }
  return accepted.sort();
}

function zeroSeparatedNames(cwd, args) {
  return git(cwd, args).toString('utf8').split('\0').filter(Boolean).sort();
}

function preflightCommit(options) {
  if (!options || typeof options.cwd !== 'string') fail('GIT_COMMIT_INPUT_INVALID', 'Commit worktree is required');
  const parentSha = resolveCommit(options.cwd, options.parentSha);
  const branch = git(options.cwd, ['branch', '--show-current']).trim();
  const headSha = git(options.cwd, ['rev-parse', 'HEAD']).trim();
  if (branch !== '' || headSha !== parentSha) {
    fail('GIT_COMMIT_PARENT_MISMATCH', 'Commit attempt must remain detached at its expected parent', { branch, expected: parentSha, actual: headSha });
  }
  const acceptedPaths = normalizeCommitPaths(options.acceptedPaths, options.predictedFiles);
  const alreadyStaged = zeroSeparatedNames(options.cwd, ['diff', '--cached', '--name-only', '--no-renames', '-z', parentSha, '--']);
  if (alreadyStaged.length > 0) fail('GIT_COMMIT_INDEX_NOT_EMPTY', 'Commit preflight requires an empty index', { paths: alreadyStaged });

  git(options.cwd, ['add', '--', ...acceptedPaths], { code: 'GIT_COMMIT_STAGE_FAILED' });
  const stagedPaths = zeroSeparatedNames(options.cwd, ['diff', '--cached', '--name-only', '--no-renames', '-z', parentSha, '--']);
  if (stagedPaths.length === 0 || stagedPaths.length !== acceptedPaths.length
    || stagedPaths.some((candidate, index) => candidate !== acceptedPaths[index])) {
    fail('GIT_COMMIT_STAGE_MISMATCH', 'Staged paths do not exactly match accepted paths', { acceptedPaths, stagedPaths });
  }
  const treeSha = git(options.cwd, ['write-tree'], { code: 'GIT_COMMIT_TREE_FAILED' }).trim();
  return { cwd: fs.realpathSync(options.cwd), parentSha, treeSha, acceptedPaths };
}

function commitMessage(options) {
  let type;
  if (options.schemaVersion === '1.0.0') {
    type = LEGACY_COMMIT_TYPES[options.behaviorType];
    if (!type) fail('GIT_COMMIT_BEHAVIOR_INVALID', 'Commit behaviorType is not supported for a v1 step');
  } else if (options.schemaVersion === '2.0.0') {
    type = CHANGE_COMMIT_TYPES[options.changeType];
    if (!type) fail('GIT_COMMIT_CHANGE_TYPE_INVALID', 'Commit changeType is not supported for a v2 step');
  } else {
    fail('GIT_COMMIT_STEP_VERSION_INVALID', 'Commit requires a supported step schemaVersion');
  }
  for (const field of ['summary', 'specPath', 'stepId']) {
    if (typeof options[field] !== 'string' || options[field].trim() === '' || CONTROL_CHARACTERS.test(options[field])) {
      fail('GIT_COMMIT_MESSAGE_INVALID', `${field} must be a non-empty single-line value`);
    }
  }
  return {
    title: `${type}(workflow): ${options.summary.trim()}`,
    trailers: `Spec: ${options.specPath.trim()}\nStep: ${options.stepId.trim()}`,
  };
}

function commitObject(cwd, sha) {
  const parentLine = git(cwd, ['rev-list', '--parents', '-n', '1', sha]).trim().split(' ');
  if (parentLine.length !== 2) fail('GIT_COMMIT_PARENT_INVALID', 'Workflow commit must have exactly one parent', { sha });
  return {
    sha: parentLine[0],
    parentSha: parentLine[1],
    treeSha: git(cwd, ['rev-parse', `${sha}^{tree}`]).trim(),
  };
}

function assertCommitMatches(expected, actual) {
  if (actual.parentSha !== expected.parentSha || actual.treeSha !== expected.treeSha
    || (expected.sha !== undefined && actual.sha !== expected.sha)) {
    fail('GIT_COMMIT_RECONCILIATION_MISMATCH', 'Commit parent, tree, or SHA does not match persisted intent', { expected, actual });
  }
  return actual;
}

function createLocalCommit(options) {
  const message = commitMessage(options);
  git(options.cwd, ['commit', '-m', message.title, '-m', message.trailers], { code: 'GIT_COMMIT_REJECTED' });
  const actual = commitObject(options.cwd, git(options.cwd, ['rev-parse', 'HEAD']).trim());
  return { ...assertCommitMatches(options, actual), status: 'created' };
}

// Crash-recovery: se um commit (humano no worktree, ou automático antes de um crash) já existe, o
// resume não recommita — apenas prova que o commit corrente bate com a intenção persistida
// (parent + tree + sha). Divergência falha fechado em vez de duplicar o efeito.
function reconcileCommit(options) {
  if (!options || typeof options.cwd !== 'string') fail('GIT_COMMIT_INPUT_INVALID', 'Commit reconciliation worktree is required');
  const headSha = git(options.cwd, ['rev-parse', 'HEAD']).trim();
  return { ...assertCommitMatches(options, commitObject(options.cwd, headSha)), status: 'reconciled' };
}

module.exports = {
  GitError,
  collectChanges,
  createLocalCommit,
  createAttemptWorktree,
  identifyRepository,
  preflightCommit,
  reconcileCommit,
  removeAttemptWorktree,
  validateAttemptWorktree,
  validateBase,
};
