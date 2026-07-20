'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { createLocalCommit, preflightCommit, reconcileCommit } = require('./lib/git.cjs');

function git(cwd, args, expected = 0) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', shell: false });
  assert.equal(result.status, expected, result.stderr);
  return result.stdout.trim();
}

function repository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-commit-'));
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['config', 'user.name', 'Workflow Test']);
  git(root, ['config', 'user.email', 'workflow@example.invalid']);
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src/file.txt'), 'before\n');
  git(root, ['add', '--', 'src/file.txt']);
  git(root, ['commit', '-qm', 'chore(test): fixture']);
  const parentSha = git(root, ['rev-parse', 'HEAD']);
  git(root, ['switch', '--detach', '-q', parentSha]);
  test.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, parentSha };
}

function change(root, relativePath = 'src/file.txt') {
  fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
  fs.writeFileSync(path.join(root, relativePath), 'after\n');
}

function messageOptions(fixture) {
  return {
    cwd: fixture.root,
    schemaVersion: '1.0.0',
    behaviorType: 'feature',
    summary: 'Add accepted workflow change',
    specPath: 'specs/pipeline.md',
    stepId: 'pipeline-step-12',
  };
}

function committedTitle(typeOptions) {
  const fixture = repository();
  change(fixture.root);
  const intent = preflightCommit({
    cwd: fixture.root,
    parentSha: fixture.parentSha,
    acceptedPaths: ['src/file.txt'],
    predictedFiles: ['src/file.txt'],
  });
  createLocalCommit({ ...intent, ...messageOptions(fixture), ...typeOptions });
  return git(fixture.root, ['log', '-1', '--pretty=%s']);
}

function acceptedInput() {
  return {
    schema: {}, state: {}, scope: {}, gates: [], revalidation: {}, review: {}, artifacts: [], acceptanceCriteria: [], evidence: [],
    lock: { held: true, valid: true }, budget: { available: true },
  };
}

// reconcileCommit is what a resume leans on to decide an existing commit is the one acceptance
// approved, so it has to reject a commit that differs from the persisted intent in any of the three
// fields it compares — not only the tree. It reads HEAD itself; the intent is what it is given.
test('reconcileCommit accepts only a commit matching the persisted parent, tree and SHA', () => {
  const fixture = repository();
  change(fixture.root);
  git(fixture.root, ['add', '--', 'src/file.txt']);
  git(fixture.root, ['commit', '-qm', 'chore(test): committed work']);
  const head = {
    sha: git(fixture.root, ['rev-parse', 'HEAD']),
    parentSha: fixture.parentSha,
    treeSha: git(fixture.root, ['rev-parse', 'HEAD^{tree}']),
  };

  assert.equal(reconcileCommit({ ...head, cwd: fixture.root }).status, 'reconciled');
  for (const [field, value] of [['treeSha', 'a'.repeat(40)], ['parentSha', 'b'.repeat(40)], ['sha', 'c'.repeat(40)]]) {
    assert.throws(
      () => reconcileCommit({ ...head, [field]: value, cwd: fixture.root }),
      { code: 'GIT_COMMIT_RECONCILIATION_MISMATCH' },
      field,
    );
  }
});

test('commit messages use behaviorType only for v1 and changeType only for v2', async (context) => {
  const cases = [
    { name: 'v1 behaviorType', input: { schemaVersion: '1.0.0', behaviorType: 'feature', changeType: 'documentation' }, prefix: 'feat' },
    { name: 'v2 bugfix', input: { schemaVersion: '2.0.0', changeType: 'bugfix', behaviorType: 'feature' }, prefix: 'fix' },
    { name: 'v2 test', input: { schemaVersion: '2.0.0', changeType: 'test' }, prefix: 'test' },
    { name: 'v2 vetted dependency', input: { schemaVersion: '2.0.0', changeType: 'vetted_dependency' }, prefix: 'chore' },
    { name: 'v2 documentation', input: { schemaVersion: '2.0.0', changeType: 'documentation' }, prefix: 'docs' },
    { name: 'v2 feature', input: { schemaVersion: '2.0.0', changeType: 'feature' }, prefix: 'feat' },
    { name: 'v2 API contract', input: { schemaVersion: '2.0.0', changeType: 'api_contract' }, prefix: 'feat' },
    { name: 'v2 database migration', input: { schemaVersion: '2.0.0', changeType: 'database_migration' }, prefix: 'feat' },
    { name: 'v2 architecture', input: { schemaVersion: '2.0.0', changeType: 'architecture' }, prefix: 'refactor' },
    { name: 'v2 security', input: { schemaVersion: '2.0.0', changeType: 'security' }, prefix: 'fix' },
    { name: 'v2 irreversible', input: { schemaVersion: '2.0.0', changeType: 'irreversible' }, prefix: 'chore' },
    { name: 'v2 infrastructure', input: { schemaVersion: '2.0.0', changeType: 'infrastructure' }, prefix: 'chore' },
    { name: 'v2 permissions', input: { schemaVersion: '2.0.0', changeType: 'permissions' }, prefix: 'chore' },
  ];
  for (const entry of cases) {
    await context.test(entry.name, () => {
      assert.equal(committedTitle(entry.input), `${entry.prefix}(workflow): Add accepted workflow change`);
    });
  }
});

test('commit message classification fails closed by step version', () => {
  assert.throws(
    () => committedTitle({ schemaVersion: '2.0.0', changeType: undefined, behaviorType: 'feature' }),
    { code: 'GIT_COMMIT_CHANGE_TYPE_INVALID' },
  );
  assert.throws(
    () => committedTitle({ schemaVersion: '3.0.0', behaviorType: 'feature' }),
    { code: 'GIT_COMMIT_STEP_VERSION_INVALID' },
  );
});

test('implementation contains no push, add-dot, no-verify, or shell execution path', () => {
  const gitSource = fs.readFileSync(path.join(__dirname, 'lib/git.cjs'), 'utf8');
  const orchestratorSource = fs.readFileSync(path.join(__dirname, 'lib/orchestrator.cjs'), 'utf8');
  assert.doesNotMatch(`${gitSource}\n${orchestratorSource}`, /\['push'|\['add',\s*['"]\.['"]|--no-verify|shell:\s*true/);
  assert.match(gitSource, /\['add', '--', \.\.\.acceptedPaths\]/);
  assert.match(orchestratorSource, /spec\.execution\.autoCommit === true && context\.options\.allowCommit === true/);
  assert.match(orchestratorSource, /if \(options\.createPr === true\)/);
});
