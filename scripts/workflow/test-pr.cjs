'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { createPullRequest, pullRequestBody } = require('./lib/pr.cjs');

const SHA = 'a'.repeat(40);
const HASH = 'b'.repeat(64);

function processResult(ok, stdout = '', exitCode = ok ? 0 : 1) {
  return { ok, exitCode, stdout: { text: stdout }, stderr: { text: '' } };
}

function fakeProcess(overrides = {}) {
  const calls = [];
  const responses = {
    'gh --version': processResult(true, 'gh version 2.0\n'),
    'git symbolic-ref --quiet --short HEAD': processResult(true, 'feature/pr\n'),
    'git config --get branch.feature/pr.remote': processResult(true, 'origin\n'),
    'git config --get branch.feature/pr.merge': processResult(true, 'refs/heads/feature/pr\n'),
    'git config --get-regexp ^url\\..*\\.(insteadOf|pushInsteadOf)$': processResult(false, '', 1),
    'git remote get-url --all origin': processResult(true, 'git@github.com:owner/repo.git\n'),
    'gh auth status --hostname github.com': processResult(true),
    'git rev-parse HEAD': processResult(true, `${SHA}\n`),
    'git ls-remote --exit-code origin refs/heads/feature/pr': processResult(true, `${SHA}\trefs/heads/feature/pr\n`),
    'gh pr list --repo owner/repo --head feature/pr --state all --limit 1 --json url': processResult(true, '[]\n'),
  };
  return {
    calls,
    async run(options) {
      calls.push({
        executable: options.executable, args: [...options.args], envAllowlist: [...options.envAllowlist],
        timeoutMs: options.timeoutMs, maxOutputBytes: options.maxOutputBytes,
      });
      const key = `${options.executable} ${options.args.join(' ')}`;
      if (options.args[0] === 'pr' && options.args[1] === 'create') {
        return overrides.create || processResult(true, 'https://github.com/owner/repo/pull/42\n');
      }
      return overrides[key] || responses[key] || processResult(false);
    },
  };
}

function processOptions(fake) {
  return {
    runProcess: fake.run,
    gitResource: {
      id: 'git', type: 'tool', executable: 'git', args: [], envAllowlist: ['HOME', 'PATH', 'TMPDIR'],
      timeoutMs: 30000, maxOutputBytes: 1024 * 1024,
    },
    ghResource: {
      id: 'gh', type: 'tool', executable: 'gh', args: [], envAllowlist: ['GH_CONFIG_DIR', 'GH_HOST', 'HOME', 'PATH', 'TMPDIR'],
      timeoutMs: 60000, maxOutputBytes: 1024 * 1024,
    },
  };
}

function input(overrides = {}) {
  return {
    createPr: true,
    globalStatus: 'SUCCEEDED',
    acceptance: { ok: true },
    worktree: process.cwd(),
    specPath: 'specs/example.md',
    steps: [{ id: 'step-1', commit: { sha: SHA } }],
    gates: [{ id: 'test', passed: true }],
    evidence: [{ acId: 'AC-01', token: 'ghp_abcdefghijklmnopqrstuvwxyz' }],
    risks: ['No push is performed.'],
    ...overrides,
  };
}

function assertNoPush(calls) {
  assert.equal(calls.some((call) => call.args[0] === 'push'), false, JSON.stringify(calls));
}

test('defaults to disabled and requires successful global acceptance without spawning', async () => {
  const fake = fakeProcess();
  assert.deepEqual(await createPullRequest({ createPr: false }, { runProcess: fake.run }), { ok: true, attempted: false, status: 'disabled' });
  assert.equal((await createPullRequest(input({ globalStatus: 'BLOCKED' }), { runProcess: fake.run })).code, 'PR_GLOBAL_SUCCESS_REQUIRED');
  assert.equal((await createPullRequest(input({ acceptance: { ok: false } }), { runProcess: fake.run })).code, 'PR_GLOBAL_SUCCESS_REQUIRED');
  assert.equal((await createPullRequest(input({ worktree: '' }), { runProcess: fake.run })).code, 'PR_WORKTREE_REQUIRED');
  assert.equal(fake.calls.length, 0);
});

test('reports missing gh, branch, upstream, authentication and remote publication clearly', async () => {
  const cases = [
    ['gh --version', processResult(false, '', null), 'PR_GH_UNAVAILABLE'],
    ['git symbolic-ref --quiet --short HEAD', processResult(false), 'PR_BRANCH_REQUIRED'],
    ['git symbolic-ref --quiet --short HEAD', processResult(true, 'main\n'), 'PR_MAIN_BRANCH_FORBIDDEN'],
    ['git config --get branch.feature/pr.remote', processResult(false), 'PR_UPSTREAM_REQUIRED'],
    ['git config --get-regexp ^url\\..*\\.(insteadOf|pushInsteadOf)$', processResult(false, '', 2), 'PR_REMOTE_VALIDATION_FAILED'],
    ['git remote get-url --all origin', processResult(false), 'PR_REMOTE_REQUIRED'],
    ['gh auth status --hostname github.com', processResult(false), 'PR_GH_AUTH_REQUIRED'],
    ['git rev-parse HEAD', processResult(true, 'not-a-sha\n'), 'PR_HEAD_INVALID'],
    ['git ls-remote --exit-code origin refs/heads/feature/pr', processResult(false), 'PR_REMOTE_BRANCH_REQUIRED'],
    ['git ls-remote --exit-code origin refs/heads/feature/pr', processResult(true, `${'c'.repeat(40)}\trefs/heads/feature/pr\n`), 'PR_UPSTREAM_DIVERGED'],
  ];
  for (const [command, response, code] of cases) {
    const fake = fakeProcess({ [command]: response });
    assert.equal((await createPullRequest(input(), processOptions(fake))).code, code);
    assertNoPush(fake.calls);
  }
});

test('rejects URL rewrites, credentials, non-GitHub remotes and mismatched fetch URLs', async () => {
  const cases = [
    ['git config --get-regexp ^url\\..*\\.(insteadOf|pushInsteadOf)$', processResult(true, 'url.ssh://git@github.com/.insteadOf git://github.com/\n'), 'PR_REMOTE_REWRITE_UNSAFE'],
    ['git remote get-url --all origin', processResult(true, 'https://user:secret@github.com/owner/repo.git\n'), 'PR_REMOTE_UNSAFE'],
    ['git remote get-url --all origin', processResult(true, 'ssh://github.com/owner/repo.git\n'), 'PR_REMOTE_UNSAFE'],
    ['git remote get-url --all origin', processResult(true, 'git@example.com:owner/repo.git\n'), 'PR_REMOTE_UNSAFE'],
    ['git remote get-url --all origin', processResult(true, 'git@github.com:owner/repo.git\ngit@github.com:other/repo.git\n'), 'PR_REMOTE_UNSAFE'],
  ];
  for (const [command, response, code] of cases) {
    const fake = fakeProcess({ [command]: response });
    assert.equal((await createPullRequest(input(), processOptions(fake))).code, code);
    assertNoPush(fake.calls);
  }
});

test('returns an existing PR without creating another one', async () => {
  const fake = fakeProcess({
    'gh pr list --repo owner/repo --head feature/pr --state all --limit 1 --json url': processResult(true, '[{"url":"https://github.com/owner/repo/pull/9"}]\n'),
  });
  const result = await createPullRequest(input(), processOptions(fake));
  assert.equal(result.status, 'existing');
  assert.equal(result.url, 'https://github.com/owner/repo/pull/9');
  assert.equal(fake.calls.some((call) => call.args[0] === 'pr' && call.args[1] === 'create'), false);
  assertNoPush(fake.calls);
});

test('creates a PR with fixed argv and a sanitized complete body', async () => {
  const fake = fakeProcess();
  const result = await createPullRequest(input(), processOptions(fake));
  assert.equal(result.status, 'created');
  assert.equal(result.url, 'https://github.com/owner/repo/pull/42');
  const create = fake.calls.find((call) => call.args[0] === 'pr' && call.args[1] === 'create');
  const body = create.args[create.args.indexOf('--body') + 1];
  for (const heading of ['Spec', 'Steps', 'Gates', 'Evidence', 'Risks']) assert.match(body, new RegExp(`## ${heading}`));
  assert.doesNotMatch(body, /ghp_abcdefghijklmnopqrstuvwxyz/);
  assert.match(body, /\[REDACTED:API_KEY\]/);
  for (const call of fake.calls.filter((entry) => entry.executable === 'git')) {
    assert.deepEqual(call.envAllowlist, ['HOME', 'PATH', 'TMPDIR']);
    assert.equal(call.timeoutMs, 30000);
  }
  for (const call of fake.calls.filter((entry) => entry.executable === 'gh')) {
    assert.deepEqual(call.envAllowlist, ['GH_CONFIG_DIR', 'GH_HOST', 'HOME', 'PATH', 'TMPDIR']);
    assert.equal(call.timeoutMs, 60000);
  }
  assertNoPush(fake.calls);
  assert.doesNotMatch(pullRequestBody(input()), /ghp_abcdefghijklmnopqrstuvwxyz/);
});

test('keeps lookup/create failures separate and never invokes push', async () => {
  const lookup = fakeProcess({
    'gh pr list --repo owner/repo --head feature/pr --state all --limit 1 --json url': processResult(false),
  });
  assert.equal((await createPullRequest(input(), processOptions(lookup))).code, 'PR_LOOKUP_FAILED');
  const create = fakeProcess({ create: processResult(false) });
  assert.equal((await createPullRequest(input(), processOptions(create))).code, 'PR_CREATE_FAILED');
  const invalidLookup = fakeProcess({
    'gh pr list --repo owner/repo --head feature/pr --state all --limit 1 --json url': processResult(true, '{"url":"invalid"}\n'),
  });
  assert.equal((await createPullRequest(input(), processOptions(invalidLookup))).code, 'PR_LOOKUP_FAILED');
  const invalidCreated = fakeProcess({ create: processResult(true, 'not-a-url\n') });
  assert.equal((await createPullRequest(input(), processOptions(invalidCreated))).code, 'PR_CREATE_RESPONSE_INVALID');
  assertNoPush([...lookup.calls, ...create.calls, ...invalidLookup.calls, ...invalidCreated.calls]);
});

