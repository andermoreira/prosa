'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { runProcess } = require('./process.cjs');
const { sanitize } = require('./sanitize.cjs');

const ENGINE_NAME = '@anthropic-ai/sandbox-runtime';
const ENGINE_VERSION = '0.0.66';
const SRT_ENV_NAMES = Object.freeze([
  'SANDBOX_RUNTIME',
  'ALL_PROXY', 'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY',
  'all_proxy', 'https_proxy', 'http_proxy', 'no_proxy',
  'CARGO_HTTP_CAINFO', 'CURL_CA_BUNDLE', 'GIT_SSL_CAINFO', 'NODE_EXTRA_CA_CERTS',
  'NPM_CONFIG_CAFILE', 'PIP_CERT', 'REQUESTS_CA_BUNDLE', 'SSL_CERT_FILE',
]);
const SENSITIVE_NAMES = Object.freeze([
  '.env', '.env.local', '.env.development', '.env.production', '.env.test',
  '.netrc', '.npmrc', 'credentials.json',
]);
const SENSITIVE_DIRECTORIES = Object.freeze(['.aws', '.docker', '.gnupg', '.ssh', 'credentials', 'secrets']);
const SENSITIVE_EXTENSIONS = Object.freeze(['.key', '.pem', '.p12', '.pfx']);

function sandboxError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.classification = 'trust-boundary';
  error.details = details;
  return error;
}

function assertString(value, name) {
  if (typeof value !== 'string' || value.trim() === '' || value.includes('\0')) {
    throw sandboxError('SANDBOX_POLICY_INVALID', `${name} must be a non-empty string without NUL bytes`);
  }
  return value;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function policyHash(policy) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(policy))).digest('hex');
}

function canonicalPath(value, target, options = {}) {
  assertString(value, 'sandbox path');
  const absolute = path.isAbsolute(value) ? path.resolve(value) : path.resolve(target, value);
  let existing = absolute;
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) throw sandboxError('SANDBOX_POLICY_INVALID', `Sandbox path has no existing ancestor: ${value}`);
    existing = parent;
  }
  const realExisting = fs.realpathSync(existing);
  const resolved = path.join(realExisting, path.relative(existing, absolute));
  if (options.withinTarget) {
    const relative = path.relative(target, resolved);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw sandboxError('SANDBOX_POLICY_INVALID', `Writable path escapes sandbox target: ${value}`);
    }
  }
  if (fs.existsSync(absolute) && fs.lstatSync(absolute).isSymbolicLink()) {
    if (options.withinTarget) throw sandboxError('SANDBOX_POLICY_INVALID', `Writable sandbox paths must not be symbolic links: ${value}`);
    return absolute;
  }
  return resolved;
}

function normalizeDomains(domains) {
  if (!Array.isArray(domains)) throw sandboxError('SANDBOX_POLICY_INVALID', 'allowedDomains must be an array');
  const normalized = domains.map((domain) => assertString(domain, 'allowed domain').toLowerCase());
  if (normalized.some((domain) => domain.includes('*') || domain.includes('/') || domain.includes(':'))) {
    throw sandboxError('SANDBOX_POLICY_INVALID', 'Sandbox domains must be exact hostnames without wildcard, scheme, port, or path');
  }
  if (new Set(normalized).size !== normalized.length) throw sandboxError('SANDBOX_POLICY_INVALID', 'Sandbox domains must be unique');
  return normalized.sort();
}

function normalizeGitPolicy(input, target) {
  if (input == null) return null;
  if (input.mode !== 'private-ephemeral-v1' || input.configProfile !== 'status-only-v1') {
    throw sandboxError('SANDBOX_POLICY_INVALID', 'Sandbox Git facade mode is unsupported');
  }
  const workTree = canonicalPath(input.workTree, target);
  const privateGitDir = canonicalPath(input.privateGitDir, target, { withinTarget: true });
  const objectDirectory = canonicalPath(input.objectDirectory, target);
  const sourceIndex = canonicalPath(input.sourceIndex, target);
  if (workTree !== target || privateGitDir !== path.join(target, '.workflow-sandbox', 'git')) {
    throw sandboxError('SANDBOX_POLICY_INVALID', 'Sandbox Git facade paths do not match the target');
  }
  if (!fs.statSync(objectDirectory).isDirectory() || !fs.statSync(sourceIndex).isFile()) {
    throw sandboxError('SANDBOX_POLICY_INVALID', 'Sandbox Git facade sources are invalid');
  }
  if (!/^[0-9a-f]{40,64}$/.test(input.expectedHead || '')
    || [workTree, privateGitDir, objectDirectory, sourceIndex].some((entry) => /[\r\n]/.test(entry))) {
    throw sandboxError('SANDBOX_POLICY_INVALID', 'Sandbox Git facade identity is invalid');
  }
  return {
    mode: input.mode, workTree, privateGitDir, objectDirectory, sourceIndex,
    expectedHead: input.expectedHead, configProfile: input.configProfile,
  };
}

// The gate role is deliberately asymmetric to the agent roles (ADR 028). An agent must not read
// secrets, so it carries an aggressive denyRead and pays the violation-suppression cost. A gate runs
// worktree code whose danger is *output*, not *reading*: with no network and writes confined to the
// worktree, reading a local secret is contained (it cannot leave, and anything written lands in the
// reviewed diff). So the gate gets broad read — no sensitive denyRead — which also keeps the
// suppression list small. Valid only under the single-user threat model; CI reopens the decision.
const ROLES_WITH_WRITE = new Set(['executor', 'gate']);

function normalizeSandboxPolicy(input) {
  if (!input || !['executor', 'reviewer', 'diagnostician', 'gate'].includes(input.role)) {
    throw sandboxError('SANDBOX_POLICY_INVALID', 'Sandbox role must be executor, reviewer, diagnostician, or gate');
  }
  if (process.platform !== 'darwin') {
    throw sandboxError('SANDBOX_RUNTIME_UNAVAILABLE', `Sandbox backend is not approved on platform: ${process.platform}`);
  }
  const isGate = input.role === 'gate';
  const target = fs.realpathSync(assertString(input.target, 'sandbox target'));
  const git = normalizeGitPolicy(input.git, target);
  const shellReadPaths = [...executableReadPaths('/bin/bash'), '/usr/bin/env'];
  const gitReadPaths = git ? [git.objectDirectory] : [];
  const readPaths = [...new Set([...shellReadPaths, ...gitReadPaths, ...(input.readPaths || [target]).map((entry) => canonicalPath(entry, target))])].sort();
  const declaredWritePaths = [...new Set((input.writePaths || []).map((entry) => canonicalPath(entry, target, { withinTarget: true })))].sort();
  if (!ROLES_WITH_WRITE.has(input.role) && declaredWritePaths.length > 0) {
    throw sandboxError('SANDBOX_POLICY_INVALID', `${input.role} sandbox policy must not allow writes`);
  }
  const allowedDomains = normalizeDomains(input.allowedDomains || []);
  if (isGate && allowedDomains.length > 0) {
    throw sandboxError('SANDBOX_POLICY_INVALID', 'Gate sandbox policy must not allow any network domain');
  }
  const runtimePath = canonicalPath(path.join(target, '.workflow-sandbox'), target, { withinTarget: true });
  const writePaths = [...new Set([...declaredWritePaths, runtimePath])].sort();
  const policy = {
    policyVersion: '2',
    engine: { name: ENGINE_NAME, version: ENGINE_VERSION, backend: 'sandbox-exec', platform: 'darwin' },
    role: input.role,
    resourceId: assertString(input.resourceId, 'resourceId'),
    filesystem: {
      target,
      readPaths,
      writePaths,
      // Broad read for the gate: contain output, not input (ADR 028).
      denyRead: isGate ? [] : sensitivePaths(target),
      denyWrite: [
        '/tmp/claude', '/private/tmp/claude',
        path.join(osHome(), '.npm/_logs'), path.join(osHome(), '.claude/debug'),
        // The sensitive-write globs stop an agent from creating a secret to seed a diff; a gate
        // produces no diff, so it keeps only the fixed external denials — writes are already confined
        // to the worktree by the allowWrite allowlist.
        ...(isGate ? [] : sensitiveWritePatterns(target)),
      ].sort(),
    },
    network: { mode: 'allowlist', allowedDomains },
    unixSockets: [],
    git,
  };
  return Object.freeze({ ...policy, policyHash: policyHash(policy) });
}

function effectivePolicy(input) {
  if (input?.policyVersion === '2') {
    const { policyHash: embeddedHash, ...hashable } = input;
    if (embeddedHash !== policyHash(hashable)) throw sandboxError('SANDBOX_POLICY_INVALID', 'Normalized sandbox policy hash is invalid');
    if (input.engine?.name !== ENGINE_NAME || input.engine?.version !== ENGINE_VERSION
      || input.engine?.backend !== 'sandbox-exec' || input.engine?.platform !== 'darwin') {
      throw sandboxError('SANDBOX_POLICY_INVALID', 'Normalized sandbox policy engine is unsupported');
    }
    return input;
  }
  return normalizeSandboxPolicy(input);
}

function sensitivePath(statPath, name) {
  return name === '.env' || name.startsWith('.env.') || SENSITIVE_NAMES.includes(name)
    || SENSITIVE_DIRECTORIES.includes(name)
    || SENSITIVE_EXTENSIONS.some((extension) => name.endsWith(extension));
}

function sensitivePaths(target) {
  const paths = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (sensitivePath(entryPath, entry.name)) {
        paths.push(entryPath);
        continue;
      }
      if (entry.isDirectory() && !entry.isSymbolicLink()) visit(entryPath);
    }
  };
  visit(target);
  return paths.sort();
}

function sensitiveWritePatterns(target) {
  return [
    path.join(target, '**', '.env.*'),
    ...SENSITIVE_NAMES.map((name) => path.join(target, '**', name)),
    ...SENSITIVE_DIRECTORIES.map((name) => path.join(target, '**', name)),
    ...SENSITIVE_EXTENSIONS.map((extension) => path.join(target, '**', `*${extension}`)),
  ].sort();
}

function quoteArgument(value) {
  if (typeof value !== 'string' || value.includes('\0')) throw sandboxError('SANDBOX_POLICY_INVALID', 'Command arguments must be strings without NUL bytes');
  if (value === '') return "''";
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function serializeCommand(executable, args) {
  assertString(executable, 'executable');
  if (!Array.isArray(args)) throw sandboxError('SANDBOX_POLICY_INVALID', 'args must be an array');
  return [executable, ...args].map(quoteArgument).join(' ');
}

function runtimeConfig(policy) {
  return {
    network: {
      allowedDomains: policy.network.allowedDomains,
      deniedDomains: [],
      allowUnixSockets: [],
      allowAllUnixSockets: false,
      allowLocalBinding: false,
    },
    filesystem: {
      denyRead: ['/'],
      allowRead: policy.filesystem.readPaths,
      allowWrite: policy.filesystem.writePaths,
      denyWrite: policy.filesystem.denyWrite,
    },
    credentials: {
      files: policy.filesystem.denyRead.map((filePath) => ({ path: filePath, mode: 'deny' })),
    },
    ignoreViolations: {},
    enableWeakerNestedSandbox: false,
    enableWeakerNetworkIsolation: false,
    allowAppleEvents: false,
  };
}

function osHome() {
  return process.env.HOME && path.isAbsolute(process.env.HOME) ? process.env.HOME : '/Users/invalid';
}

function canonicalizeProxyLoopback(value) {
  return String(value).replace(
    /((?:ALL_PROXY|HTTPS_PROXY|HTTP_PROXY|all_proxy|https_proxy|http_proxy)=(?:https?|socks5h?):\/\/(?:[^@\s'"]+@)?)localhost(?=:\d+)/g,
    (_match, prefix) => `${prefix}127.0.0.1`,
  );
}

function sandboxEnvironment(baseEnvironment, sandboxEnvironmentValue) {
  const result = {};
  for (const name of Object.keys(baseEnvironment || {})) {
    if (!name.startsWith('SANDBOX_')) result[name] = baseEnvironment[name];
  }
  for (const name of SRT_ENV_NAMES) {
    if (Object.hasOwn(sandboxEnvironmentValue, name)) {
      let value = sandboxEnvironmentValue[name];
      if (/^(?:ALL|HTTPS?|all|https?)_PROXY$/.test(name)) {
        try {
          const proxy = new URL(value);
          if (proxy.hostname === 'localhost') {
            proxy.hostname = '127.0.0.1';
            value = proxy.toString();
          }
        } catch { /* the runtime owns proxy validation */ }
      }
      result[name] = value;
    }
  }
  result.HOME = baseEnvironment.SANDBOX_HOME || '/nonexistent';
  result.TMPDIR = baseEnvironment.SANDBOX_TMPDIR || result.HOME;
  return result;
}

function resolveExecutable(executable) {
  assertString(executable, 'executable');
  const directories = (process.env.PATH || '').split(path.delimiter);
  if (!path.isAbsolute(executable) && directories.some((directory) => !directory || !path.isAbsolute(directory))) {
    throw sandboxError('SANDBOX_RUNTIME_UNAVAILABLE', 'PATH must contain only absolute non-empty directories');
  }
  const candidates = path.isAbsolute(executable) ? [executable] : directories.map((directory) => path.join(directory, executable));
  const selected = candidates.find((candidate) => {
    try { fs.accessSync(candidate, fs.constants.X_OK); return true; }
    catch { return false; }
  });
  if (!selected) throw sandboxError('SANDBOX_RUNTIME_UNAVAILABLE', `Agent executable is not available: ${executable}`);
  return fs.realpathSync(selected);
}

function executableReadPaths(executable) {
  const selected = resolveExecutable(executable);
  const symlinkAncestors = (candidate) => {
    const entries = [];
    let current = path.parse(candidate).root;
    for (const segment of path.resolve(candidate).slice(current.length).split(path.sep)) {
      current = path.join(current, segment);
      if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) entries.push(current);
    }
    return entries;
  };
  const resolved = selected;
  const paths = [path.resolve(selected), resolved, path.dirname(resolved), ...symlinkAncestors(selected)];
  const executableDirectory = path.dirname(resolved);
  const queue = [resolved];
  const visited = new Set();
  while (queue.length > 0) {
    const binary = queue.shift();
    if (visited.has(binary)) continue;
    visited.add(binary);
    const loadCommands = spawnSync('/usr/bin/otool', ['-l', binary], { encoding: 'utf8', shell: false });
    const rpaths = loadCommands.status === 0
      ? [...loadCommands.stdout.matchAll(/^\s*path\s+(\S+)\s+\(offset/mg)].map((match) => match[1])
      : [];
    const result = spawnSync('/usr/bin/otool', ['-L', binary], { encoding: 'utf8', shell: false });
    if (result.status !== 0) continue;
    for (const line of result.stdout.split(/\r?\n/).slice(1)) {
      const dependency = line.trim().split(/\s+\(/, 1)[0];
      const expand = (candidate) => candidate
        .replace('@loader_path', path.dirname(binary))
        .replace('@executable_path', executableDirectory);
      const dependencyCandidates = dependency?.startsWith('@rpath/')
        ? rpaths.map((rpath) => path.join(expand(rpath), dependency.slice(7)))
        : [expand(dependency || '')];
      for (const candidate of dependencyCandidates) {
        if (!candidate.startsWith('/') || !fs.existsSync(candidate)) continue;
        const realCandidate = fs.realpathSync(candidate);
        paths.push(path.resolve(candidate), realCandidate, path.dirname(realCandidate), ...symlinkAncestors(candidate));
        if (!visited.has(realCandidate)) queue.push(realCandidate);
      }
    }
  }
  const opensslConfig = '/opt/homebrew/etc/openssl@3/openssl.cnf';
  if (paths.some((entry) => entry.includes('/openssl@3/')) && fs.existsSync(opensslConfig)) paths.push(opensslConfig);
  const gitConfig = '/opt/homebrew/etc/gitconfig';
  if (path.basename(resolved) === 'git' && fs.existsSync(gitConfig)) paths.push(gitConfig);
  const gitEncodingData = '/usr/share/i18n';
  if (path.basename(resolved) === 'git' && fs.existsSync(gitEncodingData)) paths.push(gitEncodingData);
  const icuData = '/usr/share/icu/icudt78l.dat';
  if (path.basename(resolved) === 'opencode' && fs.existsSync(icuData)) paths.push(icuData);
  if (path.basename(resolved) === 'cursor-agent') {
    for (const helper of ['/usr/bin/basename', '/usr/bin/dirname', '/usr/bin/realpath', '/usr/bin/readlink']) {
      if (fs.existsSync(helper)) paths.push(...executableReadPaths(helper));
    }
    if (fs.existsSync('/bin/zsh')) paths.push(...executableReadPaths('/bin/zsh'));
    for (const runtimePath of ['/dev/null', '/dev/random', '/dev/urandom', '/usr/lib/zsh', '/System/Library/OpenSSL/openssl.cnf', '/Library/Preferences/com.apple.networkd.plist', '/System/Library/Frameworks/Security.framework']) {
      if (fs.existsSync(runtimePath)) paths.push(runtimePath);
    }
  }
  for (const systemPath of ['/Library/Preferences/com.apple.security.plist', '/System/Library/Frameworks/Security.framework/Resources']) {
    if (['opencode', 'cursor-agent'].includes(path.basename(resolved)) && fs.existsSync(systemPath)) paths.push(systemPath, ...symlinkAncestors(systemPath));
  }
  return [...new Set(paths)].sort();
}

function boundedOutput(value) {
  const clean = sanitize(String(value || ''), { maxBytes: 4096 });
  return { text: clean.content, truncated: clean.truncated };
}

function violationDetails(violations, totalCount, result) {
  const uniqueViolations = [...new Map(violations.map((violation) => [violation?.line || JSON.stringify(violation), violation])).values()];
  return {
    totalCount,
    actionableCount: violations.length,
    violations: uniqueViolations.slice(0, 5).map((violation) => {
      const clean = sanitize(violation, { maxBytes: 2048 });
      return clean.truncated ? { truncated: true } : JSON.parse(clean.content);
    }),
    process: result ? {
      status: result.status,
      stdout: boundedOutput(result.stdout?.text),
      stderr: boundedOutput(result.stderr?.text),
    } : null,
  };
}

function actionableViolations(violations, policy) {
  return violations.filter((violation) => {
    const line = String(violation?.line || '');
    const ancestorProbe = line.match(/^(?:opencode|git)\(\d+\) deny\(1\) file-read-data (\/.*)$/);
    if (ancestorProbe) {
      const relative = path.relative(ancestorProbe[1], policy.filesystem.target);
      if (relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) return false;
    }
    const packageProbe = line.match(/^opencode\(\d+\) deny\(1\) file-read-metadata (\/.*\/package\.json)$/);
    if (packageProbe) {
      const relative = path.relative(path.dirname(packageProbe[1]), policy.filesystem.target);
      if (relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) return false;
    }
    const rgProbe = line.match(/^rg\(\d+\) deny\(1\) file-read-(?:data|metadata) (\/.*)$/);
    if (rgProbe && policy.git) {
      const sharedGitDir = path.dirname(policy.git.objectDirectory);
      const expectedDeniedProbes = new Set([
        path.join(path.dirname(sharedGitDir), '.gitignore'),
        path.join(sharedGitDir, 'info', 'exclude'),
        path.join(path.dirname(policy.git.sourceIndex), 'commondir'),
      ]);
      if (expectedDeniedProbes.has(rgProbe[1])) return false;
    }
    const cursorIgnoreProbe = line.match(/^node\(\d+\) deny\(1\) file-read-data (\/.*\/\.(?:cursorignore|cursorindexingignore))$/);
    if (cursorIgnoreProbe) {
      const relative = path.relative(path.dirname(cursorIgnoreProbe[1]), policy.filesystem.target);
      if (relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) return false;
    }
    return !/ deny\(\d+\) sysctl-read kern\.iossupportversion$/.test(line)
      && !line.endsWith(' file-read-data /dev/tty')
      && !line.endsWith(' file-read-data /dev/dtracehelper')
      && !line.endsWith(' file-read-data /dev/autofs_nowait')
      && !line.endsWith(' file-read-metadata /System/Cryptexes/OS')
      && !line.endsWith(' file-read-data /System/Library/CoreServices/SystemVersion.plist')
      && !line.endsWith(' file-read-data /Library/Preferences/Logging/com.apple.diagnosticd.filter.plist')
      && !line.endsWith(' file-read-data /bin')
      && !line.endsWith(' file-read-metadata /var')
      && !/^opencode\(\d+\) deny\(1\) file-read-metadata \/etc$/.test(line)
      && !/^node\(\d+\) deny\(1\) file-read-metadata \/etc$/.test(line)
      && !/^zsh\(\d+\) deny\(1\) file-read-metadata \/etc$/.test(line)
      && !/^node\(\d+\) deny\(1\) file-write-create \/Users\/[^/]+\/\.local\/share\/cursor-agent\/versions\/[^/]+\/\.running\/\d+$/.test(line)
      && !/^node\(\d+\) deny\(1\) mach-lookup com\.apple\.SystemConfiguration\.DNSConfiguration$/.test(line)
      && !/^git\(\d+\) deny\(1\) mach-lookup com\.apple\.dt\.CommandLineTools\.installondemand$/.test(line)
      && !/^python3\(\d+\) deny\(1\) mach-lookup com\.apple\.dt\.CommandLineTools\.installondemand$/.test(line)
      && !/^opencode\(\d+\) deny\(1\) file-read-metadata \/opt\/homebrew\/opt\/ruby$/.test(line)
      && !/^opencode\(\d+\) deny\(1\) file-read-metadata \/System\/Cryptexes\/App$/.test(line)
      && !/^opencode\(\d+\) deny\(1\) file-read-metadata \/System\/Library\/Frameworks\/Security\.framework\/Versions\/Current$/.test(line)
      && !/^git\(\d+\) deny\(1\) file-read-metadata \/opt\/homebrew\/opt\/git$/.test(line)
      && !/^git\(\d+\) deny\(1\) file-read-data (?:\/Users\/[^/]+)?\/Library\/Preferences\/(?:ByHost\/)?\.GlobalPreferences(?:\.[A-F0-9-]+)?(?:_m)?\.plist$/.test(line)
      && !/^opencode\(\d+\) deny\(1\) file-read-metadata \/Users\/[^/]+\/\.local\/share\/mise\/installs\/java\/[^/]+$/.test(line)
      && !/ file-read-data \/Users\/[^/]+\/\.CFUserTextEncoding$/.test(line);
  });
}

function materializePrivateGit(policy) {
  if (!policy.git) return {};
  const git = policy.git;
  fs.mkdirSync(path.join(git.privateGitDir, 'objects', 'info'), { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.join(git.privateGitDir, 'info'), { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.join(git.privateGitDir, 'refs', 'heads'), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(git.privateGitDir, 'HEAD'), `${git.expectedHead}\n`, { mode: 0o600 });
  fs.writeFileSync(path.join(git.privateGitDir, 'config'), [
    '[core]', 'repositoryformatversion = 0', 'bare = false', `worktree = ${git.workTree}`,
    'filemode = true', 'ignorecase = true', 'precomposeunicode = true', '',
  ].join('\n'), { mode: 0o600 });
  fs.writeFileSync(path.join(git.privateGitDir, 'objects', 'info', 'alternates'), `${git.objectDirectory}\n`, { mode: 0o600 });
  fs.writeFileSync(path.join(git.privateGitDir, 'info', 'exclude'), '/.workflow-sandbox/\n', { mode: 0o600 });
  fs.copyFileSync(git.sourceIndex, path.join(git.privateGitDir, 'index'));
  fs.chmodSync(path.join(git.privateGitDir, 'index'), 0o600);
  return {
    GIT_DIR: git.privateGitDir,
    GIT_WORK_TREE: git.workTree,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_ATTR_NOSYSTEM: '1',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
  };
}

function createSandboxRunner(options = {}) {
  const processRunner = options.runProcess || runProcess;
  const loadManager = options.loadManager || (async () => (await import(ENGINE_NAME)).SandboxManager);
  let poisoned = null;

  return async function runSandboxedProcess(input) {
    if (poisoned) throw sandboxError('SANDBOX_CLEANUP_FAILED', 'Sandbox runner is blocked after an earlier cleanup failure', { cause: poisoned });
    const startedAt = Date.now();
    const policy = effectivePolicy(input.policy);
    let manager;
    let initialized = false;
    let cleanupError;
    let executionError;
    let result;
    let violationBaseline = 0;
    const runtimePath = path.join(policy.filesystem.target, '.workflow-sandbox');
    const targetMode = fs.statSync(policy.filesystem.target).mode & 0o777;
    const restoreReadOnlyTarget = policy.role !== 'executor' && (targetMode & 0o200) === 0;
    try {
      if (restoreReadOnlyTarget) fs.chmodSync(policy.filesystem.target, targetMode | 0o200);
      fs.rmSync(runtimePath, { recursive: true, force: true });
      fs.mkdirSync(runtimePath, { recursive: true, mode: 0o700 });
      const gitEnvironment = materializePrivateGit(policy);
      try { manager = await loadManager(); }
      catch (error) { throw sandboxError('SANDBOX_RUNTIME_UNAVAILABLE', `Unable to load ${ENGINE_NAME}@${ENGINE_VERSION}`, { cause: sanitizedCause(error) }); }
      if (!manager?.isSupportedPlatform?.()) throw sandboxError('SANDBOX_RUNTIME_UNAVAILABLE', 'Sandbox runtime does not support this platform');
      try { await manager.initialize(runtimeConfig(policy), undefined, true); }
      catch (error) { throw sandboxError('SANDBOX_INITIALIZATION_FAILED', 'Sandbox runtime initialization failed', { cause: sanitizedCause(error) }); }
      initialized = true;
      if (!manager.isSandboxingEnabled?.()) throw sandboxError('SANDBOX_DEGRADED', 'Sandbox runtime initialized without enforcing sandboxing');
      const store = manager.getSandboxViolationStore?.();
      if (!store?.getTotalCount || !store?.getViolations) throw sandboxError('SANDBOX_DEGRADED', 'Sandbox violation monitor is unavailable');
      violationBaseline = store.getTotalCount();
      const command = `HOME=${quoteArgument(runtimePath)} TMPDIR=${quoteArgument(runtimePath)} ${serializeCommand(input.executable, input.args || [])}`;
      let wrapped;
      try { wrapped = await manager.wrapWithSandboxArgv(command, undefined, undefined, undefined, policy.filesystem.target); }
      catch (error) { throw sandboxError('SANDBOX_INITIALIZATION_FAILED', 'Sandbox command wrapping failed', { cause: sanitizedCause(error) }); }
      wrapped.argv = wrapped.argv.map(canonicalizeProxyLoopback);
      const env = sandboxEnvironment({ ...(input.env || {}), ...gitEnvironment, SANDBOX_HOME: runtimePath, SANDBOX_TMPDIR: runtimePath }, wrapped.env || {});
      result = await processRunner({
        executable: wrapped.argv[0], args: wrapped.argv.slice(1), root: policy.filesystem.target, cwd: '.',
        envAllowlist: Object.keys(env), env, input: input.input,
        timeoutMs: input.timeoutMs, maxOutputBytes: input.maxOutputBytes,
      });
      const totalCount = store.getTotalCount() - violationBaseline;
      const captured = totalCount > 0 ? store.getViolations(Math.min(totalCount, 5000)) : [];
      const violations = actionableViolations(captured, policy);
      if (totalCount > 5000 || violations.length > 0) {
        throw sandboxError('SANDBOX_VIOLATION', `Sandbox blocked ${violations.length || totalCount} operation(s) for ${policy.role}`, violationDetails(violations, totalCount, result));
      }
    } catch (error) {
      executionError = error;
    } finally {
      if (initialized) {
        try {
          manager.cleanupAfterCommand?.();
          await manager.reset();
        } catch (error) {
          const cause = sanitizedCause(error);
          poisoned = cause;
          cleanupError = sandboxError('SANDBOX_CLEANUP_FAILED', 'Sandbox runtime cleanup failed', {
            cause, priorError: executionError ? { code: executionError.code || 'SANDBOX_EXECUTION_FAILED', message: sanitizedCause(executionError) } : null,
          });
        }
      }
      try { fs.rmSync(runtimePath, { recursive: true, force: true }); }
      catch (error) {
        const cause = sanitizedCause(error);
        poisoned = cause;
        cleanupError = sandboxError('SANDBOX_CLEANUP_FAILED', 'Sandbox runtime scratch cleanup failed', {
          cause, priorError: executionError ? { code: executionError.code || 'SANDBOX_EXECUTION_FAILED', message: sanitizedCause(executionError) } : null,
        });
      }
      if (restoreReadOnlyTarget) {
        try { fs.chmodSync(policy.filesystem.target, targetMode); }
        catch (error) {
          const cause = sanitizedCause(error);
          poisoned = cause;
          cleanupError = sandboxError('SANDBOX_CLEANUP_FAILED', 'Sandbox target permissions were not restored', {
            cause, priorError: executionError ? { code: executionError.code || 'SANDBOX_EXECUTION_FAILED', message: sanitizedCause(executionError) } : null,
          });
        }
      }
    }
    if (cleanupError) throw cleanupError;
    if (executionError) throw executionError;
    return {
      ...result,
      sandbox: {
        policyHash: policy.policyHash,
        role: policy.role,
        resourceId: policy.resourceId,
        engine: policy.engine,
        durationMs: Date.now() - startedAt,
      },
    };
  };
}

function sanitizedCause(error) {
  return sanitize(String(error?.message || error), { maxBytes: 2048 }).content;
}

module.exports = {
  ENGINE_NAME,
  ENGINE_VERSION,
  createSandboxRunner,
  effectivePolicy,
  executableReadPaths,
  resolveExecutable,
  normalizeSandboxPolicy,
  policyHash,
  runtimeConfig,
  serializeCommand,
};
