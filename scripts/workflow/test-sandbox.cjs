'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createSandboxRunner, normalizeSandboxPolicy, serializeCommand } = require('./lib/sandbox.cjs');

const macosTest = process.platform === 'darwin' ? test : test.skip;

function fixture() {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-sandbox-'));
  fs.writeFileSync(path.join(target, '.env'), 'SECRET=value\n');
  fs.writeFileSync(path.join(target, '.env.staging'), 'SECRET=staging\n');
  fs.mkdirSync(path.join(target, 'src'));
  return target;
}

function manager(overrides = {}) {
  const store = {
    getTotalCount: () => 0,
    getViolations: () => [],
  };
  return {
    isSupportedPlatform: () => true,
    initialize: async () => {},
    isSandboxingEnabled: () => true,
    getSandboxViolationStore: () => store,
    wrapWithSandboxArgv: async (command) => ({ argv: ['/bin/sh', '-c', `env 'HTTP_PROXY=http://srt:token@localhost:1' ${command}`], env: { PATH: '/usr/bin', HTTP_PROXY: 'http://localhost:1', SECRET: 'drop' } }),
    cleanupAfterCommand: () => {},
    reset: async () => {},
    ...overrides,
  };
}

function policy(target, role = 'executor') {
  return {
    role,
    resourceId: role === 'executor' ? 'opencode' : `opencode-${role}`,
    target,
    readPaths: [target],
    writePaths: role === 'executor' ? [path.join(target, 'src')] : [],
    allowedDomains: ['api.opencode.ai'],
  };
}

macosTest('normalizes a role policy and denies sensitive files inside the target', () => {
  const target = fixture();
  try {
    const value = normalizeSandboxPolicy(policy(target));
    assert.equal(value.engine.version, '0.0.66');
    assert.ok(value.filesystem.denyRead.includes(path.join(fs.realpathSync(target), '.env')));
    assert.ok(value.filesystem.denyRead.includes(path.join(fs.realpathSync(target), '.env.staging')));
    assert.match(value.policyHash, /^[0-9a-f]{64}$/);
    assert.throws(() => normalizeSandboxPolicy({ ...policy(target, 'reviewer'), writePaths: [target] }), { code: 'SANDBOX_POLICY_INVALID' });
    assert.throws(() => normalizeSandboxPolicy({ ...policy(target), allowedDomains: ['*.example.com'] }), { code: 'SANDBOX_POLICY_INVALID' });
  } finally { fs.rmSync(target, { recursive: true, force: true }); }
});

macosTest('the gate role is broad-read, write-confined, and network-free', () => {
  const target = fixture();
  try {
    const value = normalizeSandboxPolicy({
      role: 'gate', resourceId: 'node-runtime', target,
      readPaths: [target], writePaths: [path.join(target, 'src')], allowedDomains: [],
    });
    assert.equal(value.role, 'gate');
    // Broad read: the aggressive sensitive-file denyRead the agent carries is absent by design.
    assert.deepEqual(value.filesystem.denyRead, []);
    assert.deepEqual(value.network.allowedDomains, []);
    assert.ok(value.filesystem.writePaths.every((entry) => entry.startsWith(fs.realpathSync(target))));
    assert.match(value.policyHash, /^[0-9a-f]{64}$/);
    // A gate must not open any network domain, and its writes must stay inside the worktree.
    assert.throws(() => normalizeSandboxPolicy({ role: 'gate', resourceId: 'node-runtime', target, readPaths: [target], writePaths: [], allowedDomains: ['opencode.ai'] }), { code: 'SANDBOX_POLICY_INVALID' });
    assert.throws(() => normalizeSandboxPolicy({ role: 'gate', resourceId: 'node-runtime', target, readPaths: [target], writePaths: ['/etc'], allowedDomains: [] }), { code: 'SANDBOX_POLICY_INVALID' });
  } finally { fs.rmSync(target, { recursive: true, force: true }); }
});

test('serializer preserves argv as quoted data', () => {
  const command = serializeCommand('node', ['-e', 'process.stdout.write(JSON.stringify(process.argv.slice(1)))', '', 'space value', '$(touch injected)', "'; exit 99; '"]);
  const result = require('node:child_process').spawnSync('/bin/sh', ['-c', command], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.deepEqual(JSON.parse(result.stdout), ['', 'space value', '$(touch injected)', "'; exit 99; '"]);
});

macosTest('runner uses wrapped argv with a filtered environment and returns sandbox evidence', async () => {
  const target = fixture();
  const calls = [];
  try {
    const run = createSandboxRunner({
      loadManager: async () => manager(),
      runProcess: async (input) => {
        calls.push(input);
        return { ok: true, status: 'succeeded', stdout: { text: '', bytes: 0 }, stderr: { text: '', bytes: 0 } };
      },
    });
    const result = await run({ policy: policy(target), executable: 'node', args: ['--version'], env: { PATH: '/usr/bin', OPENCODE_CONFIG_CONTENT: '{"permission":"deny"}' } });
    assert.equal(calls[0].executable, '/bin/sh');
    assert.equal(calls[0].env.SECRET, undefined);
    assert.equal(calls[0].env.HTTP_PROXY, 'http://127.0.0.1:1/');
    assert.equal(calls[0].env.OPENCODE_CONFIG_CONTENT, '{"permission":"deny"}');
    assert.match(calls[0].args[1], /HTTP_PROXY=http:\/\/srt:token@127\.0\.0\.1:1/);
    assert.match(result.sandbox.policyHash, /^[0-9a-f]{64}$/);
  } finally { fs.rmSync(target, { recursive: true, force: true }); }
});

macosTest('runner classifies every bounded bootstrap probe before reporting a violation', async () => {
  const target = fixture();
  let countReads = 0;
  let requestedLimit = 0;
  const probes = [
    { line: 'node(123) deny(1) file-read-metadata /etc' },
    { line: 'node(123) deny(1) file-write-create /Users/test/.local/share/cursor-agent/versions/2026.07.16/.running/123' },
    { line: 'node(123) deny(1) mach-lookup com.apple.SystemConfiguration.DNSConfiguration' },
    { line: 'git(123) deny(1) mach-lookup com.apple.dt.CommandLineTools.installondemand' },
    { line: 'python3(123) deny(1) mach-lookup com.apple.dt.CommandLineTools.installondemand' },
    { line: `node(123) deny(1) file-read-data ${path.join(path.dirname(fs.realpathSync(target)), '.cursorignore')}` },
    ...Array.from({ length: 124 }, () => ({ line: 'opencode(123) deny(1) sysctl-read kern.iossupportversion' })),
  ];
  try {
    const run = createSandboxRunner({
      loadManager: async () => manager({
        getSandboxViolationStore: () => ({
          getTotalCount: () => (countReads++ === 0 ? 0 : probes.length),
          getViolations: (limit) => {
            requestedLimit = limit;
            return probes.slice(0, limit);
          },
        }),
      }),
      runProcess: async () => ({ ok: false, status: 'failed', stdout: { text: '' }, stderr: { text: '' } }),
    });
    const result = await run({ policy: policy(target), executable: 'node' });
    assert.equal(result.ok, false);
    assert.equal(requestedLimit, probes.length);
  } finally { fs.rmSync(target, { recursive: true, force: true }); }
});

macosTest('runner restores a closed reviewer target after scratch cleanup', async () => {
  const target = fixture();
  fs.chmodSync(target, 0o500);
  try {
    const run = createSandboxRunner({
      loadManager: async () => manager(),
      runProcess: async () => ({ ok: true, status: 'succeeded', stdout: { text: '', bytes: 0 }, stderr: { text: '', bytes: 0 } }),
    });
    await run({ policy: policy(target, 'reviewer'), executable: 'node' });
    assert.equal(fs.statSync(target).mode & 0o777, 0o500);
    assert.equal(fs.existsSync(path.join(target, '.workflow-sandbox')), false);
  } finally {
    fs.chmodSync(target, 0o700);
    fs.rmSync(target, { recursive: true, force: true });
  }
});

macosTest('runtime absence, degraded mode, violations, and cleanup fail closed', async () => {
  const target = fixture();
  const processRunner = async () => ({ ok: true });
  try {
    await assert.rejects(createSandboxRunner({ loadManager: async () => { throw new Error('missing'); }, runProcess: processRunner })({ policy: policy(target), executable: 'node' }), { code: 'SANDBOX_RUNTIME_UNAVAILABLE' });
    await assert.rejects(createSandboxRunner({ loadManager: async () => manager({ isSandboxingEnabled: () => false }), runProcess: processRunner })({ policy: policy(target), executable: 'node' }), { code: 'SANDBOX_DEGRADED' });
    let violationCount = 0;
    await assert.rejects(createSandboxRunner({ loadManager: async () => manager({
      getSandboxViolationStore: () => ({ getTotalCount: () => violationCount++, getViolations: () => [{ operation: 'deny' }] }),
    }), runProcess: async () => ({ ok: false, status: 'failed', stdout: { text: '' }, stderr: { text: 'EPERM TOKEN=secret' } }) })({ policy: policy(target), executable: 'node' }), (error) => {
      assert.equal(error.code, 'SANDBOX_VIOLATION');
      assert.match(error.details.process.stderr.text, /EPERM/);
      assert.doesNotMatch(error.details.process.stderr.text, /secret/);
      return true;
    });
    let spawns = 0;
    const poisoned = createSandboxRunner({
      loadManager: async () => manager({ reset: async () => { throw new Error('busy ghp_AAAAAAAAAAAAAAAAAAAAAAAA'); } }),
      runProcess: async () => { spawns += 1; return processRunner(); },
    });
    await assert.rejects(poisoned({ policy: policy(target), executable: 'node' }), (error) => {
      assert.equal(error.code, 'SANDBOX_CLEANUP_FAILED');
      assert.equal(error.details.cause.includes('ghp_'), false);
      return true;
    });
    await assert.rejects(poisoned({ policy: policy(target), executable: 'node' }), { code: 'SANDBOX_CLEANUP_FAILED' });
    assert.equal(spawns, 1, 'a poisoned runner must not spawn again');
  } finally { fs.rmSync(target, { recursive: true, force: true }); }
});

test('unsupported platforms reject the macOS sandbox policy fail closed', { skip: process.platform === 'darwin' }, () => {
  const target = fixture();
  try {
    assert.throws(() => normalizeSandboxPolicy(policy(target)), { code: 'SANDBOX_RUNTIME_UNAVAILABLE' });
  } finally { fs.rmSync(target, { recursive: true, force: true }); }
});
