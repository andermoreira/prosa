'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { performance } = require('node:perf_hooks');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { createSandboxRunner, executableReadPaths, normalizeSandboxPolicy } = require('./lib/sandbox.cjs');

const MACOS = process.platform === 'darwin';
const HOMEBREW_GIT = '/opt/homebrew/bin/git';

function fixture() {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-srt-macos-'));
  fs.writeFileSync(path.join(target, '.env'), 'SECRET=blocked\n');
  fs.writeFileSync(path.join(target, '.env.staging'), 'SECRET=also-blocked\n');
  fs.writeFileSync(path.join(target, 'readable.txt'), 'readable\n');
  return fs.realpathSync(target);
}

function policy(target, role = 'executor') {
  return normalizeSandboxPolicy({
    role, resourceId: role === 'executor' ? 'probe-executor' : `probe-${role}`,
    target, readPaths: [target, ...executableReadPaths(process.execPath)], writePaths: role === 'executor' ? [target] : [], allowedDomains: [],
  });
}

async function invoke(target, role, source, args = []) {
  return createSandboxRunner()({
    policy: policy(target, role), executable: process.execPath, args: ['-e', source, ...args], env: {},
    timeoutMs: 10000, maxOutputBytes: 1024 * 1024,
  });
}

async function blocked(invocation, stderrPattern) {
  try {
    const result = await invocation;
    assert.equal(result.ok, false);
    assert.match(result.stderr.text, stderrPattern);
  } catch (error) {
    assert.equal(error.code, 'SANDBOX_VIOLATION');
  }
}

test('macOS sandbox-exec blocks sensitive reads and reviewer writes', { skip: !MACOS }, async () => {
  const target = fixture();
  try {
    const readable = await invoke(target, 'executor', "process.stdout.write(require('fs').readFileSync('readable.txt','utf8'))");
    assert.equal(readable.ok, true, readable.stderr.text);
    assert.equal(readable.stdout.text, 'readable\n');
    const isolatedHome = await invoke(target, 'executor', 'process.stdout.write(JSON.stringify({home:process.env.HOME,tmp:process.env.TMPDIR}))');
    assert.deepEqual(JSON.parse(isolatedHome.stdout.text), { home: path.join(target, '.workflow-sandbox'), tmp: path.join(target, '.workflow-sandbox') });
    assert.equal(fs.existsSync(path.join(target, '.workflow-sandbox')), false);
    await blocked(invoke(target, 'executor', "require('fs').readFileSync('.env','utf8')"), /EPERM|Operation not permitted/);
    await blocked(invoke(target, 'executor', "require('fs').readFileSync('.env.staging','utf8')"), /EPERM|Operation not permitted/);
    await blocked(invoke(target, 'executor', "require('fs').readFileSync('/etc/hosts','utf8')"), /EPERM|Operation not permitted/);
    for (const hostPath of ['/opt/homebrew/etc/pool.conf', '/opt/homebrew/var/log/php-fpm.log', '/usr/local/etc/odbc.ini']) {
      if (fs.existsSync(hostPath)) await blocked(invoke(target, 'executor', `require('fs').readFileSync(${JSON.stringify(hostPath)})`), /EPERM|Operation not permitted/);
    }
    await blocked(invoke(target, 'reviewer', "require('fs').writeFileSync('reviewer-write.txt','blocked')"), /EPERM|Operation not permitted/);
    const outsideWrite = `/private/tmp/claude/prosa-sandbox-${process.pid}`;
    await blocked(invoke(target, 'reviewer', `require('fs').writeFileSync(${JSON.stringify(outsideWrite)},'blocked')`), /EPERM|Operation not permitted|ENOENT/);
    assert.equal(fs.existsSync(path.join(target, 'reviewer-write.txt')), false);
    assert.equal(fs.existsSync(outsideWrite), false);
  } finally { fs.rmSync(target, { recursive: true, force: true }); }
});

// denyRead hides existing sensitive files; this proves the other half — the denyWrite globs stop a
// writable-area executor from *creating* a sensitive file (a fresh .env, secrets/, or key) to seed a
// future run. The review flagged these globs as unexercised: the control file confirms plain writes
// still pass, so the denial is the glob, not a broken writable area.
test('macOS sandbox-exec denies creating sensitive files in a writable area', { skip: !MACOS }, async () => {
  const target = fixture();
  try {
    for (const create of [
      "require('fs').writeFileSync('.env','x')",
      "require('fs').writeFileSync('.env.local','x')",
      "require('fs').mkdirSync('secrets')",
      "require('fs').writeFileSync('leak.pem','x')",
    ]) {
      await blocked(invoke(target, 'executor', create), /EPERM|Operation not permitted/);
    }
    const control = await invoke(target, 'executor', "require('fs').writeFileSync('normal.txt','ok')");
    assert.equal(control.ok, true, control.stderr.text);
    for (const name of ['.env.local', 'secrets', 'leak.pem']) {
      assert.equal(fs.existsSync(path.join(target, name)), false);
    }
    assert.equal(fs.existsSync(path.join(target, 'normal.txt')), true);
  } finally { fs.rmSync(target, { recursive: true, force: true }); }
});

// A path-based sandbox can be fooled by a hardlink: a second name inside allowRead pointing at an
// inode outside it. The link and the read share the target's filesystem so the link is a real
// hardlink, not a cross-device copy. The guarantee is that the outside secret never reaches the
// caller — whether the backend denies the link creation or the read through it.
test('macOS sandbox-exec denies a hardlink escape to a file outside allowRead', { skip: !MACOS }, async () => {
  const outsideDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-srt-outside-')));
  const secret = path.join(outsideDir, 'outside-secret.txt');
  fs.writeFileSync(secret, 'OUTSIDE-SECRET\n');
  const target = fixture();
  try {
    const source = `const fs = require('fs');
      try { fs.linkSync(${JSON.stringify(secret)}, 'aliased'); } catch (error) { console.error('LINK:' + error.code); process.exit(3); }
      try { process.stdout.write(fs.readFileSync('aliased', 'utf8')); } catch (error) { console.error('READ:' + error.code); process.exit(4); }`;
    let leaked = '';
    try {
      const result = await invoke(target, 'executor', source);
      assert.equal(result.ok, false);
      leaked = result.stdout.text || '';
    } catch (error) {
      assert.equal(error.code, 'SANDBOX_VIOLATION');
      leaked = error.details?.process?.stdout?.text || '';
    }
    assert.doesNotMatch(leaked, /OUTSIDE-SECRET/);
    assert.equal(fs.existsSync(secret), true);
  } finally {
    fs.rmSync(target, { recursive: true, force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
  }
});

test('macOS sandbox-exec blocks network and Unix sockets', { skip: !MACOS }, async () => {
  const target = fixture();
  const socketPath = path.join(target, 'host.sock');
  const server = net.createServer();
  try {
    await new Promise((resolve, reject) => server.listen(socketPath, resolve).once('error', reject));
    await blocked(invoke(target, 'executor', "require('https').get('https://example.com').on('error',error=>{console.error(error.message);process.exit(9)})"), /ENOTFOUND|blocked|not permitted/i);
    await blocked(invoke(target, 'executor', "require('net').createServer().on('error',error=>{console.error(error.message);process.exit(8)}).listen('probe.sock')"), /EPERM|Operation not permitted/);
    await blocked(invoke(target, 'executor', `require('net').createConnection(${JSON.stringify(socketPath)}).on('error',error=>{console.error(error.message);process.exit(7)})`), /EPERM|Operation not permitted/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('macOS sandbox wrapper preserves adversarial argv', { skip: !MACOS }, async () => {
  const target = fixture();
  try {
    const values = ['space value', '$(touch injected)', "'; exit 99; '"];
    const result = await invoke(target, 'executor', 'process.stdout.write(JSON.stringify(process.argv.slice(1)))', values);
    assert.deepEqual(JSON.parse(result.stdout.text), values);
    assert.equal(fs.existsSync(path.join(target, 'injected')), false);
  } finally { fs.rmSync(target, { recursive: true, force: true }); }
});

test('private Git facade keeps agent metadata writes out of the shared gitdir', { skip: !MACOS || !fs.existsSync(HOMEBREW_GIT) }, async () => {
  const target = fixture();
  try {
    fs.rmSync(path.join(target, '.env'));
    fs.rmSync(path.join(target, '.env.staging'));
    for (const args of [['init', '-q'], ['config', 'user.name', 'Smoke'], ['config', 'user.email', 'smoke@example.test'], ['add', '.'], ['commit', '-qm', 'fixture']]) {
      const result = spawnSync(HOMEBREW_GIT, args, { cwd: target, encoding: 'utf8', shell: false });
      assert.equal(result.status, 0, result.stderr);
    }
    const gitDirectory = path.join(target, '.git');
    const gitPolicy = {
      mode: 'private-ephemeral-v1', workTree: target,
      privateGitDir: path.join(target, '.workflow-sandbox', 'git'),
      objectDirectory: path.join(gitDirectory, 'objects'), sourceIndex: path.join(gitDirectory, 'index'),
      expectedHead: spawnSync(HOMEBREW_GIT, ['rev-parse', 'HEAD'], { cwd: target, encoding: 'utf8', shell: false }).stdout.trim(),
      configProfile: 'status-only-v1',
    };
    const normalized = normalizeSandboxPolicy({
      role: 'executor', resourceId: 'probe-executor', target, git: gitPolicy,
      readPaths: [target, ...executableReadPaths(HOMEBREW_GIT), ...executableReadPaths(process.execPath)], writePaths: [target], allowedDomains: [],
    });
    const runner = createSandboxRunner();
    const status = await runner({ policy: normalized, executable: fs.realpathSync(HOMEBREW_GIT), args: ['status', '--porcelain'], env: { PATH: `${path.dirname(fs.realpathSync(HOMEBREW_GIT))}:/usr/bin:/bin` }, timeoutMs: 10000, maxOutputBytes: 1024 * 1024 });
    assert.equal(status.ok, true, status.stderr.text);
    assert.equal(status.stdout.text, '');
    const metadataWrite = await runner({
      policy: normalized, executable: process.execPath,
      args: ['-e', "require('fs').mkdirSync(require('path').join(process.env.GIT_DIR,'opencode'))"],
      env: { PATH: '/usr/bin:/bin' }, timeoutMs: 10000, maxOutputBytes: 1024 * 1024,
    });
    assert.equal(metadataWrite.ok, true, metadataWrite.stderr.text);
    assert.equal(fs.existsSync(path.join(gitDirectory, 'opencode')), false);
    assert.equal(fs.existsSync(path.join(target, '.workflow-sandbox')), false);
  } finally { fs.rmSync(target, { recursive: true, force: true }); }
});

test('reports the optional 15-sample sandbox startup benchmark', { skip: !MACOS || process.env.RUN_SANDBOX_BENCHMARK !== '1' }, () => {
  const target = fixture();
  try {
    const srt = path.join(__dirname, '../../node_modules/.bin/srt');
    const settings = path.join(target, 'settings.json');
    fs.writeFileSync(settings, JSON.stringify({
      network: { allowedDomains: [], deniedDomains: [], allowUnixSockets: [], allowLocalBinding: false },
      filesystem: { denyRead: ['/Users'], allowRead: [target], allowWrite: [target], denyWrite: [] },
      enableWeakerNestedSandbox: false, enableWeakerNetworkIsolation: false, allowAppleEvents: false,
    }));
    const measure = (command, args) => {
      const started = performance.now();
      const result = spawnSync(command, args, { cwd: target, stdio: 'ignore' });
      assert.equal(result.status, 0);
      return performance.now() - started;
    };
    const median = (values) => values.sort((left, right) => left - right)[Math.floor(values.length / 2)];
    measure(process.execPath, ['-e', '']);
    measure(srt, ['--settings', settings, process.execPath, '-e', '']);
    const raw = Array.from({ length: 15 }, () => measure(process.execPath, ['-e', '']));
    const sandbox = Array.from({ length: 15 }, () => measure(srt, ['--settings', settings, process.execPath, '-e', '']));
    const rawMedianMs = median(raw);
    const sandboxMedianMs = median(sandbox);
    process.stdout.write(`${JSON.stringify({
      samples: 15, rawMedianMs, sandboxMedianMs,
      overheadMs: sandboxMedianMs - rawMedianMs,
      overheadPercent: ((sandboxMedianMs - rawMedianMs) / rawMedianMs) * 100,
    })}\n`);
  } finally { fs.rmSync(target, { recursive: true, force: true }); }
});
