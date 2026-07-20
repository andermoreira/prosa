'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const {
  loadCatalogsFromFilesystem,
  loadCatalogsFromGit,
  resolveGate,
  resolveResource,
  validateCatalogSources,
} = require('./lib/catalogs.cjs');
const { runProcess } = require('./lib/process.cjs');
const { gateExecutionLocation } = require('./lib/local-adapter.cjs');

const ROOT = path.resolve(__dirname, '../..');
const validSources = {
  gates: fs.readFileSync(path.join(ROOT, 'workflow/gates.yaml'), 'utf8'),
  resources: fs.readFileSync(path.join(ROOT, 'workflow/resources.yaml'), 'utf8'),
};

function temporaryDirectory(prefix) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  test.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function git(repo, args) {
  const result = spawnSync('git', args, { cwd: repo, encoding: 'utf8', shell: false });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test('loads and resolves the filesystem catalogs', () => {
  const catalog = loadCatalogsFromFilesystem(ROOT);
  assert.equal(catalog.ok, true, JSON.stringify(catalog.errors));
  assert.match(catalog.value.hashes.combined, /^[a-f0-9]{64}$/);
  assert.equal(resolveGate(catalog, 'specs-lint').value.executable, 'node');
  assert.equal(resolveResource(catalog, 'opencode-reviewer').value.readOnly, true);
  assert.deepEqual(resolveResource(catalog, 'opencode-reviewer').value.sandbox.networkDomains, ['opencode.ai']);
  assert.equal(resolveResource(catalog, 'cursor-cli').value.sandbox.version, '0.0.66');
  assert.equal(resolveGate(catalog, 'missing').errors[0].code, 'UNKNOWN_GATE_ID');
  assert.equal(resolveResource(catalog, 'missing').errors[0].code, 'UNKNOWN_RESOURCE_ID');
});

test('requires deny-first sandbox policies on agents', () => {
  const missing = validateCatalogSources({
    ...validSources,
    resources: validSources.resources.replace(/\n    sandbox: &opencode-executor-sandbox[\s\S]*?\n  - id: opencode-reviewer/, '\n  - id: opencode-reviewer'),
  }, { type: 'test' });
  assert.equal(missing.ok, false);

  const wildcard = validateCatalogSources({
    ...validSources,
    resources: validSources.resources.replace('networkDomains: [opencode.ai]', 'networkDomains: [*.opencode.ai]'),
  }, { type: 'test' });
  assert.equal(wildcard.ok, false);

  const broadReviewer = validateCatalogSources({
    ...validSources,
    resources: validSources.resources.replace('networkDomains: [opencode.ai]', 'networkDomains: [opencode.ai, registry.npmjs.org]'),
  }, { type: 'test' });
  assert.equal(broadReviewer.ok, false);
  assert.ok(broadReviewer.errors.some((error) => error.code === 'READ_ONLY_NETWORK_TOO_BROAD'));
});

test('accepts an asymmetric gate sandbox on tools and rejects network or non-tool placement', () => {
  const valid = validateCatalogSources(validSources, { type: 'test' });
  assert.equal(valid.ok, true, JSON.stringify(valid.errors));
  assert.deepEqual(resolveResource({ ok: true, value: valid.value }, 'node-runtime').value.gateSandbox.networkDomains, []);

  const withNetwork = validateCatalogSources({
    ...validSources,
    resources: validSources.resources.replace(
      /gateSandbox: &gate-sandbox\n      required: true\n      engine: "@anthropic-ai\/sandbox-runtime"\n      version: 0.0.66\n      networkDomains: \[\]/,
      'gateSandbox: &gate-sandbox\n      required: true\n      engine: "@anthropic-ai/sandbox-runtime"\n      version: 0.0.66\n      networkDomains: [opencode.ai]',
    ),
  }, { type: 'test' });
  assert.equal(withNetwork.ok, false);

  const onAgent = validateCatalogSources({
    ...validSources,
    resources: validSources.resources.replace(
      '    sandbox: &opencode-executor-sandbox',
      '    gateSandbox: {required: true, engine: "@anthropic-ai/sandbox-runtime", version: 0.0.66, networkDomains: [], allowUnixSockets: false, allowLocalBinding: false}\n    sandbox: &opencode-executor-sandbox',
    ),
  }, { type: 'test' });
  assert.equal(onAgent.ok, false);
  assert.ok(onAgent.errors.some((error) => error.code === 'GATE_SANDBOX_RESOURCE_INVALID'));
});

test('rejects duplicate IDs and unknown resource references', () => {
  const duplicate = validateCatalogSources({ ...validSources, gates: `${validSources.gates}\n  - id: specs-lint\n    resourceId: node-runtime\n    executable: node\n    args: []\n    cwd: repo-root\n    timeoutMs: 1\n    maxOutputBytes: 1\n    category: test\n` }, { type: 'test' });
  assert.equal(duplicate.ok, false);
  assert.ok(duplicate.errors.some((error) => error.code === 'DUPLICATE_GATE_ID'));

  const unknown = validateCatalogSources({ ...validSources, gates: validSources.gates.replace('resourceId: node-runtime', 'resourceId: unknown-runtime') }, { type: 'test' });
  assert.equal(unknown.ok, false);
  assert.ok(unknown.errors.some((error) => error.code === 'UNKNOWN_RESOURCE_ID'));
});

test('loads catalogs from the approved Git base and ignores worktree drift', async () => {
  const repo = temporaryDirectory('workflow-catalog-git-');
  fs.mkdirSync(path.join(repo, 'workflow'));
  fs.writeFileSync(path.join(repo, 'workflow/gates.yaml'), validSources.gates);
  fs.writeFileSync(path.join(repo, 'workflow/resources.yaml'), validSources.resources);
  git(repo, ['init', '-q']);
  git(repo, ['add', 'workflow']);
  git(repo, ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'catalogs']);
  const baseSha = git(repo, ['rev-parse', 'HEAD']);
  fs.writeFileSync(path.join(repo, 'workflow/gates.yaml'), validSources.gates.replace('specs-lint', 'tampered-gate'));

  const catalog = await loadCatalogsFromGit(repo, baseSha);
  assert.equal(catalog.ok, true, JSON.stringify(catalog.errors));
  assert.equal(catalog.value.origin.baseSha, baseSha);
  assert.equal(resolveGate(catalog, 'specs-lint').ok, true);
  assert.equal(resolveGate(catalog, 'tampered-gate').ok, false);
  assert.equal((await loadCatalogsFromGit(repo, '--help')).errors[0].code, 'INVALID_BASE_SHA');
});

test('passes injection text as one argv value without invoking a shell', async () => {
  const root = temporaryDirectory('workflow-process-injection-');
  const marker = path.join(root, 'injected');
  const payload = `value; touch ${marker}`;
  const result = await runProcess({
    executable: process.execPath,
    args: ['-e', 'process.stdout.write(process.argv[1])', payload],
    root,
    cwd: '.',
    envAllowlist: [],
    timeoutMs: 5000,
    maxOutputBytes: 4096,
  });
  assert.equal(result.ok, true);
  assert.equal(result.stdout.text, payload);
  assert.equal(fs.existsSync(marker), false);
});

test('rejects traversal and symlink cwd escapes before spawn', async () => {
  const parent = temporaryDirectory('workflow-process-cwd-');
  const root = path.join(parent, 'root');
  const outside = path.join(parent, 'outside');
  fs.mkdirSync(root);
  fs.mkdirSync(outside);
  fs.symlinkSync(outside, path.join(root, 'escape'));

  for (const cwd of ['..', 'escape']) {
    const result = await runProcess({ executable: process.execPath, args: ['-e', 'process.exit(0)'], root, cwd, envAllowlist: [] });
    assert.equal(result.status, 'spawn_error');
    assert.equal(result.error.code, 'CWD_OUTSIDE_ROOT');
  }
});

test('times out and returns bounded structured output', async () => {
  const root = temporaryDirectory('workflow-process-limits-');
  const timedOut = await runProcess({
    executable: process.execPath,
    args: ['-e', 'setTimeout(() => {}, 10000)'],
    root,
    cwd: '.',
    envAllowlist: [],
    timeoutMs: 50,
    maxOutputBytes: 4096,
  });
  assert.equal(timedOut.status, 'timed_out');
  assert.equal(timedOut.timedOut, true);

  const limited = await runProcess({
    executable: process.execPath,
    args: ['-e', 'process.stdout.write("x".repeat(100000))'],
    root,
    cwd: '.',
    envAllowlist: [],
    timeoutMs: 5000,
    maxOutputBytes: 128,
  });
  assert.equal(limited.status, 'output_limit');
  assert.equal(limited.outputLimitExceeded, true);
  assert.equal(Buffer.byteLength(limited.stdout.text), 128);
  assert.equal(limited.stdout.truncated, true);
});

test('inherits only allowlisted environment variables', async () => {
  const root = temporaryDirectory('workflow-process-env-');
  process.env.WORKFLOW_SECRET_TEST = 'must-not-leak';
  test.after(() => delete process.env.WORKFLOW_SECRET_TEST);
  const result = await runProcess({
    executable: process.execPath,
    args: ['-e', 'process.stdout.write(String(process.env.WORKFLOW_SECRET_TEST))'],
    root,
    cwd: '.',
    envAllowlist: [],
    timeoutMs: 5000,
    maxOutputBytes: 4096,
  });
  assert.equal(result.ok, true);
  assert.equal(result.stdout.text, 'undefined');
});

test('captures EPIPE when a child closes stdin before consuming the payload', async () => {
  const root = temporaryDirectory('workflow-process-epipe-');
  const result = await runProcess({
    executable: process.execPath,
    args: ['-e', 'process.stdin.destroy(); setTimeout(() => process.exit(0), 100)'],
    input: 'x'.repeat(8 * 1024 * 1024),
    root,
    cwd: '.',
    envAllowlist: [],
    timeoutMs: 5000,
    maxOutputBytes: 4096,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'spawn_error');
  assert.equal(result.error.code, 'EPIPE');
});

test('resolves both gate cwd policies against the execution worktree and rejects the mutable main checkout', () => {
  const parent = temporaryDirectory('workflow-gate-cwd-');
  const main = path.join(parent, 'main');
  const worktree = path.join(parent, 'worktree');
  fs.mkdirSync(main);
  fs.mkdirSync(worktree);
  for (const cwd of ['repo-root', 'worktree-root']) {
    assert.deepEqual(gateExecutionLocation({ cwd }, worktree, main, true), { root: fs.realpathSync(worktree), cwd: '.', policy: cwd });
  }
  assert.throws(() => gateExecutionLocation({ cwd: 'repo-root' }, main, main, true), { code: 'GATE_WORKTREE_REQUIRED' });
});
