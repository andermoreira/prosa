'use strict';

const path = require('node:path');
const { runProcess } = require('./process.cjs');
const { sanitize } = require('./sanitize.cjs');

const SHA_PATTERN = /^[0-9a-f]{40}$/;

function outcome(code, message) {
  return { ok: false, attempted: true, status: 'failed', code, message };
}

function output(result, stream = 'stdout') {
  return result?.[stream]?.text || '';
}

function githubRepository(remoteUrl) {
  let owner;
  let repository;
  if (/^git@github\.com:[^/]+\/[^/]+$/.test(remoteUrl)) {
    [owner, repository] = remoteUrl.slice('git@github.com:'.length).split('/');
  } else {
    let parsed;
    try { parsed = new URL(remoteUrl); }
    catch { return null; }
    if (parsed.hostname !== 'github.com' || parsed.port || parsed.search || parsed.hash) return null;
    if ((parsed.protocol === 'ssh:' && parsed.username !== 'git') || (parsed.protocol === 'https:' && parsed.username)) return null;
    if (parsed.password || !['https:', 'ssh:'].includes(parsed.protocol)) return null;
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length !== 2) return null;
    [owner, repository] = parts;
  }
  repository = repository.replace(/\.git$/, '');
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repository)) return null;
  return { host: 'github.com', nameWithOwner: `${owner}/${repository}` };
}

function section(title, value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value ?? [], null, 2);
  return `## ${title}\n${sanitize(text || 'None.', { maxBytes: 10 * 1024 }).content}`;
}

function pullRequestBody(input) {
  return sanitize([
    section('Spec', input.specPath || 'Not provided.'),
    section('Steps', input.steps),
    section('Gates', input.gates),
    section('Evidence', input.evidence),
    section('Risks', input.risks),
  ].join('\n\n'), { maxBytes: 60 * 1024 }).content;
}

function pullRequestTitle(input) {
  const fallback = `Automated spec: ${path.basename(input.specPath || 'workflow run', path.extname(input.specPath || ''))}`;
  return sanitize(input.title || fallback, { maxBytes: 256 }).content.replace(/[\r\n]+/g, ' ').trim();
}

function validPullRequestUrl(value, repository) {
  const escaped = repository.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = value.trim().match(new RegExp(`https://github\\.com/${escaped}/pull/\\d+`));
  return match?.[0] || null;
}

async function createPullRequest(input, options = {}) {
  if (input?.createPr !== true) return { ok: true, attempted: false, status: 'disabled' };
  if (input.globalStatus !== 'SUCCEEDED' || input.acceptance?.ok !== true) {
    return outcome('PR_GLOBAL_SUCCESS_REQUIRED', 'Pull request creation requires successful global acceptance');
  }
  if (typeof input.worktree !== 'string' || input.worktree.trim() === '') {
    return outcome('PR_WORKTREE_REQUIRED', 'Pull request creation requires the integrated worktree');
  }

  const execute = options.runProcess || runProcess;
  const resources = { git: options.gitResource, gh: options.ghResource };
  if (Object.entries(resources).some(([id, resource]) => (
    !resource || resource.id !== id || resource.type !== 'tool' || typeof resource.executable !== 'string'
    || !Array.isArray(resource.args) || !Array.isArray(resource.envAllowlist)
    || !Number.isInteger(resource.timeoutMs) || !Number.isInteger(resource.maxOutputBytes)
  ))) {
    return outcome('PR_RESOURCE_INVALID', 'Pull request creation requires validated git and gh resources');
  }
  const run = async (resource, args) => {
    return execute({
      executable: resource.executable, args: [...resource.args, ...args], root: input.worktree, cwd: '.',
      envAllowlist: resource.envAllowlist, timeoutMs: resource.timeoutMs, maxOutputBytes: resource.maxOutputBytes,
    });
  };
  const git = (args) => run(resources.git, args);
  const gh = (args) => run(resources.gh, args);

  const ghVersion = await gh(['--version']);
  if (!ghVersion.ok) return outcome('PR_GH_UNAVAILABLE', 'GitHub CLI (gh) is required and must be available on PATH');

  const branchResult = await git(['symbolic-ref', '--quiet', '--short', 'HEAD']);
  const branch = output(branchResult).trim();
  if (!branchResult.ok || !branch) return outcome('PR_BRANCH_REQUIRED', 'Pull request creation requires a checked-out branch');
  if (['main', 'master'].includes(branch)) return outcome('PR_MAIN_BRANCH_FORBIDDEN', 'Pull request creation requires a non-main branch');

  const remoteResult = await git(['config', '--get', `branch.${branch}.remote`]);
  const mergeResult = await git(['config', '--get', `branch.${branch}.merge`]);
  const remote = output(remoteResult).trim();
  const mergeRef = output(mergeResult).trim();
  if (!remoteResult.ok || !mergeResult.ok || !remote || remote === '.' || !mergeRef.startsWith('refs/heads/')) {
    return outcome('PR_UPSTREAM_REQUIRED', 'Publish the branch and configure its upstream before creating a pull request');
  }
  const remoteBranch = mergeRef.slice('refs/heads/'.length);
  if (!remoteBranch) return outcome('PR_UPSTREAM_REQUIRED', 'The upstream remote branch is invalid');

  const rewrites = await git(['config', '--get-regexp', '^url\\..*\\.(insteadOf|pushInsteadOf)$']);
  if (rewrites.ok && output(rewrites).trim()) return outcome('PR_REMOTE_REWRITE_UNSAFE', 'Git URL rewrites must be removed before creating a pull request');
  if (!rewrites.ok && rewrites.exitCode !== 1) return outcome('PR_REMOTE_VALIDATION_FAILED', 'Git URL rewrite configuration could not be validated');

  const fetchUrls = await git(['remote', 'get-url', '--all', remote]);
  if (!fetchUrls.ok) return outcome('PR_REMOTE_REQUIRED', 'The upstream remote URL could not be read');
  const repositories = output(fetchUrls).split(/\r?\n/).filter(Boolean).map(githubRepository);
  if (repositories.length === 0 || repositories.some((entry) => !entry)
    || repositories.some((entry) => entry.nameWithOwner !== repositories[0].nameWithOwner)) {
    return outcome('PR_REMOTE_UNSAFE', 'The upstream must use credential-free GitHub URLs for one repository');
  }
  const repository = repositories[0];

  const auth = await gh(['auth', 'status', '--hostname', repository.host]);
  if (!auth.ok) return outcome('PR_GH_AUTH_REQUIRED', `Authenticate gh for ${repository.host} before creating a pull request`);

  const headResult = await git(['rev-parse', 'HEAD']);
  const headSha = output(headResult).trim();
  if (!headResult.ok || !SHA_PATTERN.test(headSha)) return outcome('PR_HEAD_INVALID', 'The local HEAD SHA could not be determined');
  const remoteHead = await git(['ls-remote', '--exit-code', remote, mergeRef]);
  const remoteSha = output(remoteHead).trim().split(/\s+/)[0];
  if (!remoteHead.ok || !SHA_PATTERN.test(remoteSha)) return outcome('PR_REMOTE_BRANCH_REQUIRED', 'The upstream branch must exist on the remote before creating a pull request');
  if (headSha !== remoteSha) return outcome('PR_UPSTREAM_DIVERGED', 'Push the current HEAD outside the pipeline so it matches the upstream branch');

  const existing = await gh(['pr', 'list', '--repo', repository.nameWithOwner, '--head', remoteBranch, '--state', 'all', '--limit', '1', '--json', 'url']);
  if (!existing.ok) return outcome('PR_LOOKUP_FAILED', 'Existing pull requests could not be checked');
  let existingEntries;
  try { existingEntries = JSON.parse(output(existing)); }
  catch { return outcome('PR_LOOKUP_FAILED', 'GitHub CLI returned an invalid pull request lookup response'); }
  if (!Array.isArray(existingEntries)) return outcome('PR_LOOKUP_FAILED', 'GitHub CLI returned an invalid pull request lookup response');
  const existingUrl = validPullRequestUrl(existingEntries?.[0]?.url || '', repository.nameWithOwner);
  if (existingEntries.length > 0 && !existingUrl) return outcome('PR_LOOKUP_FAILED', 'GitHub CLI returned an invalid existing pull request URL');
  if (existingUrl) return { ok: true, attempted: true, status: 'existing', url: existingUrl, branch, headSha };

  const created = await gh([
    'pr', 'create', '--repo', repository.nameWithOwner, '--head', remoteBranch,
    '--title', pullRequestTitle(input), '--body', pullRequestBody(input),
  ]);
  if (!created.ok) return outcome('PR_CREATE_FAILED', 'GitHub CLI could not create the pull request');
  const url = validPullRequestUrl(output(created), repository.nameWithOwner);
  if (!url) return outcome('PR_CREATE_RESPONSE_INVALID', 'GitHub CLI did not return a valid pull request URL');
  return { ok: true, attempted: true, status: 'created', url, branch, headSha };
}

module.exports = { createPullRequest, githubRepository, pullRequestBody };
