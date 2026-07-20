'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;

function processError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function validateCommand(executable, args) {
  if (typeof executable !== 'string' || executable.length === 0 || executable.includes('\0')) {
    throw processError('INVALID_EXECUTABLE', 'Executable must be a non-empty string without NUL bytes');
  }
  if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string' || arg.includes('\0'))) {
    throw processError('INVALID_ARGUMENTS', 'Process arguments must be strings without NUL bytes');
  }
}

function confinedCwd(root, requestedCwd = '.') {
  const realRoot = fs.realpathSync(root);
  const candidate = path.isAbsolute(requestedCwd) ? requestedCwd : path.resolve(realRoot, requestedCwd);
  const realCwd = fs.realpathSync(candidate);
  const relative = path.relative(realRoot, realCwd);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw processError('CWD_OUTSIDE_ROOT', 'Process cwd must remain inside the approved root');
  }
  if (!fs.statSync(realCwd).isDirectory()) throw processError('CWD_NOT_DIRECTORY', 'Process cwd must be a directory');
  return realCwd;
}

function minimalEnvironment(allowlist = [], overrides = {}) {
  if (!Array.isArray(allowlist) || allowlist.some((name) => typeof name !== 'string')) {
    throw processError('INVALID_ENV_ALLOWLIST', 'Environment allowlist must contain only names');
  }
  const allowed = new Set(allowlist);
  const unknown = Object.keys(overrides).find((name) => !allowed.has(name));
  if (unknown) throw processError('ENV_NOT_ALLOWED', `Environment variable is not allowlisted: ${unknown}`);

  const environment = {};
  for (const name of allowed) {
    if (Object.hasOwn(overrides, name)) environment[name] = String(overrides[name]);
    else if (Object.hasOwn(process.env, name)) environment[name] = process.env[name];
  }
  return environment;
}

function appendOutput(state, chunk, remaining) {
  state.totalBytes += chunk.length;
  if (remaining > 0) {
    const kept = chunk.subarray(0, remaining);
    state.chunks.push(kept);
    state.bytes += kept.length;
  }
  state.truncated ||= chunk.length > Math.max(remaining, 0);
}

function outputResult(state) {
  return {
    text: Buffer.concat(state.chunks, state.bytes).toString('utf8'),
    bytes: state.totalBytes,
    truncated: state.truncated,
  };
}

function failedResult(error, startedAt) {
  return {
    ok: false,
    status: 'spawn_error',
    exitCode: null,
    signal: null,
    timedOut: false,
    outputLimitExceeded: false,
    durationMs: Date.now() - startedAt,
    stdout: { text: '', bytes: 0, truncated: false },
    stderr: { text: '', bytes: 0, truncated: false },
    error: { code: error.code || 'SPAWN_ERROR', message: error.message },
  };
}

function runProcess(options) {
  const startedAt = Date.now();
  const args = options.args || [];
  let cwd;
  let env;
  try {
    validateCommand(options.executable, args);
    cwd = confinedCwd(options.root, options.cwd);
    env = minimalEnvironment(options.envAllowlist, options.env);
  } catch (error) {
    return Promise.resolve(failedResult(error, startedAt));
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0 || !Number.isInteger(maxOutputBytes) || maxOutputBytes <= 0) {
    return Promise.resolve(failedResult(processError('INVALID_PROCESS_LIMIT', 'Process limits must be positive integers'), startedAt));
  }

  return new Promise((resolve) => {
    const stdout = { chunks: [], bytes: 0, totalBytes: 0, truncated: false };
    const stderr = { chunks: [], bytes: 0, totalBytes: 0, truncated: false };
    let timedOut = false;
    let outputLimitExceeded = false;
    let capturedBytes = 0;
    let settled = false;
    let stdinError = null;
    const detached = process.platform !== 'win32';
    const child = spawn(options.executable, args, { cwd, env, shell: false, detached, stdio: ['pipe', 'pipe', 'pipe'] });
    const stop = () => {
      if (detached && child.pid) {
        try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') child.kill('SIGKILL'); }
      } else child.kill('SIGKILL');
    };
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, timeoutMs);

    const capture = (state, chunk) => {
      const remaining = maxOutputBytes - capturedBytes;
      appendOutput(state, chunk, remaining);
      capturedBytes += Math.min(chunk.length, Math.max(remaining, 0));
      if (chunk.length > Math.max(remaining, 0)) {
        outputLimitExceeded = true;
        stop();
      }
    };
    child.stdout.on('data', (chunk) => capture(stdout, chunk));
    child.stderr.on('data', (chunk) => capture(stderr, chunk));
    child.stdin.on('error', (error) => {
      if (settled) return;
      stdinError = error;
      clearTimeout(timer);
      stop();
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(failedResult(error, startedAt));
    });
    child.on('close', (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (stdinError) {
        resolve(failedResult(stdinError, startedAt));
        return;
      }
      const status = timedOut ? 'timed_out' : outputLimitExceeded ? 'output_limit' : exitCode === 0 ? 'succeeded' : 'failed';
      resolve({
        ok: status === 'succeeded',
        status,
        exitCode,
        signal,
        timedOut,
        outputLimitExceeded,
        durationMs: Date.now() - startedAt,
        stdout: outputResult(stdout),
        stderr: outputResult(stderr),
        error: null,
      });
    });
    try {
      if (options.input === undefined) child.stdin.end();
      else child.stdin.end(options.input);
    } catch (error) {
      if (!settled) {
        stdinError = error;
        clearTimeout(timer);
        stop();
      }
    }
  });
}

module.exports = {
  DEFAULT_MAX_OUTPUT_BYTES,
  DEFAULT_TIMEOUT_MS,
  confinedCwd,
  minimalEnvironment,
  runProcess,
};
