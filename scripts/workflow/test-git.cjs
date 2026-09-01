'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const {
  collectChanges,
  createAttemptWorktree,
  identifyRepository,
  removeAttemptWorktree,
  validateAttemptWorktree,
  validateBase,
} = require('./lib/git.cjs');
const { evaluateScope, logicalFileCount, normalizeRepoPath } = require('./lib/scope.cjs');

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function write(root, relativePath, content) {
  fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
  fs.writeFileSync(path.join(root, relativePath), content);
}

function temporaryRepository(files = { 'src/original.txt': 'original\n' }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-git-'));
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['config', 'user.name', 'Workflow Test']);
  git(root, ['config', 'user.email', 'workflow@example.invalid']);
  fs.appendFileSync(path.join(root, '.git/info/exclude'), '\n.workflow-runtime/\n');
  for (const [filePath, content] of Object.entries(files)) write(root, filePath, content);
  git(root, ['add', '.']);
  git(root, ['commit', '-qm', 'fixture']);
  test.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function base(root) {
  return { sha: git(root, ['rev-parse', 'HEAD']), branch: git(root, ['branch', '--show-current']) };
}

function boundaries() {
  return { inScope: ['Git workflow files'], outOfScope: ['Unrelated application files'] };
}

function scope(root, changes, predictedFiles, allowedAreas = ['src/**']) {
  return evaluateScope({ root, changes, predictedFiles, allowedAreas, semanticBoundaryEvidence: boundaries() });
}

test('identifies common directory, main worktree, and stable identity from a linked worktree', () => {
  const root = temporaryRepository();
  const linked = path.join(path.dirname(root), `${path.basename(root)}-linked`);
  git(root, ['worktree', 'add', '-q', '--detach', linked]);
  try {
    const main = identifyRepository(root);
    const other = identifyRepository(linked);
    assert.equal(other.identity, main.identity);
    assert.equal(other.commonDirectory, main.commonDirectory);
    assert.equal(other.mainWorktree, fs.realpathSync(root));
    assert.equal(other.worktree, fs.realpathSync(linked));
  } finally {
    git(root, ['worktree', 'remove', linked]);
  }
});

test('base preflight requires approval, a clean main worktree, and matching SHA/branch/HEAD', () => {
  const root = temporaryRepository();
  const approved = base(root);
  assert.throws(() => validateBase({ cwd: root, baseSha: approved.sha, baseBranch: approved.branch }), { code: 'GIT_BASE_NOT_APPROVED' });
  assert.equal(validateBase({ cwd: root, baseSha: approved.sha, baseBranch: approved.branch, approved: true }).baseSha, approved.sha);
  write(root, 'dirty.txt', 'dirty\n');
  assert.throws(() => validateBase({ cwd: root, baseSha: approved.sha, baseBranch: approved.branch, approved: true }), { code: 'GIT_PREFLIGHT_DIRTY' });
  fs.rmSync(path.join(root, 'dirty.txt'));
  assert.throws(() => validateBase({ cwd: root, baseSha: approved.sha, baseBranch: 'missing', approved: true }), { code: 'GIT_BASE_BRANCH_NOT_FOUND' });
  assert.throws(() => validateBase({ cwd: root, baseSha: 'a'.repeat(40), baseBranch: approved.branch, approved: true }), { code: 'GIT_BASE_SHA_NOT_FOUND' });
});

test('creates every attempt detached from the same SHA under runtime and leaves main intact', () => {
  const root = temporaryRepository();
  const approved = base(root);
  const runtimeRoot = path.join(root, '.workflow-runtime', 'run-1');
  const first = createAttemptWorktree({ cwd: root, runtimeRoot, attemptId: 'attempt-1', baseSha: approved.sha });
  const second = createAttemptWorktree({ cwd: root, runtimeRoot, attemptId: 'attempt-2', baseSha: approved.sha });
  try {
    assert.equal(first.headSha, approved.sha);
    assert.equal(second.headSha, approved.sha);
    assert.ok(first.path.startsWith(fs.realpathSync(runtimeRoot)));
    write(first.path, 'src/attempt.txt', 'attempt\n');
    assert.equal(fs.existsSync(path.join(root, 'src/attempt.txt')), false);
    assert.equal(git(root, ['rev-parse', 'HEAD']), approved.sha);
    assert.equal(git(root, ['status', '--porcelain']), '');
  } finally {
    fs.rmSync(path.join(first.path, 'src/attempt.txt'));
    removeAttemptWorktree({ cwd: root, worktreePath: first.path, baseSha: approved.sha });
    removeAttemptWorktree({ cwd: root, worktreePath: second.path, baseSha: approved.sha });
  }
});

test('cleanup validates listing/base and preserves a dirty worktree on error', () => {
  const root = temporaryRepository();
  const approved = base(root);
  const attempt = createAttemptWorktree({ cwd: root, runtimeRoot: path.join(root, '.workflow-runtime'), attemptId: 'preserved', baseSha: approved.sha });
  write(attempt.path, 'untracked.txt', 'preserve me\n');
  assert.throws(() => removeAttemptWorktree({ cwd: root, worktreePath: attempt.path, baseSha: approved.sha }), { code: 'GIT_WORKTREE_PRESERVED' });
  assert.equal(fs.readFileSync(path.join(attempt.path, 'untracked.txt'), 'utf8'), 'preserve me\n');
  assert.equal(validateAttemptWorktree({ cwd: root, worktreePath: attempt.path, baseSha: approved.sha }).path, attempt.path);
  assert.throws(() => validateAttemptWorktree({ cwd: root, worktreePath: root, baseSha: approved.sha }), { code: 'GIT_WORKTREE_BASE_MISMATCH' });
  const unlisted = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-unlisted-'));
  assert.throws(() => validateAttemptWorktree({ cwd: root, worktreePath: unlisted, baseSha: approved.sha }), { code: 'GIT_WORKTREE_NOT_LISTED' });
  fs.rmSync(unlisted, { recursive: true });
  fs.rmSync(path.join(attempt.path, 'untracked.txt'));
  removeAttemptWorktree({ cwd: root, worktreePath: attempt.path, baseSha: approved.sha });
});

test('removal on resume admits the recorded committed head and still rejects unknown drift', () => {
  const root = temporaryRepository();
  const approved = base(root);
  const attempt = createAttemptWorktree({ cwd: root, runtimeRoot: path.join(root, '.workflow-runtime'), attemptId: 'committed-removal', baseSha: approved.sha });
  write(attempt.path, 'src/committed.txt', 'committed\n');
  git(attempt.path, ['add', '.']);
  git(attempt.path, ['commit', '-qm', 'step output']);
  const committedHead = git(attempt.path, ['rev-parse', 'HEAD']);
  assert.notEqual(committedHead, approved.sha);
  assert.throws(
    () => removeAttemptWorktree({ cwd: root, worktreePath: attempt.path, baseSha: approved.sha, force: true }),
    { code: 'GIT_WORKTREE_BASE_MISMATCH' },
  );
  removeAttemptWorktree({ cwd: root, worktreePath: attempt.path, baseSha: approved.sha, allowedHead: committedHead, force: true });
  assert.equal(fs.existsSync(attempt.path), false);
});

test('collects Git R rename evidence once while preserving both paths', () => {
  const root = temporaryRepository({ 'src/original.txt': 'one\ntwo\nthree\nfour\nfive\n' });
  const approved = base(root);
  git(root, ['mv', 'src/original.txt', 'src/renamed.txt']);
  fs.appendFileSync(path.join(root, 'src/renamed.txt'), 'six\n');
  const { changes } = collectChanges({ cwd: root, baseSha: approved.sha });
  assert.equal(changes.length, 1);
  assert.match(changes[0].status, /^R\d+$/);
  assert.deepEqual([changes[0].oldPath, changes[0].path], ['src/original.txt', 'src/renamed.txt']);
  assert.equal(logicalFileCount(changes), 1);
  const result = scope(root, changes, ['src/original.txt', 'src/renamed.txt']);
  assert.equal(result.status, 'accepted');
  assert.equal(result.evidence.changes[0].oldPath, 'src/original.txt');
});

test('counts a case-only rename once when Git reports R', () => {
  const root = temporaryRepository({ 'src/name.txt': 'case-only\n' });
  const approved = base(root);
  git(root, ['mv', 'src/name.txt', 'src/NAME.txt']);
  const { changes } = collectChanges({ cwd: root, baseSha: approved.sha });
  assert.equal(changes.length, 1);
  assert.match(changes[0].status, /^R\d+$/);
  assert.deepEqual([changes[0].oldPath, changes[0].path], ['src/name.txt', 'src/NAME.txt']);
  assert.equal(logicalFileCount(changes), 1);
});

test('ambiguous delete/add counts two and deletion plus untracked files are collected', () => {
  const root = temporaryRepository({ 'src/old.txt': 'old content\n', 'src/delete.txt': 'delete\n' });
  const approved = base(root);
  fs.rmSync(path.join(root, 'src/old.txt'));
  fs.rmSync(path.join(root, 'src/delete.txt'));
  write(root, 'src/new.txt', 'entirely unrelated replacement with much more text\n');
  write(root, 'src/untracked.txt', 'new\n');
  const { changes } = collectChanges({ cwd: root, baseSha: approved.sha });
  assert.deepEqual(changes.map((change) => change.status).sort(), ['?', '?', 'D', 'D']);
  assert.equal(logicalFileCount(changes), 4);
});

test('collects tracked symlink and submodule changes as logical files', (context) => {
  if (process.platform === 'win32') context.skip('symlink fixture requires POSIX semantics');
  const child = temporaryRepository({ 'child.txt': 'child\n' });
  const root = temporaryRepository({ 'src/file.txt': 'file\n' });
  fs.symlinkSync('file.txt', path.join(root, 'src/link'));
  git(root, ['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', child, 'vendor/child']);
  git(root, ['add', '.']);
  git(root, ['commit', '-qm', 'add symlink and submodule']);
  const approved = base(root);
  fs.rmSync(path.join(root, 'src/link'));
  fs.symlinkSync('../missing', path.join(root, 'src/link'));
  write(path.join(root, 'vendor/child'), 'child.txt', 'changed\n');
  const { changes } = collectChanges({ cwd: root, baseSha: approved.sha });
  assert.deepEqual(changes.map((change) => change.path).sort(), ['src/link', 'vendor/child']);
  assert.equal(logicalFileCount(changes), 2);
});

test('hard-blocks the sixth logical file before evaluating declarations', () => {
  const root = temporaryRepository();
  const changes = Array.from({ length: 6 }, (_, index) => ({ status: '?', path: `src/${index}.txt` }));
  assert.throws(
    () => evaluateScope({ root, changes, predictedFiles: ['/invalid'], allowedAreas: [], semanticBoundaryEvidence: null }),
    { code: 'SCOPE_LOGICAL_FILE_LIMIT' },
  );
});

test('requires predictions inside allowed areas and classifies unpredicted paths', () => {
  const root = temporaryRepository();
  assert.throws(() => scope(root, [], ['docs/file.md']), { code: 'SCOPE_PREDICTION_OUTSIDE_ALLOWED' });
  const inside = scope(root, [{ status: '?', path: 'src/unexpected.txt' }], ['src/expected.txt']);
  assert.equal(inside.status, 'human_decision');
  assert.deepEqual(inside.unpredicted, ['src/unexpected.txt']);
  assert.deepEqual(inside.evidence.allowedAreas, ['src/**']);
  assert.deepEqual(inside.evidence.semanticBoundaryEvidence, boundaries());
  assert.throws(() => scope(root, [{ status: '?', path: 'docs/outside.md' }], ['src/expected.txt']), { code: 'SCOPE_OUTSIDE_ALLOWED_AREA' });
  assert.throws(
    () => evaluateScope({ root, changes: [], predictedFiles: ['src/file.txt'], allowedAreas: ['src'], semanticBoundaryEvidence: null }),
    { code: 'SCOPE_BOUNDARY_EVIDENCE_REQUIRED' },
  );
});

test('normalizes safe relative paths and rejects absolute, traversal, control, and symlink escapes', (context) => {
  if (process.platform === 'win32') context.skip('symlink fixture requires POSIX semantics');
  const root = temporaryRepository();
  assert.equal(normalizeRepoPath('./src/file.txt'), 'src/file.txt');
  for (const invalid of ['/tmp/file', 'C:\\tmp\\file', '../file', 'src/../file', 'src/\nfile', 'src\0file']) {
    assert.throws(() => normalizeRepoPath(invalid));
  }
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-outside-'));
  test.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.symlinkSync(outside, path.join(root, 'src/escape'));
  assert.throws(
    () => scope(root, [{ status: '?', path: 'src/escape/file.txt' }], ['src/escape/file.txt']),
    { code: 'SCOPE_SYMLINK_ESCAPE' },
  );
});
