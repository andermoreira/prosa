'use strict';

/**
 * local-adapter.cjs — o adapter concreto que implementa TODAS as seams que o orchestrator aciona
 * (preflight, acquireLock, openRun, checkpoint, revalidate, createAttempt, invoke, collectChanges,
 * runGate, reviewStep, acceptStep, commitStep, reconcileStep, reviewGlobal, acceptGlobal,
 * writeReports, createPullRequest). É a cola entre os módulos puros (git, runtime, budget, opencode/
 * cursor, review, acceptance, artifacts, catalogs, evidence, findings, notifications, pr, report).
 *
 * Responsabilidades próprias: persistir o state.json a cada checkpoint (via runtime, com o ledger de
 * budget), computar a IDENTIDADE byte-a-byte do worktree (captureWorktreeIdentity) que a revalidação
 * usa para detectar drift, e rotear gates executáveis vs MCP. Todos os módulos são injetáveis
 * (modulesFrom) — é o seam que torna o pipeline testável sem git ou agente reais.
 * Ver docs/workflows/automated-spec-pipeline.md.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const acceptance = require('./acceptance.cjs');
const artifactsModule = require('./artifacts.cjs');
const budget = require('./budget.cjs');
const catalogs = require('./catalogs.cjs');
const contracts = require('./contracts.cjs');
const cursor = require('./cursor.cjs');
const evidence = require('./evidence.cjs');
const findings = require('./findings.cjs');
const git = require('./git.cjs');
const hitlDecision = require('./hitl-decision.cjs');
const notifications = require('./notifications.cjs');
const opencode = require('./opencode.cjs');
const processModule = require('./process.cjs');
const pullRequests = require('./pr.cjs');
const report = require('./report.cjs');
const review = require('./review.cjs');
const retry = require('./retry.cjs');
const riskPolicy = require('./risk-policy.cjs');
const riskSignals = require('./risk-signals.cjs');
const runtime = require('./runtime.cjs');
const sandbox = require('./sandbox.cjs');
const { DEFAULT_MAX_BYTES, sanitize, summarizeOpaque } = require('./sanitize.cjs');
const stateMachine = require('./state-machine.cjs');

const REQUIRED_MODULES = {
  acceptance: ['evaluateLocalAcceptance', 'evaluateGlobalAcceptance'],
  artifacts: ['createArtifactStore'], budget: ['createBudgetLedger', 'restoreBudgetLedger', 'reserveBudget', 'reconcilePendingReservations', 'reconcileReservation', 'pauseBudget', 'publicLedger'],
  catalogs: ['loadCatalogsFromGit', 'resolveGate', 'resolveResource'], contracts: ['validateFile'], cursor: ['createCursorAdapter'],
  evidence: ['normalizeEvidenceRequirement', 'validateEvidenceMap'], findings: ['appendFindingsBacklog'],
  git: ['validateBase', 'createAttemptWorktree', 'removeAttemptWorktree', 'collectChanges', 'preflightCommit', 'createLocalCommit'],
  notifications: ['createNotificationService'], opencode: ['createOpenCodeAdapter'], process: ['runProcess'], sandbox: ['createSandboxRunner', 'executableReadPaths', 'normalizeSandboxPolicy', 'resolveExecutable'],
  pr: ['createPullRequest'], report: ['createReportStore'],
  review: ['backlogFinding', 'captureGitState', 'captureIntegratedDiff', 'createClosedSnapshot', 'createGlobalReviewSnapshot', 'parseRoleOutput'],
  retry: ['retryDecision'], runtime: ['acquireLock', 'releaseLock', 'createInitialRunState', 'readRunState', 'writeRunState', 'assertSecureRuntimePath', 'secureMkdir'],
  stateMachine: ['transitionRun', 'transitionStep'],
};

// Read-only system prefixes a gate's toolchain may touch; deliberately excludes /Users so home
// secrets stay unreadable even under the gate's broad read (ADR 028, refined).
const GATE_SYSTEM_READ_PREFIXES = Object.freeze(['/usr', '/bin', '/sbin', '/opt', '/System', '/Library', '/private', '/etc', '/dev', '/var']);

function localError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function hash(value) {
  const content = Buffer.isBuffer(value) || typeof value === 'string' ? value : JSON.stringify(value);
  return crypto.createHash('sha256').update(content).digest('hex');
}

const MAX_DECISION_BYTES = 16 * 1024;

function readBoundedDescriptor(descriptor) {
  const chunks = [];
  let total = 0;
  while (total <= MAX_DECISION_BYTES) {
    const buffer = Buffer.allocUnsafe(Math.min(4096, MAX_DECISION_BYTES + 1 - total));
    const bytes = fs.readSync(descriptor, buffer, 0, buffer.length, null);
    if (bytes === 0) break;
    total += bytes;
    if (total > MAX_DECISION_BYTES) throw localError('HITL_DECISION_TOO_LARGE', 'Decision input exceeds 16 KiB');
    chunks.push(buffer.subarray(0, bytes));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function readDecisionFile(filePath, dependencies = {}) {
  let source;
  if (filePath === '-') {
    source = dependencies.readStdin ? dependencies.readStdin() : readBoundedDescriptor(0);
  } else {
    let descriptor;
    try {
      descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
      const stat = fs.fstatSync(descriptor);
      if (!stat.isFile()) throw localError('HITL_DECISION_FILE_INVALID', 'Decision file must be a regular file');
      if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) {
        throw localError('HITL_DECISION_FILE_OWNER', 'Decision file must be owned by the current user');
      }
      if ((stat.mode & 0o077) !== 0) {
        throw localError('HITL_DECISION_FILE_PERMISSIONS', 'Decision file must not be accessible by group or other users');
      }
      if (stat.size > MAX_DECISION_BYTES) throw localError('HITL_DECISION_TOO_LARGE', 'Decision input exceeds 16 KiB');
      source = readBoundedDescriptor(descriptor);
    } catch (error) {
      if (error.code?.startsWith('HITL_')) throw error;
      throw localError('HITL_DECISION_FILE_INVALID', 'Decision file must be a readable regular file without symlink traversal');
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
    }
  }
  if (typeof source !== 'string' || source.length === 0) throw localError('HITL_DECISION_EMPTY', 'Decision input is empty');
  if (Buffer.byteLength(source) > MAX_DECISION_BYTES) throw localError('HITL_DECISION_TOO_LARGE', 'Decision input exceeds 16 KiB');
  try { return JSON.parse(source); }
  catch { throw localError('HITL_DECISION_JSON_INVALID', 'Decision input is not valid JSON'); }
}

function completeWorktreeDiff(worktree) {
  const root = fs.realpathSync(worktree);
  const tracked = execFileSync('git', ['-C', root, 'diff', '--binary', 'HEAD', '--'], { maxBuffer: 32 * 1024 * 1024 });
  const untracked = execFileSync('git', ['-C', root, 'ls-files', '--others', '--exclude-standard', '-z'])
    .toString('utf8').split('\0').filter(Boolean).sort();
  const patches = [tracked];
  for (const relativePath of untracked) {
    const candidate = path.resolve(root, relativePath);
    if (!within(root, candidate)) throw localError('HITL_DIFF_PATH_INVALID', 'Untracked diff path escaped the worktree');
    try {
      patches.push(execFileSync('git', ['-C', root, 'diff', '--no-index', '--binary', '--', '/dev/null', relativePath], { maxBuffer: 32 * 1024 * 1024 }));
    } catch (error) {
      if (error.status !== 1 || !Buffer.isBuffer(error.stdout)) throw error;
      patches.push(error.stdout);
    }
  }
  return Buffer.concat(patches).toString('utf8');
}

function modulesFrom(overrides = {}) {
  const modules = {
    acceptance, artifacts: artifactsModule, budget, catalogs, contracts, cursor, evidence, findings, git,
    notifications, opencode, process: processModule, pr: pullRequests, report, review, retry, runtime, sandbox, stateMachine,
    ...overrides,
  };
  for (const [name, methods] of Object.entries(REQUIRED_MODULES)) {
    const missing = methods.filter((method) => typeof modules[name]?.[method] !== 'function');
    if (missing.length > 0) throw localError('LOCAL_ADAPTER_MODULE_INVALID', `Workflow module is incomplete: ${name}`, { name, missing });
  }
  return modules;
}

function outputText(result, stream = 'stdout') {
  return result?.[stream]?.text || '';
}

function changedPaths(changes) {
  return [...new Set(changes.flatMap((change) => change.oldPath ? [change.oldPath, change.path] : [change.path]))];
}

// Identidade byte-a-byte do worktree: HEAD + hash do status + tree do index + diffs staged/unstaged
// + conteúdo de cada arquivo alterado. É o fingerprint que a revalidação compara no resume para
// provar que ninguém editou o worktree entre run e resume (senão: WORKTREE_IDENTITY_DRIFT).
function captureWorktreeIdentity(worktree) {
  const root = fs.realpathSync(worktree);
  const run = (args) => execFileSync('git', ['-C', root, ...args], { maxBuffer: 32 * 1024 * 1024 });
  const status = run(['status', '--porcelain=v2', '--untracked-files=all', '-z']);
  const paths = [...new Set([
    ...run(['diff', '--name-only', '-z', 'HEAD', '--']).toString('utf8').split('\0').filter(Boolean),
    ...run(['ls-files', '--others', '--exclude-standard', '-z']).toString('utf8').split('\0').filter(Boolean),
  ])].sort();
  const bytes = crypto.createHash('sha256');
  for (const relativePath of paths) {
    const candidate = path.resolve(root, relativePath);
    if (!within(root, candidate)) throw localError('WORKTREE_IDENTITY_PATH_INVALID', 'Changed path escaped its worktree');
    bytes.update(`${Buffer.byteLength(relativePath)}:${relativePath}:`);
    if (!fs.existsSync(candidate)) bytes.update('missing');
    else if (fs.lstatSync(candidate).isSymbolicLink()) bytes.update(`symlink:${fs.readlinkSync(candidate)}`);
    else bytes.update(fs.readFileSync(candidate));
  }
  const identity = {
    head: run(['rev-parse', 'HEAD']).toString('utf8').trim(),
    statusHash: hash(status),
    indexTreeHash: run(['write-tree']).toString('utf8').trim(),
    cachedDiffHash: hash(run(['diff', '--cached', '--binary', 'HEAD', '--'])),
    workingDiffHash: hash(run(['diff', '--binary', '--'])),
    changedBytesHash: bytes.digest('hex'),
  };
  return { ...identity, hash: hash(identity) };
}

function assertWorktreeIdentity(worktree, expected) {
  const actual = captureWorktreeIdentity(worktree);
  if (!expected || actual.hash !== expected.hash) {
    throw localError('WORKTREE_IDENTITY_DRIFT', 'Staged or unstaged worktree bytes differ from the reviewed snapshot', { expected, actual });
  }
  return actual;
}

function within(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function readContextFile(worktree, relativePath) {
  const root = fs.realpathSync(worktree);
  const requested = path.resolve(root, relativePath);
  if (!within(root, requested)) throw localError('REVIEW_CONTEXT_PATH_INVALID', 'Review context path escaped the execution worktree', { path: relativePath });
  let realPath;
  try { realPath = fs.realpathSync(requested); }
  catch { throw localError('REVIEW_CONTEXT_MISSING', 'Required review context could not be resolved', { path: relativePath }); }
  const stat = fs.lstatSync(requested);
  if (!within(root, realPath) || !stat.isFile() || stat.isSymbolicLink()) {
    throw localError('REVIEW_CONTEXT_PATH_INVALID', 'Review context must be a regular file inside the execution worktree', { path: relativePath });
  }
  return { path: relativePath, content: fs.readFileSync(realPath, 'utf8') };
}

function applicableAgentPaths(worktree, relevantPaths) {
  const root = fs.realpathSync(worktree);
  const candidates = new Set(['AGENTS.md']);
  for (const relativePath of relevantPaths) {
    let directory = path.dirname(relativePath);
    while (directory !== '.') {
      candidates.add(path.posix.join(directory.split(path.sep).join('/'), 'AGENTS.md'));
      const parent = path.dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
  }
  return [...candidates].filter((relativePath) => {
    const requested = path.resolve(root, relativePath);
    return within(root, requested) && fs.existsSync(requested);
  }).sort();
}

function loadReviewContext(worktree, validation, step) {
  const root = fs.realpathSync(worktree);
  const steps = step ? [step] : validation.steps;
  const relevantPaths = [validation.specPath, ...steps.flatMap((entry) => [entry.source.path, ...entry.predictedFiles])];
  const spec = readContextFile(root, validation.specPath);
  const adrDeclaration = spec.content.match(/^\*\*ADRs:\*\*([^\n]*)$/m)?.[1] || '';
  const adrPaths = [...adrDeclaration.matchAll(/\]\(\.\.\/(adr\/[^)]+\.md)\)/g)].map((match) => match[1]);
  const schemaDirectory = path.join(root, 'schemas');
  let schemaPaths;
  try {
    const realSchemaDirectory = fs.realpathSync(schemaDirectory);
    if (!within(root, realSchemaDirectory)) throw new Error('outside worktree');
    schemaPaths = fs.readdirSync(realSchemaDirectory).filter((name) => name.endsWith('.json')).sort().map((name) => `schemas/${name}`);
  } catch {
    throw localError('REVIEW_CONTEXT_MISSING', 'Required schema contracts could not be resolved');
  }
  const required = {
    spec,
    steps: steps.map((entry) => readContextFile(root, entry.source.path)),
    adrs: adrPaths.map((relativePath) => readContextFile(root, relativePath)),
    agents: applicableAgentPaths(root, relevantPaths).map((relativePath) => readContextFile(root, relativePath)),
    contracts: [...schemaPaths, 'workflow/gates.yaml', 'workflow/resources.yaml'].map((relativePath) => readContextFile(root, relativePath)),
  };
  if (sanitize(required).truncated) throw localError('REVIEW_CONTEXT_TOO_LARGE', 'Required review context does not fit the sanitized snapshot limit');
  return required;
}

function gateExecutionLocation(gate, requestedWorktree, repoRoot, hasActiveWorktree) {
  if (!['repo-root', 'worktree-root'].includes(gate?.cwd)) throw localError('GATE_CWD_INVALID', 'Gate cwd policy is invalid');
  if (typeof requestedWorktree !== 'string' || requestedWorktree === '') throw localError('GATE_WORKTREE_REQUIRED', 'Gate execution requires the step or integrated worktree');
  const executionRoot = fs.realpathSync(requestedWorktree);
  if (hasActiveWorktree && executionRoot === fs.realpathSync(repoRoot)) {
    throw localError('GATE_WORKTREE_REQUIRED', 'Gate must not execute from the mutable main checkout');
  }
  return { root: executionRoot, cwd: '.', policy: gate.cwd };
}

function createGateEnvironment(runtimeRoot, runtimeModule = runtime) {
  const primaryRoot = path.dirname(path.dirname(path.dirname(runtimeRoot)));
  const parent = path.join(runtimeRoot, 'gate-environments');
  runtimeModule.secureMkdir(primaryRoot, parent);
  const root = fs.mkdtempSync(path.join(parent, 'gate-'));
  fs.chmodSync(root, 0o700);
  const home = runtimeModule.secureMkdir(primaryRoot, path.join(root, 'home'));
  const temporary = runtimeModule.secureMkdir(primaryRoot, path.join(root, 'tmp'));
  return { root, env: { HOME: home, PATH: process.env.PATH || '', TMPDIR: temporary } };
}

function gateProcessSummary(result, maxBytes = 16 * 1024) {
  const summarize = (stream = {}) => {
    const value = summarizeOpaque(stream.text || '', { maxBytes });
    const inspected = sanitize(stream.text || '', { maxBytes });
    return {
      summary: '[OPAQUE OUTPUT OMITTED]', hash: value.hash,
      bytes: Number.isSafeInteger(stream.bytes) ? stream.bytes : value.bytes,
      persistedBytes: 0, truncation: stream.truncated === true || inspected.truncated, redaction: inspected.redacted,
    };
  };
  return {
    ok: result.ok === true, status: result.status, exitCode: result.exitCode ?? null, signal: result.signal ?? null,
    timedOut: result.timedOut === true, outputLimitExceeded: result.outputLimitExceeded === true,
    durationMs: result.durationMs, stdout: summarize(result.stdout), stderr: summarize(result.stderr),
    error: result.error ? {
      code: result.error.code,
      messageHash: hash(String(result.error.message || '')),
      messageBytes: Buffer.byteLength(String(result.error.message || '')),
    } : null,
    inheritedEnvironment: ['PATH'], networkSandbox: false,
  };
}

function validateReviewState(state, repository, validation, runId) {
  if (state.runId !== runId || state.repo.identity !== repository.identity
    || state.repo.realRoot !== repository.realRoot || state.repo.baseSha !== validation.baseSha
    || state.spec.dagHash !== validation.dag.hash) {
    throw localError('REVIEW_STATE_FORGED', 'Persisted review state does not match repository identity, base, DAG, and run');
  }
  if (!['SUCCEEDED', 'BLOCKED', 'FAILED', 'CANCELLED'].includes(state.state)) {
    throw localError('REVIEW_RUN_NOT_CLOSED', 'Review requires a closed run');
  }
  const snapshot = state.artifacts.find((entry) => entry.kind === 'snapshot' && entry.id === 'artifact-global-snapshot');
  if (!snapshot) throw localError('REVIEW_SNAPSHOT_NOT_FOUND', 'Completed run has no persisted global snapshot');
  return snapshot;
}

function createLocalAdapter(options = {}) {
  const modules = modulesFrom(options.modules);
  const repoRoot = fs.realpathSync(options.repoRoot || process.cwd());
  const runProcess = options.runProcess || modules.process.runProcess;
  let context;
  let lock;
  let state;
  let ledger;
  let stores;
  let openCode;
  let cursorAgent;
  let sandboxedProcessRunner;
  const mcpModule = options.modules?.mcp || require('./mcp.cjs');
  let agentArtifactContext;
  let notificationService;
  const gateArtifacts = new Map();
  const persistedEvidenceGates = new Map();
  const persistedEvidenceArtifacts = new Map();
  const stepEvidence = new Map();
  const stepReviews = new Map();
  const notificationEvents = [];
  const revalidations = [];
  const factualIdentities = new Map();
  let postRunReview;

  function runId(validation) {
    return `run-${validation.spec.id.replace(/^spec-/, '')}`;
  }

  function runtimeRoot() {
    return path.join(repoRoot, '.workflow-runtime', 'runs', context.runId);
  }

  function ensureStores() {
    if (!stores) {
      stores = {
        artifacts: modules.artifacts.createArtifactStore({ runtimeRoot: runtimeRoot() }),
        reports: modules.report.createReportStore({ runtimeRoot: runtimeRoot() }),
      };
      const artifactBridge = {
        findAgentResponse: stores.artifacts.findAgentResponse,
        preserveAgentResponse(input) {
          return stores.artifacts.preserveAgentResponse({ ...input, ...agentArtifactContext });
        },
      };
      sandboxedProcessRunner = options.runSandboxedProcess || modules.sandbox.createSandboxRunner({ runProcess });
      openCode = options.openCode || modules.opencode.createOpenCodeAdapter({ runSandboxedProcess: sandboxedProcessRunner, artifacts: artifactBridge });
      cursorAgent = options.cursorAgent || modules.cursor.createCursorAdapter({ runSandboxedProcess: sandboxedProcessRunner, artifacts: artifactBridge });
      notificationService = modules.notifications.createNotificationService({
        catalog: { ok: true, value: context.validation.catalogs }, repoRoot,
        worktreeRoot: '.', runProcess,
        async persistEvent(event) { notificationEvents.push(event); return { id: `notification-${notificationEvents.length}` }; },
      });
    }
    return stores;
  }

  function preserveSandboxViolation(error) {
    if (error?.code !== 'SANDBOX_VIOLATION' || !agentArtifactContext) return null;
    const ref = stores.artifacts.preserve({
      stepId: agentArtifactContext.stepId,
      attempt: agentArtifactContext.attempt,
      kind: 'agent-log',
      mediaType: 'application/json',
      content: { code: error.code, message: error.message, details: error.details },
      provenance: {
        operationId: agentArtifactContext.operationId,
        role: agentArtifactContext.role,
        runId: context.runId,
        stepId: agentArtifactContext.provenanceStepId,
        attemptId: agentArtifactContext.attemptId,
        sourceHash: agentArtifactContext.sourceHash,
        sandboxPolicyHash: agentArtifactContext.sandboxPolicyHash,
      },
      sensitivity: 'sensitive',
    });
    if (context.mode !== 'review') persistArtifactRef(ref, {
      stepId: agentArtifactContext.provenanceStepId,
      attemptId: agentArtifactContext.attemptId,
      kind: 'stderr',
      sourceHash: agentArtifactContext.sourceHash,
    });
    return ref;
  }

  // The sandbox runner's in-memory poison flag blocks reuse only within the process. A cleanup
  // failure leaves host-level state (SRT proxy, active profile) that a fresh process cannot see, so
  // the marker persists the block outside any run's state and every mutable entrypoint checks it
  // before lock or spawn. Presence — readable or not — means poisoned; removal is a manual step the
  // runbook documents after the operator verifies the host.
  function sandboxPoisonPath() {
    return path.join(repoRoot, '.workflow-runtime', 'sandbox-poison.json');
  }

  function persistSandboxPoison(error, provenance) {
    try {
      modules.runtime.atomicWriteJson(sandboxPoisonPath(), {
        schemaVersion: '1.0.0',
        createdAt: new Date().toISOString(),
        runId: context?.runId ?? null,
        operationId: provenance?.operationId ?? null,
        policyHash: provenance?.sandboxPolicyHash ?? null,
        cause: sanitize(String(error?.details?.cause ?? error?.message ?? error), { maxBytes: 2048 }).content,
      }, { primaryRoot: repoRoot });
    } catch (writeError) {
      // A failed marker write must never mask the original SANDBOX_CLEANUP_FAILED: annotate and move on.
      error.details = { ...error.details, poisonMarkerWriteFailed: sanitize(String(writeError?.message ?? writeError), { maxBytes: 512 }).content };
    }
  }

  function noteSandboxPoison(error) {
    if (error?.code === 'SANDBOX_CLEANUP_FAILED') persistSandboxPoison(error, agentArtifactContext);
  }

  function assertNotSandboxPoisoned() {
    let present = false;
    try { present = fs.existsSync(sandboxPoisonPath()); }
    catch { present = true; }
    if (present) {
      throw localError(
        'SANDBOX_POISONED',
        'Sandbox runtime is poisoned by an earlier cleanup failure; verify the host and remove the marker (see the runbook)',
        { marker: path.relative(repoRoot, sandboxPoisonPath()) },
      );
    }
  }

  function readClosedSnapshot(ref) {
    const root = runtimeRoot();
    const primaryRoot = path.dirname(path.dirname(path.dirname(root)));
    const manifestPath = path.resolve(root, ref.path);
    modules.runtime.assertSecureRuntimePath(primaryRoot, manifestPath);
    if (!within(root, manifestPath) || fs.lstatSync(manifestPath).isSymbolicLink()) throw localError('REVIEW_SNAPSHOT_INVALID', 'Snapshot reference escaped its run');
    const content = fs.readFileSync(manifestPath, 'utf8');
    if (hash(content) !== ref.hash) throw localError('REVIEW_SNAPSHOT_HASH_MISMATCH', 'Persisted snapshot manifest failed integrity validation');
    let manifest;
    try { manifest = JSON.parse(content); } catch { throw localError('REVIEW_SNAPSHOT_INVALID', 'Persisted snapshot manifest is invalid'); }
    if (manifest.schemaVersion !== '1.0.0' || manifest.closed !== true || !/^[0-9a-f]{64}$/.test(manifest.sourceHash || '')) {
      throw localError('REVIEW_SNAPSHOT_INVALID', 'Persisted snapshot is not closed');
    }
    const directory = path.dirname(manifestPath);
    for (const part of Object.values(manifest.parts || {})) {
      if (!part || typeof part.file !== 'string' || !/^[A-Za-z0-9._-]+$/.test(part.file) || !/^[0-9a-f]{64}$/.test(part.hash || '')) {
        throw localError('REVIEW_SNAPSHOT_INVALID', 'Persisted snapshot part metadata is invalid');
      }
      const partPath = path.join(directory, part.file);
      modules.runtime.assertSecureRuntimePath(primaryRoot, partPath);
      if (fs.lstatSync(partPath).isSymbolicLink() || hash(fs.readFileSync(partPath)) !== part.hash) {
        throw localError('REVIEW_SNAPSHOT_HASH_MISMATCH', 'Persisted snapshot part failed integrity validation');
      }
    }
    let diff;
    try { diff = JSON.parse(fs.readFileSync(path.join(directory, manifest.parts.diff.file), 'utf8')); }
    catch { throw localError('REVIEW_SNAPSHOT_INVALID', 'Persisted snapshot diff is invalid'); }
    return { path: directory, manifestPath, hash: ref.hash, sourceHash: manifest.sourceHash, parts: manifest.parts, diff, closed: true };
  }

  function persistGlobalSnapshot(snapshot) {
    const parts = Object.values(snapshot.parts);
    const ref = {
      id: 'artifact-global-snapshot', kind: 'snapshot',
      path: path.relative(runtimeRoot(), snapshot.manifestPath).split(path.sep).join('/'),
      mediaType: 'application/json', schemaVersion: '1.0.0', hash: snapshot.hash,
      provenance: { runId: context.runId, stepId: null, attemptId: null, sourceHash: snapshot.sourceHash },
      sensitivity: 'restricted', retention: 'run',
      sanitization: parts.some((part) => part.truncated) ? 'truncated' : parts.some((part) => part.redacted) ? 'redacted' : 'sanitized',
      createdAt: new Date().toISOString(),
    };
    readClosedSnapshot(ref);
    state.artifacts = [...state.artifacts.filter((entry) => entry.id !== ref.id), ref];
    persist();
    return ref;
  }

  async function command(executable, args, root = repoRoot, extra = {}) {
    return runProcess({
      executable, args, root, cwd: '.', envAllowlist: ['HOME', 'PATH', 'TMPDIR'],
      timeoutMs: 30000, maxOutputBytes: 1024 * 1024, ...extra,
    });
  }

  async function branchName() {
    const result = await command('git', ['branch', '--show-current']);
    if (!result.ok || outputText(result).trim() === '') throw localError('GIT_BASE_BRANCH_INVALID', 'The approved base must be checked out on a branch');
    return outputText(result).trim();
  }

  async function preflight(input) {
    context = input;
    assertNotSandboxPoisoned();
    const base = modules.git.validateBase({
      cwd: repoRoot,
      baseSha: input.validation.baseSha,
      baseBranch: await branchName(),
      approved: input.validation.spec.status === 'approved',
    });
    const resourceIds = new Set(input.validation.steps.flatMap((step) => [step.resources.executor, step.resources.reviewer, step.resources.diagnostician]));
    const resources = [...resourceIds].map(resolveResource);
    for (const executable of new Set(resources.map((resource) => resource.executable))) {
      try { modules.sandbox.resolveExecutable(executable); }
      catch {
        const code = executable === 'opencode' ? 'OPENCODE_COMMAND_UNAVAILABLE' : 'CURSOR_COMMAND_UNAVAILABLE';
        throw localError(code, `${executable} is required before workflow mutation`, { executable });
      }
    }
    const approvedInputs = [
      input.validation.specPath,
      ...input.validation.steps.map((step) => step.source.path),
      ...Object.values(modules.catalogs.CATALOG_PATHS || catalogs.CATALOG_PATHS),
    ];
    for (const relativePath of approvedInputs) {
      const result = await command('git', ['show', `${base.baseSha}:${relativePath}`]);
      const current = fs.readFileSync(path.join(repoRoot, relativePath));
      if (!result.ok || !Buffer.from(outputText(result)).equals(current)) {
        throw localError('APPROVED_INPUT_DRIFT', 'Spec and steps must be byte-identical to the explicit approved base', { path: relativePath });
      }
    }
    const catalog = await modules.catalogs.loadCatalogsFromGit(repoRoot, base.baseSha);
    if (!catalog.ok || catalog.value.hashes.combined !== input.validation.catalogs.hashes.combined) {
      throw localError('CATALOG_INVALID', 'Approved-base catalogs failed preflight', { errors: catalog.errors });
    }
    return { ok: true, base };
  }

  function acquireLock(input) {
    context = input;
    lock = modules.runtime.acquireLock({
      cwd: repoRoot, runId: input.runId, specPath: input.validation.specPath,
      removeOrphanLock: input.removeOrphanLock === true,
      confirmedBy: input.removeOrphanLock === true ? 'workflow-operator' : undefined,
    });
    return lock;
  }

  function releaseLock(handle) {
    if (!handle) return false;
    return modules.runtime.releaseLock(handle);
  }

  function sourceHashes(validation) {
    const stepSources = validation.steps.map((step) => fs.readFileSync(path.join(repoRoot, step.source.path)));
    const schemaDirectory = path.join(repoRoot, 'schemas');
    const schemaSources = fs.readdirSync(schemaDirectory).filter((name) => name.endsWith('.json')).sort()
      .map((name) => fs.readFileSync(path.join(schemaDirectory, name)));
    return {
      hash: hash(fs.readFileSync(path.join(repoRoot, validation.specPath))),
      stepsHash: hash(Buffer.concat(stepSources)),
      notesHash: hash(validation.spec.implementationNotes || []),
      schemasHash: hash(Buffer.concat(schemaSources)),
      catalogsHash: validation.catalogs.hashes.combined,
      policyHash: hash(fs.readFileSync(path.join(repoRoot, 'AGENTS.md'))),
      dagHash: validation.dag.hash,
    };
  }

  function initialSteps(validation) {
    const at = new Date().toISOString();
    return validation.steps.map((step) => ({
      id: step.id, state: 'PENDING', parentSha: validation.baseSha, attemptIds: [], worktreeId: null,
      gateIds: step.verification.gateIds, evidence: [], findingIds: [], commitIds: [], updatedAt: at, cause: null,
    }));
  }

  function aggregateArtifactId(resultRef) {
    return `artifact-${hash(resultRef)}`;
  }

  function executionSourceHash(step) {
    const steps = step ? [step] : context.validation.steps;
    const documentHash = (declared, relativePath) => /^[0-9a-f]{64}$/.test(declared || '')
      ? declared : relativePath ? hash(fs.readFileSync(path.join(repoRoot, relativePath))) : null;
    const specHash = documentHash(context.validation.spec.source?.hash, context.validation.specPath);
    const stepHashes = steps.map((entry) => [entry.id, documentHash(entry.source?.hash, entry.source?.path)]);
    if (steps.length === 0 || stepHashes.some(([, sourceHash]) => !/^[0-9a-f]{64}$/.test(sourceHash || ''))
      || !/^[0-9a-f]{64}$/.test(specHash || '') || typeof context.validation.baseSha !== 'string' || context.validation.baseSha === '') {
      throw localError('ARTIFACT_SOURCE_HASH_REQUIRED', 'Approved spec, step, and base facts are required for artifact provenance');
    }
    return hash({
      specHash,
      stepHashes,
      baseSha: context.validation.baseSha,
    });
  }

  function attemptId(stepId, attempt) {
    return `attempt-${stepId}-${attempt}`;
  }

  function persistArtifactRef(ref, input = {}) {
    if (!ref || typeof ref.path !== 'string' || !/^[0-9a-f]{64}$/.test(ref.hash || '')) return null;
    const sourceHash = input.sourceHash || ref.provenance?.sourceHash;
    if (!/^[0-9a-f]{64}$/.test(sourceHash || '')) {
      throw localError('ARTIFACT_SOURCE_HASH_REQUIRED', 'Artifact provenance requires the hash of its factual input');
    }
    const id = ref.kind === 'snapshot' ? ref.id : aggregateArtifactId(input.logicalRef || ref.id);
    const kind = input.kind || ({ review: 'review', diagnosis: 'diagnosis' }[ref.kind])
      || (String(ref.kind).startsWith('gate-') ? 'gate-result' : 'stdout');
    const record = {
      id, kind, path: ref.path, mediaType: ref.mediaType || 'text/plain', schemaVersion: ref.schemaVersion || '1.0.0', hash: ref.hash,
      provenance: {
        runId: context.runId, stepId: input.stepId ?? null, attemptId: input.attemptId ?? null,
        sourceHash,
      },
      sensitivity: ['public', 'internal', 'restricted'].includes(ref.sensitivity) ? ref.sensitivity : 'restricted',
      retention: ['run', 'report', 'manual'].includes(ref.retention) ? ref.retention : 'run',
      sanitization: ref.truncation === true ? 'truncated' : ref.redaction === true ? 'redacted' : 'sanitized',
      createdAt: ref.createdAt || new Date().toISOString(),
    };
    state.artifacts = [...state.artifacts.filter((entry) => entry.id !== id), record];
    if (record.provenance.attemptId) {
      const attempt = state.attempts.find((entry) => entry.id === record.provenance.attemptId);
      if (attempt && !attempt.artifactIds.includes(id)) attempt.artifactIds.push(id);
    }
    return record;
  }

  function readPersistedArtifact(ref) {
    const root = runtimeRoot();
    const primaryRoot = path.dirname(path.dirname(path.dirname(root)));
    const filePath = path.resolve(root, ref.path);
    modules.runtime.assertSecureRuntimePath(primaryRoot, filePath);
    if (!within(path.join(root, 'artifacts'), filePath) || fs.lstatSync(filePath).isSymbolicLink()) {
      throw localError('ARTIFACT_REF_INVALID', 'Persisted artifact reference escaped its run');
    }
    const content = fs.readFileSync(filePath, 'utf8');
    if (hash(content) !== ref.hash) throw localError('ARTIFACT_HASH_MISMATCH', 'Persisted artifact failed integrity validation');
    let manifest;
    try { manifest = JSON.parse(fs.readFileSync(path.join(path.dirname(filePath), 'manifest.json'), 'utf8')); }
    catch { throw localError('ARTIFACT_MANIFEST_INVALID', 'Persisted artifact manifest is invalid'); }
    const manifestRef = manifest.schemaVersion === '1.0.0' && manifest.artifacts?.find((entry) => entry.path === ref.path && entry.hash === ref.hash);
    if (!manifestRef) throw localError('ARTIFACT_REF_STALE', 'Persisted artifact does not match its manifest');
    return { content, manifestRef };
  }

  function verifyPersistedArtifacts() {
    for (const ref of state.artifacts) {
      if (ref.kind === 'snapshot') readClosedSnapshot(ref);
      else readPersistedArtifact(ref);
    }
  }

  function rehydrateEvidence(validation) {
    gateArtifacts.clear();
    persistedEvidenceArtifacts.clear();
    persistedEvidenceGates.clear();
    stepEvidence.clear();
    revalidations.length = 0;
    factualIdentities.clear();
    for (const stateRef of state.artifacts.filter((entry) => entry.kind === 'stdout')) {
      const { content, manifestRef } = readPersistedArtifact(stateRef);
      if (manifestRef.kind === 'worktree-identity') {
        let identity;
        try { identity = JSON.parse(content); }
        catch { throw localError('RESUME_WORKTREE_IDENTITY_INVALID', 'Persisted worktree identity is not valid JSON'); }
        const worktree = state.worktrees.find((entry) => entry.stepId === stateRef.provenance.stepId
          && entry.id === manifestRef.provenance?.worktreeId);
        if (worktree) factualIdentities.set(worktree.id, {
          worktreeId: worktree.id, attemptId: stateRef.provenance.attemptId, worktree: worktree.path, identity,
        });
        continue;
      }
      if (typeof manifestRef.provenance?.trigger !== 'string') continue;
      try { revalidations.push(JSON.parse(content)); }
      catch { throw localError('RESUME_REVALIDATION_ARTIFACT_INVALID', 'Persisted revalidation result is not valid JSON'); }
    }
    for (const step of validation.steps) {
      const persisted = state.steps.find((entry) => entry.id === step.id);
      if (persisted.gateIds.length !== step.verification.gateIds.length
        || persisted.gateIds.some((gateId) => !step.verification.gateIds.includes(gateId))) {
        throw localError('RESUME_GATE_REFERENCE_INVALID', 'Persisted declared gates do not match the validated step', { stepId: step.id });
      }
      for (const stateRef of state.artifacts.filter((entry) => entry.kind === 'gate-result' && entry.provenance.stepId === step.id)) {
        const { content, manifestRef } = readPersistedArtifact(stateRef);
        const gateId = manifestRef.provenance?.gateId;
        if (!step.verification.gateIds.includes(gateId) && !step.testing.gateIds.includes(gateId)) {
          throw localError('RESUME_GATE_REFERENCE_INVALID', 'Persisted gate result was not declared by the validated step', { stepId: step.id, gateId });
        }
        let gateResult;
        try { gateResult = JSON.parse(content); } catch { throw localError('RESUME_GATE_ARTIFACT_INVALID', 'Completed gate artifact is not valid JSON'); }
        if (gateResult.id !== gateId) throw localError('RESUME_GATE_ARTIFACT_INVALID', 'Gate artifact identity does not match its manifest', { stepId: step.id, gateId });
        if (gateResult.passed !== true) continue;
        const attempt = state.attempts.find((entry) => entry.id === stateRef.provenance.attemptId)?.number;
        const logicalRef = logicalGateRequirements(step, gateId)
          .find((requirement) => aggregateArtifactId(requirement.resultRef) === stateRef.id)?.resultRef || manifestRef.id;
        const artifact = { ...manifestRef, id: logicalRef, physicalId: manifestRef.id, fresh: true, passed: true, provenance: { ...manifestRef.provenance, attemptId: stateRef.provenance.attemptId, attempt } };
        gateArtifacts.set(`${step.id}:${attempt || 0}:${gateId}:${logicalRef}`, artifact);
        persistedEvidenceGates.set(`${step.id}:${gateId}:${logicalRef}`, { id: gateId, passed: true, resultRef: logicalRef });
      }
      const reviewRef = [...state.artifacts].reverse().find((entry) => entry.kind === 'review' && entry.provenance.stepId === step.id);
      if (reviewRef) {
        const value = modules.review.parseRoleOutput('reviewer', readPersistedArtifact(reviewRef).content);
        stepReviews.set(step.id, { ...value, review: value, artifactRef: reviewRef });
      }
      const records = [];
      for (const criterion of step.acceptanceCriteria) {
        for (const declared of criterion.evidence) {
          const requirement = modules.evidence.normalizeEvidenceRequirement(declared);
          const aggregate = persisted?.evidence.find((entry) => (
            entry.acceptanceCriterionId === criterion.id
            && entry.artifactId === aggregateArtifactId(requirement.resultRef)
          ));
          if (!aggregate) continue;
          const stateArtifact = state.artifacts.find((entry) => entry.id === aggregate.artifactId);
          if (!stateArtifact || stateArtifact.hash !== aggregate.hash) {
            throw localError('RESUME_EVIDENCE_ARTIFACT_MISSING', 'Persisted evidence has no verified artifact', { stepId: step.id, artifactId: aggregate.artifactId });
          }
          const persistedArtifact = readPersistedArtifact(stateArtifact).manifestRef;
          const artifact = {
            id: requirement.resultRef, hash: aggregate.hash, fresh: aggregate.fresh,
            provenance: {
              runId: stateArtifact.provenance.runId, stepId: step.id, attemptId: stateArtifact.provenance.attemptId,
              sourceHash: stateArtifact.provenance.sourceHash, factualIdentityHash: persistedArtifact.provenance?.factualIdentityHash,
              attempt: state.attempts.find((entry) => entry.id === stateArtifact.provenance.attemptId)?.number,
              persisted: true,
            },
          };
          persistedEvidenceArtifacts.set(artifact.id, artifact);
          if (['automated-test', 'contract-test', 'static-check'].includes(requirement.kind)) {
            if (!persistedEvidenceGates.has(`${step.id}:${requirement.gateId}:${requirement.resultRef}`)) throw localError('RESUME_EVIDENCE_GATE_MISSING', 'Persisted evidence references an incomplete gate');
          }
          records.push(canonicalEvidenceRecord(criterion.id, requirement, artifact));
        }
      }
      if (records.length > 0) stepEvidence.set(step.id, records);
    }
  }

  function persist() {
    if (ledger) state.usage = stateUsage();
    if (lock) {
      state.updatedAt = new Date().toISOString();
      modules.runtime.writeRunState(lock, state);
    }
  }

  function persistLedger(value) {
    const usage = structuredClone(value);
    state.usage = usage;
    state.updatedAt = new Date().toISOString();
    modules.runtime.writeRunState(lock, state);
  }

  function stateUsage() {
    return modules.budget.publicLedger(ledger);
  }

  function latestApproval(stepRecord) {
    if (!stepRecord.risk) return undefined;
    const checkpoint = stepRecord.state === 'AWAITING_PRE_APPROVAL' || stepRecord.state === 'READY'
      ? 'pre-execution'
      : stepRecord.state === 'AWAITING_DIFF_APPROVAL' || stepRecord.state === 'ACCEPTING'
        ? 'post-review' : null;
    return [...stepRecord.risk.requests].reverse().find((request) => !checkpoint || request.checkpoint === checkpoint);
  }

  function resumeContextFor(stepRecord) {
    const approval = latestApproval(stepRecord);
    const resumableApproval = approval?.checkpoint === 'post-review'
      && (approval.status === 'satisfied' || (approval.status === 'stale' && stepRecord.state === 'AWAITING_DIFF_APPROVAL'));
    if (!resumableApproval || !['ACCEPTING', 'AWAITING_DIFF_APPROVAL'].includes(stepRecord.state)) return undefined;
    const step = context.validation.steps.find((entry) => entry.id === stepRecord.id);
    const attempt = state.attempts.find((entry) => entry.id === approval.binding.attemptId);
    const worktreeRecord = state.worktrees.find((entry) => entry.id === approval.binding.worktreeId);
    const reviewResult = stepReviews.get(stepRecord.id);
    if (!step || !attempt || !worktreeRecord || !reviewResult) return undefined;
    const identity = factualIdentities.get(worktreeRecord.id)?.identity || captureWorktreeIdentity(worktreeRecord.path);
    factualIdentities.set(worktreeRecord.id, {
      worktreeId: worktreeRecord.id, attemptId: attempt.id, worktree: worktreeRecord.path, identity,
    });
    const diff = { ...modules.git.collectChanges({ cwd: worktreeRecord.path, baseSha: worktreeRecord.parentSha }), identity };
    const artifacts = [...gateArtifacts.values()].filter((artifact) => (
      artifact.provenance?.stepId === stepRecord.id && artifact.provenance?.attemptId === attempt.id
    ));
    const gates = [...new Set(artifacts.map((artifact) => artifact.provenance.gateId))].map((id) => {
      const owned = artifacts.filter((artifact) => artifact.provenance.gateId === id);
      return { id, ok: owned.every((artifact) => artifact.passed === true), passed: true, resultRef: owned[0]?.id, logicalRefs: owned.map((artifact) => artifact.id), artifacts: owned };
    });
    return {
      worktree: { path: worktreeRecord.path, baseSha: worktreeRecord.parentSha, headSha: worktreeRecord.headSha, attemptId: attempt.id, worktreeId: worktreeRecord.id },
      diff, gates, review: reviewResult,
    };
  }

  function runView() {
    const blockedSteps = state.steps.filter((step) => step.state === 'BLOCKED');
    const causeResolved = state.state === 'BLOCKED' && blockedSteps.every((step) => {
      const attempt = state.attempts.find((entry) => entry.id === step.attemptIds.at(-1));
      const maximum = context.validation.steps.find((entry) => entry.id === step.id)?.budgets.maxAttempts;
      return attempt?.failureClassification === 'transient' && attempt.number < maximum;
    });
    return {
      status: state.state,
      causeResolved,
      steps: state.steps.map((step) => ({
        id: step.id, status: step.state === 'ACCEPTED' ? 'AWAITING_COMMIT' : step.state, attempt: step.attemptIds.length,
        attemptId: step.attemptIds.at(-1), worktreeId: step.worktreeId,
        commit: state.commits.find((commit) => commit.stepId === step.id),
        approval: latestApproval(step), riskAssessment: step.risk?.assessment,
        resumeContext: resumeContextFor(step),
      })),
    };
  }

  function transitionRun(to, cause, preconditions = {}) {
    state = modules.stateMachine.transitionRun(state, to, { cause, lockHeld: true, ...preconditions });
  }

  function transitionStep(stepId, to, cause, preconditions = {}) {
    state = modules.stateMachine.transitionStep(state, stepId, to, { cause, lockHeld: true, ...preconditions });
  }

  function openRun(input) {
    context = input;
    if (input.resume) {
      state = modules.runtime.readRunState(lock);
      if (state.repo.baseSha !== input.validation.baseSha || state.spec.dagHash !== input.validation.dag.hash) {
        throw localError('RESUME_STATE_DRIFT', 'Persisted run does not match the validated workflow');
      }
      for (const worktree of state.worktrees.filter((entry) => entry.status === 'removal-pending')) {
        if (fs.existsSync(worktree.path)) {
          modules.git.removeAttemptWorktree({
            cwd: repoRoot, worktreePath: worktree.path, baseSha: worktree.parentSha,
            allowedHead: worktree.headSha, force: true,
          });
        }
        worktree.status = 'removed';
        worktree.removedAt = new Date().toISOString();
        const stepRecord = state.steps.find((entry) => entry.id === worktree.stepId);
        if (stepRecord?.worktreeId === worktree.id) stepRecord.worktreeId = null;
        const attempt = state.attempts.find((entry) => entry.id === stepRecord?.attemptIds.at(-1));
        const committed = typeof worktree.headSha === 'string' && worktree.headSha !== worktree.parentSha;
        if (!committed && attempt && !['failed', 'cancelled'].includes(attempt.status)) {
          attempt.status = 'cancelled';
          attempt.finishedAt ||= new Date().toISOString();
        }
      }
      persist();
      if (['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(state.state)) return runView();
      ledger = modules.budget.restoreBudgetLedger(
        input.validation.spec.budgets,
        Object.fromEntries(input.validation.steps.map((step) => [step.id, step.budgets])),
        state.usage,
        { now: options.now },
      );
      ensureStores();
      for (const stepRecord of state.steps) {
        const stepDefinition = input.validation.steps.find((entry) => entry.id === stepRecord.id);
        if (!stepDefinition) throw localError('RESUME_STATE_DRIFT', `Persisted step is not present in the validated workflow: ${stepRecord.id}`);
        for (const application of stepRecord.sandbox.applications) revalidateSandboxApplication(application, stepDefinition);
      }
      verifyPersistedArtifacts();
      rehydrateEvidence(input.validation);
      const decisions = {};
      for (const reservation of ledger.reservations.filter((entry) => ['reserved', 'reconciliation-required'].includes(entry.status))) {
        if (reservation.metric === 'attempts') {
          decisions[reservation.id] = state.attempts.some((entry) => entry.stepId === reservation.stepId
            && reservation.id === `reservation-${entry.stepId}-attempt-${entry.number}`)
            ? { status: 'consumed' } : { status: 'released' };
          continue;
        }
        const role = ['executor', 'reviewer', 'diagnostician'].find((candidate) => reservation.id.includes(`-${candidate}-`));
        if (role) {
          const number = reservation.id.match(/-(\d+)(?:-(?:local|global))?$/)?.[1] || 1;
          const operations = role === 'reviewer'
            ? [`${context.runId}-${reservation.stepId}-reviewer-${number}`, `${context.runId}-global-reviewer-${number}`]
            : [`${context.runId}-${reservation.stepId}-${role}-${number}`];
          const currentAttemptId = attemptId(reservation.stepId, Number(number));
          const response = operations.map((operationId) => {
            const application = state.steps.flatMap((step) => step.sandbox.applications)
              .find((entry) => entry.operationId === operationId);
            const stepDefinition = context.validation.steps.find((entry) => entry.id === reservation.stepId);
            if (!application || !stepDefinition) return null;
            revalidateSandboxApplication(application, stepDefinition);
            const expectedAttemptId = state.attempts.some((entry) => entry.id === currentAttemptId) ? currentAttemptId : null;
            return stores.artifacts.findAgentResponse(operationId, application.policyHash, expectedAttemptId);
          }).find(Boolean);
          if (response) {
            persistArtifactRef(response.artifactRef, {
              stepId: reservation.stepId, attemptId: state.attempts.some((entry) => entry.id === currentAttemptId) ? currentAttemptId : null,
              kind: role === 'reviewer' ? 'review' : role === 'diagnostician' ? 'diagnosis' : undefined,
              sourceHash: role === 'executor' ? executionSourceHash(context.validation.steps.find((entry) => entry.id === reservation.stepId)) : undefined,
            });
            const attempt = state.attempts.find((entry) => entry.id === currentAttemptId);
            if (attempt && role === 'executor') { attempt.status = 'succeeded'; attempt.finishedAt = new Date().toISOString(); }
            decisions[reservation.id] = { status: 'consumed', role, estimatedCost: null, tokens: null };
          }
        }
      }
      modules.budget.reconcilePendingReservations(ledger, decisions, persistLedger);
      const unresolved = ledger.reservations.filter((entry) => entry.status === 'reconciliation-required');
      if (unresolved.length > 0) {
        if (state.state !== 'BLOCKED') transitionRun('BLOCKED', 'budget reservation requires human reconciliation');
        persist();
        throw localError('BUDGET_RECONCILIATION_REQUIRED', 'Pending reservation outcome cannot be proven; human reconciliation is required', { reservationIds: [...new Set(unresolved.map((entry) => entry.id))] });
      }
      rehydrateEvidence(input.validation);
      return runView();
    }
    ledger = modules.budget.createBudgetLedger(
      input.validation.spec.budgets,
      Object.fromEntries(input.validation.steps.map((step) => [step.id, step.budgets])),
      { now: options.now },
    );
    state = modules.runtime.createInitialRunState(lock, {
      baseSha: input.validation.baseSha, parentSha: input.validation.baseSha,
      spec: { id: input.validation.spec.id, path: input.validation.specPath, ...sourceHashes(input.validation) },
      usage: stateUsage(), steps: initialSteps(input.validation), riskAssessments: input.validation.riskAssessments,
    });
    transitionRun('VALIDATED', 'workflow contracts validated');
    transitionRun('LOCKED', 'repository lock acquired');
    transitionRun('RUNNING', 'workflow execution started');
    persist();
    return runView();
  }

  // Checagem concreta de drift acionada pelo checkedRevalidation do orchestrator: confirma hashes de
  // fonte, base SHA, hash combinado dos catálogos, token/identidade do lock, pertencimento e HEAD dos
  // worktrees, identidade byte-a-byte e consistência do state persistido. Todos os checks têm de ser
  // true — assertFullRevalidation converte qualquer false em REVALIDATION_DRIFT (fail-closed).
  async function revalidate(input) {
    const checks = { hashes: false, base: false, catalog: false, lock: false, worktree: false, identity: false, state: false, artifacts: false };
    const facts = {};
    try {
      const currentHashes = sourceHashes(input.validation);
      checks.hashes = Object.entries(currentHashes).every(([name, value]) => state ? state.spec[name] === value : value !== undefined);
      facts.hashes = currentHashes;
      const base = modules.git.validateBase({
        cwd: repoRoot, baseSha: input.validation.baseSha, baseBranch: await branchName(), approved: true,
      });
      checks.base = base.baseSha === input.validation.baseSha;
      facts.base = { expected: input.validation.baseSha, actual: base.baseSha };
      const catalog = await modules.catalogs.loadCatalogsFromGit(repoRoot, input.validation.baseSha);
      checks.catalog = catalog.ok && catalog.value.hashes.combined === input.validation.catalogs.hashes.combined;
      facts.catalog = { expected: input.validation.catalogs.hashes.combined, actual: catalog.value?.hashes.combined };
      const owner = JSON.parse(fs.readFileSync(path.join(input.lock.paths.lock, 'owner.json'), 'utf8'));
      checks.lock = owner.token === input.lock.owner.token && owner.repoIdentity === input.lock.repository.identity;
      facts.lock = { tokenMatched: owner.token === input.lock.owner.token, identityMatched: owner.repoIdentity === input.lock.repository.identity };

      const listedResult = await command('git', ['worktree', 'list', '--porcelain', '-z']);
      const listed = outputText(listedResult).split('\0').filter((line) => line.startsWith('worktree ')).map((line) => line.slice(9));
      const activeWorktrees = state.worktrees.filter((entry) => entry.status !== 'removed');
      const worktreeFacts = await Promise.all(activeWorktrees.map(async (entry) => {
        const member = listed.includes(entry.path) && fs.existsSync(entry.path);
        const headResult = member ? await command('git', ['rev-parse', 'HEAD'], entry.path) : null;
        const headSha = headResult?.ok ? outputText(headResult).trim() : null;
        const expectedHeads = [entry.parentSha, entry.headSha, state.commits.find((commit) => commit.stepId === entry.stepId)?.sha].filter(Boolean);
        const awaitingCommit = input.trigger === 'on-resume' && state.steps.find((step) => step.id === entry.stepId)?.state === 'ACCEPTED';
        return { path: entry.path, member, headSha, parentSha: entry.parentSha, headAccepted: expectedHeads.includes(headSha) || awaitingCommit };
      }));
      checks.worktree = worktreeFacts.every((entry) => entry.member && entry.headAccepted);
      facts.worktrees = worktreeFacts;
      const identityFacts = [...factualIdentities.values()].map((entry) => {
        const actual = captureWorktreeIdentity(entry.worktree);
        return {
          worktreeId: entry.worktreeId, attemptId: entry.attemptId,
          expected: entry.identity.hash, actual: actual.hash, matched: actual.hash === entry.identity.hash,
        };
      });
      checks.identity = identityFacts.every((entry) => entry.matched);
      facts.identities = identityFacts;
      if (input.worktreeId) {
        const selected = factualIdentities.get(input.worktreeId);
        if (selected) {
          const worktree = state.worktrees.find((entry) => entry.id === input.worktreeId);
          const attempt = state.attempts.find((entry) => entry.id === input.attemptId);
          if (selected.attemptId !== input.attemptId || !worktree || !attempt
            || worktree.stepId !== attempt.stepId || worktree.stepId !== input.step?.id) {
            checks.identity = false;
          } else {
            facts.identity = identityFacts.find((entry) => entry.worktreeId === input.worktreeId && entry.attemptId === input.attemptId);
          }
        }
      }

      const persisted = modules.runtime.readRunState(lock);
      const reservationsValid = persisted.usage.reservations.every((entry) => ['reserved', 'consumed', 'released', 'reconciliation-required'].includes(entry.status));
      checks.state = persisted.revision === persisted.transitions.length && persisted.revision === state.revision
        && persisted.usage.revision === state.usage.revision && reservationsValid;
      facts.state = {
        revision: persisted.revision, transitions: persisted.transitions.length,
        usageRevision: persisted.usage.revision, reservations: persisted.usage.reservations.length,
      };
      const refs = [...persisted.artifacts, ...gateArtifacts.values()];
      checks.artifacts = refs.every((ref) => {
        try {
          if (ref.kind === 'snapshot') readClosedSnapshot(ref);
          else if (persisted.artifacts.some((entry) => entry.id === ref.id)) readPersistedArtifact(ref);
          else ensureStores().artifacts.read(ref.physicalId ? { ...ref, id: ref.physicalId } : ref);
          return true;
        } catch { return false; }
      });
      facts.artifacts = { checked: refs.length, valid: checks.artifacts };
    } catch (error) {
      facts.error = { code: error.code || 'REVALIDATION_CHECK_FAILED', message: error.message };
      // The complete check result is returned so the orchestrator can block with one drift error.
    }
    const result = { trigger: input.trigger || 'unspecified', ok: Object.values(checks).every(Boolean), fresh: Object.values(checks).every(Boolean), checks, facts };
    result.aggregateIdentityHash = hash(identityFactsFor(result));
    result.identityHash = result.facts.identity?.actual
      || (factualIdentities.size === 1 ? [...factualIdentities.values()][0].identity.hash : result.aggregateIdentityHash);
    ensureStores();
    const ref = stores.artifacts.preserve({
      stepId: 'global', attempt: input.attempt || 1, kind: `revalidation-${hash(result.trigger).slice(0, 16)}`,
      mediaType: 'application/json', content: result, provenance: { runId: context.runId, trigger: result.trigger },
    });
    persistArtifactRef(ref, { kind: 'stdout', sourceHash: executionSourceHash(null) });
    revalidations.push(result);
    persist();
    return result;
  }

  function identityFactsFor(result) {
    return result.facts.identities || [];
  }

  function persistCommitIntent(input, binding, intent) {
    const ref = ensureStores().artifacts.preserve({
      stepId: input.step.id, attempt: input.attempt, kind: 'accepted-tree', mediaType: 'application/json',
      content: { parentSha: intent.parentSha, acceptedTreeSha: intent.treeSha, acceptedPaths: intent.acceptedPaths, attemptId: binding.attemptId, worktreeId: binding.id },
      provenance: { runId: context.runId, stepId: input.step.id, attemptId: binding.attemptId, worktreeId: binding.id },
    });
    persistArtifactRef(ref, { stepId: input.step.id, attemptId: binding.attemptId, kind: 'commit', sourceHash: executionSourceHash(input.step) });
  }

  function baseApprovalBinding(step, assessment) {
    return {
      repoIdentity: state.repo.identity,
      runId: state.runId,
      baseSha: state.repo.baseSha,
      specHash: state.spec.hash,
      stepsHash: state.spec.stepsHash,
      stepId: step.id,
      stepHash: step.source.hash,
      policyHash: assessment.policy.hash,
      assessmentHash: assessment.hash,
    };
  }

  function preserveApprovalContext(input, requestId, content, attemptIdValue = null) {
    const kind = `approval-context-${requestId.slice(-48)}`;
    const ref = ensureStores().artifacts.preserve({
      stepId: input.step.id,
      attempt: input.attempt || 1,
      kind,
      mediaType: 'application/json',
      content,
      provenance: {
        runId: context.runId,
        stepId: input.step.id,
        attemptId: attemptIdValue,
        sourceHash: executionSourceHash(input.step),
      },
      sensitivity: 'restricted',
    });
    if (ref.truncation) throw localError('HITL_APPROVAL_CONTEXT_TRUNCATED', 'Approval context must be preserved completely');
    return persistArtifactRef(ref, {
      logicalRef: `approval-context:${requestId}`,
      stepId: input.step.id,
      attemptId: attemptIdValue,
      kind: 'approval-context',
      sourceHash: executionSourceHash(input.step),
    });
  }

  function approvalRequestId(stepRecord, baseId) {
    const previous = stepRecord.risk.requests.filter((request) => (
      request.id === baseId || request.id.startsWith(`${baseId}-renewal-`)
    ));
    const pending = [...previous].reverse().find((request) => request.status === 'pending');
    if (pending) return { id: pending.id, existing: pending };
    return {
      id: previous.length === 0 ? baseId : `${baseId}-renewal-${previous.length + 1}`,
      existing: null,
    };
  }

  function approvalContextBase(input, requestId, binding) {
    return {
      runId: state.runId,
      requestId,
      binding,
      resumeCommand: `./scripts/workflow/resume-spec.sh ${context.validation.specPath} --base-sha ${state.repo.baseSha} --decision-file <path|->`,
      validDecisions: [
        { outcome: 'approved', nextAction: null },
        { outcome: 'rejected', nextAction: 'retry' },
        { outcome: 'rejected', nextAction: 'replan' },
        { outcome: 'rejected', nextAction: 'abort' },
      ],
    };
  }

  function createPreApproval(input, stepRecord) {
    const assessment = stepRecord.risk?.assessment;
    if (!assessment || (!input.renewStale && input.assessment?.hash !== assessment.hash)) {
      throw localError('HITL_ASSESSMENT_STALE', 'Pre-execution approval requires the current persisted risk assessment');
    }
    const baseRequestId = `approval-${input.step.id}-pre-execution-${input.attempt || 1}`;
    const selected = approvalRequestId(stepRecord, baseRequestId);
    if (selected.existing) return selected.existing;
    const requestId = selected.id;
    const binding = baseApprovalBinding(input.step, assessment);
    const contextArtifact = preserveApprovalContext(input, requestId, {
      ...approvalContextBase(input, requestId, binding),
      checkpoint: 'pre-execution',
      step: { id: input.step.id, goal: input.step.goal, schemaVersion: input.step.schemaVersion, changeType: input.step.changeType || null },
      risk: { baseLevel: assessment.baseLevel, effectiveLevel: assessment.effectiveLevel, matchedAreaRules: assessment.matchedAreaRules, signals: assessment.signals, legacySignal: assessment.legacySignal },
      predictedFiles: input.step.predictedFiles,
      allowedAreas: input.step.allowedAreas,
    });
    const request = hitlDecision.createApprovalRequest({
      id: requestId,
      checkpoint: 'pre-execution',
      contextArtifactRef: contextArtifact.id,
      binding,
      createdAt: new Date().toISOString(),
    });
    stepRecord.risk.requests.push(request);
    if (!input.renewStale) {
      transitionStep(input.step.id, 'AWAITING_PRE_APPROVAL', 'pre-execution risk approval required', { preApprovalRequestPending: true });
    }
    modules.budget.pauseBudget(ledger, persistLedger);
    persist();
    return request;
  }

  function createPostReviewApproval(input, stepRecord) {
    const assessment = stepRecord.risk?.assessment;
    if (!assessment || (!input.renewStale && input.assessment?.hash !== assessment.hash)) {
      throw localError('HITL_ASSESSMENT_STALE', 'Post-review approval requires the current persisted risk assessment');
    }
    const binding = boundWorktree(input);
    const baseRequestId = `approval-${input.step.id}-post-review-${input.attempt}`;
    const selected = approvalRequestId(stepRecord, baseRequestId);
    if (selected.existing) return selected.existing;
    const requestId = selected.id;
    const patch = completeWorktreeDiff(binding.path);
    const rawDiff = ensureStores().artifacts.preserve({
      stepId: input.step.id,
      attempt: input.attempt,
      kind: `approval-diff-${input.attempt}`,
      mediaType: 'text/plain',
      content: patch,
      provenance: { runId: context.runId, stepId: input.step.id, attemptId: binding.attemptId, sourceHash: executionSourceHash(input.step) },
      sensitivity: 'restricted',
    });
    if (rawDiff.truncation) throw localError('HITL_DIFF_TRUNCATED', 'Post-review approval requires the complete diff');
    const diffArtifact = persistArtifactRef(rawDiff, {
      logicalRef: `approval-diff:${requestId}`,
      stepId: input.step.id,
      attemptId: binding.attemptId,
      kind: 'diff',
      sourceHash: executionSourceHash(input.step),
    });
    const reviewArtifact = input.review?.artifactRef;
    const persistedReview = state.artifacts.find((artifact) => artifact.id === reviewArtifact?.id && artifact.hash === reviewArtifact?.hash);
    if (!persistedReview) throw localError('HITL_REVIEW_ARTIFACT_MISSING', 'Post-review approval requires the exact persisted review artifact');
    const sanitizedDiff = readPersistedArtifact(diffArtifact).content;
    const requestBinding = {
      ...baseApprovalBinding(input.step, assessment),
      attemptId: binding.attemptId,
      parentSha: binding.parentSha,
      worktreeId: binding.id,
      worktreePath: binding.path,
      worktreeHeadSha: state.worktrees.find((entry) => entry.id === binding.id).headSha,
      factualIdentityHash: input.diff.identity.hash,
      diffArtifactId: diffArtifact.id,
      diffHash: diffArtifact.hash,
      snapshotSourceHash: persistedReview.provenance.sourceHash,
      reviewArtifactId: persistedReview.id,
      reviewHash: persistedReview.hash,
    };
    const contextArtifact = preserveApprovalContext(input, requestId, {
      ...approvalContextBase(input, requestId, requestBinding),
      checkpoint: 'post-review',
      step: { id: input.step.id, goal: input.step.goal, schemaVersion: input.step.schemaVersion, changeType: input.step.changeType || null },
      risk: { baseLevel: assessment.baseLevel, effectiveLevel: assessment.effectiveLevel, matchedAreaRules: assessment.matchedAreaRules, signals: assessment.signals, legacySignal: assessment.legacySignal },
      review: { decision: input.review.decision || input.review.review?.decision, summary: input.review.summary || input.review.review?.summary, findings: input.review.findings || input.review.review?.findings || [] },
      diff: sanitizedDiff,
    }, binding.attemptId);
    const request = hitlDecision.createApprovalRequest({
      id: requestId,
      checkpoint: 'post-review',
      contextArtifactRef: contextArtifact.id,
      binding: requestBinding,
      createdAt: new Date().toISOString(),
    });
    stepRecord.risk.requests.push(request);
    if (!input.renewStale) {
      transitionStep(input.step.id, 'AWAITING_DIFF_APPROVAL', 'post-review diff approval required', { reviewPassed: true, diffApprovalRequestPending: true });
    }
    modules.budget.pauseBudget(ledger, persistLedger);
    persist();
    return request;
  }

  function recordRiskSignals(input) {
    const stepRecord = state.steps.find((entry) => entry.id === input.step.id);
    if (!stepRecord?.risk) throw localError('RISK_ASSESSMENT_MISSING', 'Step has no persisted risk assessment');
    const previous = stepRecord.risk.assessment;
    const assessment = riskPolicy.assessRisk({
      policyRecord: context.validation.riskPolicy,
      step: input.step,
      signals: [...previous.signals, ...input.signals],
      previousEffectiveLevel: previous.effectiveLevel,
    });
    if (assessment.hash !== previous.hash) stepRecord.risk.assessmentHistory.push(previous);
    stepRecord.risk.assessment = { ...assessment, evaluatedAt: new Date().toISOString() };
    persist();
    return stepRecord.risk.assessment;
  }

  function currentApprovalBinding(stepRecord, request) {
    const step = context.validation.steps.find((entry) => entry.id === stepRecord.id);
    const base = baseApprovalBinding(step, stepRecord.risk.assessment);
    if (request.checkpoint === 'pre-execution') return base;
    const worktree = state.worktrees.find((entry) => entry.id === request.binding.worktreeId);
    const diff = state.artifacts.find((entry) => entry.id === request.binding.diffArtifactId);
    const reviewArtifact = state.artifacts.find((entry) => entry.id === request.binding.reviewArtifactId);
    if (!worktree || !diff || !reviewArtifact) return base;
    const factualIdentity = captureWorktreeIdentity(worktree.path);
    const currentDiff = sanitize(completeWorktreeDiff(worktree.path), { maxBytes: DEFAULT_MAX_BYTES });
    return {
      ...base,
      attemptId: request.binding.attemptId,
      parentSha: stepRecord.parentSha,
      worktreeId: worktree.id,
      worktreePath: worktree.path,
      worktreeHeadSha: worktree.headSha,
      factualIdentityHash: factualIdentity.hash,
      diffArtifactId: diff.id,
      diffHash: currentDiff.truncated ? '0'.repeat(64) : hash(currentDiff.content),
      snapshotSourceHash: reviewArtifact.provenance.sourceHash,
      reviewArtifactId: reviewArtifact.id,
      reviewHash: reviewArtifact.hash,
    };
  }

  function discardUncommittedAttempt(stepRecord) {
    const worktree = state.worktrees.find((entry) => entry.id === stepRecord.worktreeId);
    if (!worktree || worktree.status === 'removed') return;
    if (worktree.status === 'committed') {
      throw localError('HITL_ATTEMPT_ALREADY_COMMITTED', 'A committed attempt cannot be discarded by a risk decision');
    }
    worktree.status = 'removal-pending';
    const attempt = state.attempts.find((entry) => entry.id === stepRecord.attemptIds.at(-1));
    if (attempt && !['failed', 'cancelled'].includes(attempt.status)) {
      attempt.status = 'cancelled';
      attempt.finishedAt ||= new Date().toISOString();
    }
    stepRecord.worktreeId = null;
    persist();
    modules.git.removeAttemptWorktree({
      cwd: repoRoot, worktreePath: worktree.path, baseSha: worktree.parentSha, force: true,
    });
    options.afterDiscardEffect?.(worktree);
    worktree.status = 'removed';
    worktree.removedAt = new Date().toISOString();
    persist();
  }

  async function consumeDecision(input) {
    const decision = readDecisionFile(input.decisionFile, options.decisionInput);
    const stepRecord = state.steps.find((entry) => entry.risk?.requests.some((request) => request.id === decision.requestId));
    const request = stepRecord?.risk.requests.find((entry) => entry.id === decision.requestId);
    if (!stepRecord || !request) throw localError('HITL_REQUEST_MISMATCH', 'Decision targets no approval request in this run');
    const existing = stepRecord.risk.decisions.find((entry) => entry.requestId === request.id);
    const transitionId = existing?.consumedByTransitionId || `transition-${crypto.randomBytes(12).toString('hex')}`;
    const result = hitlDecision.applyApprovalDecision({
      request,
      decisions: stepRecord.risk.decisions,
      decision,
      currentBinding: currentApprovalBinding(stepRecord, request),
      decisionId: `decision-${crypto.randomBytes(12).toString('hex')}`,
      transitionId,
      recordedAt: new Date().toISOString(),
    });
    if (!result.replayed) {
      stepRecord.risk.requests = stepRecord.risk.requests.map((entry) => entry.id === request.id ? result.request : entry);
      stepRecord.risk.decisions.push(result.decision);
      if (result.classification === 'satisfied') {
        transitionStep(stepRecord.id, request.checkpoint === 'pre-execution' ? 'READY' : 'ACCEPTING', 'risk approval satisfied', {
          id: transitionId, approvalSatisfied: true, revalidated: true,
        });
      } else if (result.classification === 'rejected') {
        const next = decision.nextAction;
        if (next === 'retry') {
          const attempts = state.usage.perStep.find((entry) => entry.stepId === stepRecord.id)?.counters.attempts;
          if (!attempts || attempts.consumed + attempts.reserved >= attempts.limit) {
              throw localError('BUDGET_EXCEEDED', 'Rejected step has no attempt budget for retry');
          }
          transitionStep(stepRecord.id, 'RETRY_PENDING', 'risk approval rejected for retry', {
            id: transitionId, approvalRejected: true, rejectionActionRetry: true, retryEligible: true, budgetAvailable: true,
          });
          discardUncommittedAttempt(stepRecord);
        } else if (next === 'replan') {
          transitionStep(stepRecord.id, 'CANCELLED', 'risk approval rejected for replanning', {
            id: transitionId, approvalRejected: true, rejectionActionCancel: true, rejectionActionReplan: true,
          });
          if (state.state !== 'CANCELLED') transitionRun('CANCELLED', 'risk replanning required');
          discardUncommittedAttempt(stepRecord);
        } else {
          transitionStep(stepRecord.id, 'CANCELLED', 'risk approval rejected and run aborted', {
            id: transitionId, approvalRejected: true, rejectionActionCancel: true, rejectionActionAbort: true,
          });
          if (state.state !== 'CANCELLED') transitionRun('CANCELLED', 'risk approval aborted the run');
        }
      }
      persist();
    }
    return { classification: result.classification, nextAction: decision.nextAction, state: runView() };
  }

  function checkpoint(input) {
    const stepId = input.step?.id;
    if (!stepId) {
      if (['SUCCEEDED', 'FAILED', 'CANCELLED'].includes(input.status) && ledger) {
        modules.budget.pauseBudget(ledger, persistLedger);
      }
      if (input.status === 'BLOCKED' && state.state !== 'BLOCKED') transitionRun('BLOCKED', input.cause?.code || 'run blocked');
      else if (input.status === 'RUNNING' && state.state === 'BLOCKED') {
        transitionRun('RUNNING', 'blocked cause resolved on resume', {
          resumeRequested: input.resumeRequested, causeResolved: input.causeResolved, revalidated: input.revalidated,
        });
      }
      else if (input.status && input.status !== state.state) transitionRun(input.status, `run ${input.status.toLowerCase()}`);
      persist();
      return;
    }
    const current = state.steps.find((entry) => entry.id === stepId).state;
    if (input.status === 'READY') {
      if (current === 'PENDING') transitionStep(stepId, 'READY', 'dependencies accepted', { dependenciesAccepted: true });
      else if (current === 'BLOCKED') {
        transitionStep(stepId, 'READY', 'blocked cause resolved on resume', {
          resumeRequested: true, causeResolved: true, revalidated: true,
        });
      }
      else if (current === 'RETRY_PENDING') {
        transitionStep(stepId, 'READY', 'retry decision permits another attempt', { retryApproved: true, revalidated: true });
      }
    } else if (input.status === 'AWAITING_PRE_APPROVAL' && current === 'READY') {
      return createPreApproval(input, state.steps.find((entry) => entry.id === stepId));
    } else if (input.status === 'AWAITING_PRE_APPROVAL' && current === 'AWAITING_PRE_APPROVAL' && input.renewStale) {
      return createPreApproval(input, state.steps.find((entry) => entry.id === stepId));
    } else if (input.status === 'EXECUTING' && current === 'READY') {
      transitionStep(stepId, 'WORKTREE_READY', 'attempt worktree created', { worktreeReady: true });
      transitionStep(stepId, 'EXECUTING', 'agent call revalidated', { revalidated: true });
    } else if (input.status === 'GATING' && current === 'EXECUTING') {
      transitionStep(stepId, 'GATING', 'execution succeeded', { executionSucceeded: true });
    } else if (input.status === 'REVALIDATING' && current === 'GATING') {
      transitionStep(stepId, 'REVALIDATING', 'gates passed', { gatesPassed: true });
    } else if (input.status === 'REVIEWING' && current === 'REVALIDATING') {
      transitionStep(stepId, 'REVIEWING', 'evidence revalidated', { revalidated: true });
    } else if (input.status === 'AWAITING_DIFF_APPROVAL' && current === 'REVIEWING') {
      return createPostReviewApproval(input, state.steps.find((entry) => entry.id === stepId));
    } else if (input.status === 'AWAITING_DIFF_APPROVAL' && current === 'AWAITING_DIFF_APPROVAL' && input.renewStale) {
      return createPostReviewApproval(input, state.steps.find((entry) => entry.id === stepId));
    } else if (input.status === 'ACCEPTING' && current === 'REVIEWING') {
      transitionStep(stepId, 'ACCEPTING', 'review passed', { reviewPassed: true });
    } else if (input.status === 'AWAITING_COMMIT' && current === 'ACCEPTING') {
      const worktree = input.worktree.path || input.worktree;
      const binding = boundWorktree(input);
      let reviewedIdentity = reviewedIdentityFor(binding, input);
      if (!reviewedIdentity) {
        reviewedIdentity = captureWorktreeIdentity(worktree);
        factualIdentities.set(binding.id, { worktreeId: binding.id, attemptId: binding.attemptId, worktree, identity: reviewedIdentity });
      }
      assertWorktreeIdentity(worktree, reviewedIdentity);
      const acceptedPaths = changedPaths(input.diff.changes);
      if (acceptedPaths.length > 0) {
        const intent = modules.git.preflightCommit({
          cwd: worktree,
          parentSha: input.worktree.baseSha,
          acceptedPaths,
          predictedFiles: input.step.predictedFiles,
        });
        persistCommitIntent(input, binding, intent);
      }
      modules.budget.pauseBudget(ledger, persistLedger);
      transitionStep(stepId, 'ACCEPTED', 'local acceptance passed; human commit required', { acceptancePassed: true });
    } else if (input.status === 'AWAITING_HUMAN' && current === 'ACCEPTING') {
      modules.budget.pauseBudget(ledger, persistLedger);
      transitionStep(stepId, 'BLOCKED', input.cause?.code || 'human acceptance decision required');
      if (state.state !== 'BLOCKED') transitionRun('BLOCKED', input.cause?.code || 'human acceptance decision required');
    } else if (input.status === 'RETRY_PENDING' && ['EXECUTING', 'GATING', 'REVALIDATING', 'REVIEWING', 'ACCEPTING'].includes(current)) {
      transitionStep(stepId, 'RETRY_PENDING', 'attempt failed', { retryEligible: true, budgetAvailable: true });
    } else if (input.status === 'DIAGNOSING' && current === 'RETRY_PENDING') {
      transitionStep(stepId, 'DIAGNOSING', 'equivalent transient failure requires diagnosis', { budgetAvailable: true, diagnosisReserved: true });
    } else if (input.status === 'READY' && current === 'DIAGNOSING') {
      transitionStep(stepId, 'READY', 'diagnosis permits retry', { diagnosisAllowsRetry: true, revalidated: true });
    } else if (input.status === 'BLOCKED' && current !== 'BLOCKED') {
      transitionStep(stepId, 'BLOCKED', input.cause?.code || 'step blocked');
      const worktreeRecord = state.worktrees.find((entry) => entry.id === state.steps.find((entry) => entry.id === stepId).worktreeId);
      if (worktreeRecord) worktreeRecord.status = 'dirty';
      if (state.state !== 'BLOCKED') transitionRun('BLOCKED', input.cause?.code || 'step blocked');
    } else if (input.status === 'COMMITTING' && current === 'ACCEPTING') {
      // acceptance evidence already persisted by acceptStep; commitStep transitions to ACCEPTED atomically
    } else if (input.status === 'COMMITTED' && current === 'ACCEPTED') {
      transitionStep(stepId, 'COMMITTED', 'authorized commit created', { commitAuthorized: true, commitCreated: true });
      const record = { id: `commit-${stepId}`, stepId, ...input.commit, createdAt: new Date().toISOString() };
      state.commits = [...state.commits.filter((entry) => entry.stepId !== stepId), record];
      state.steps.find((entry) => entry.id === stepId).commitIds = [record.id];
    }
    persist();
  }

  function parentSha() {
    return state.commits.at(-1)?.sha || context.validation.baseSha;
  }

  function createAttempt(input) {
    const reservationId = `reservation-${input.step.id}-attempt-${input.attempt}`;
    const reserved = modules.budget.reserveBudget(ledger, { stepId: input.step.id, action: 'attempt', reservationId }, persistLedger);
    if (!reserved.ok) throw localError(reserved.blocked.code, 'Attempt budget unavailable', reserved.blocked);
    modules.budget.reconcileReservation(ledger, reservationId, { status: 'consumed' }, persistLedger);
    const currentAttemptId = attemptId(input.step.id, input.attempt);
    const startedAt = new Date().toISOString();
    state.attempts.push({
      id: currentAttemptId, stepId: input.step.id, number: input.attempt, role: 'executor', status: 'running',
      startedAt, finishedAt: null, artifactIds: [], failureClassification: null, sandboxPolicyHash: null,
    });
    const worktree = modules.git.createAttemptWorktree({ cwd: repoRoot, runtimeRoot: runtimeRoot(), attemptId: currentAttemptId, baseSha: parentSha() });
    const stepRecord = state.steps.find((entry) => entry.id === input.step.id);
    stepRecord.attemptIds.push(currentAttemptId);
    stepRecord.worktreeId = `worktree-${input.step.id}-${input.attempt}`;
    stepRecord.parentSha = worktree.baseSha;
    state.worktrees.push({
      id: stepRecord.worktreeId, stepId: input.step.id, path: worktree.path, parentSha: worktree.baseSha,
      headSha: worktree.headSha, status: 'active', createdAt: new Date().toISOString(), removedAt: null,
    });
    persist();
    return { ...worktree, attemptId: currentAttemptId, worktreeId: stepRecord.worktreeId };
  }

  function boundWorktree(input) {
    const stepId = input.step?.id || input.id;
    const requestedAttemptId = input.attemptId || input.worktree?.attemptId;
    const requestedWorktreeId = input.worktreeId || input.worktree?.worktreeId;
    if (!stepId || !requestedAttemptId || !requestedWorktreeId) throw localError('ATTEMPT_BINDING_REQUIRED', 'Operation requires explicit attemptId and worktreeId');
    const attempt = state.attempts.find((entry) => entry.id === requestedAttemptId && entry.stepId === stepId);
    const record = state.worktrees.find((entry) => entry.id === requestedWorktreeId && entry.stepId === stepId);
    if (!attempt || !record || (input.attempt && attempt.number !== input.attempt)) throw localError('ATTEMPT_BINDING_INVALID', 'Operation attempt/worktree binding does not match persisted state');
    const requestedPath = input.worktree?.path || input.worktree;
    if (requestedPath && fs.realpathSync(requestedPath) !== fs.realpathSync(record.path)) throw localError('ATTEMPT_BINDING_INVALID', 'Operation target does not match its bound worktree');
    return { ...record, attemptId: attempt.id, attempt: attempt.number, stateRecord: record };
  }

  function logicalGateRequirements(step, gateId) {
    const requirements = step.acceptanceCriteria.flatMap((criterion) => criterion.evidence || [])
      .map((declared) => modules.evidence.normalizeEvidenceRequirement(declared))
      .filter((requirement) => requirement.gateId === gateId && requirement.testSelector);
    return [...new Map(requirements.map((requirement) => [`${requirement.resultRef}:${requirement.testSelector}`, requirement])).values()];
  }

  function resolveResource(id) {
    const result = modules.catalogs.resolveResource({ ok: true, value: context.validation.catalogs }, id);
    if (!result.ok) throw localError(result.errors[0].code, result.errors[0].message);
    return result.value;
  }

  // Broad-but-bounded read for the gate sandbox (ADR 028, refined): the repo (worktree + node_modules
  // ancestral + scripts) plus read-only system prefixes, but never /Users broadly — so the toolchain
  // the gate spawns reads freely without a growing suppression list, while ~/.ssh, ~/.aws and other
  // home secrets stay unreadable. Containment remains network-empty + writes confined to the worktree.
  function gateReadPaths(target) {
    return [...new Set([repoRoot, target, ...GATE_SYSTEM_READ_PREFIXES.filter((prefix) => fs.existsSync(prefix))])];
  }

  // A minimal PATH keeps the sandboxed gate from probing the operator's full toolchain (mise shims,
  // extra language runtimes) at shell startup. Only the gate executable's own directory, git, and the
  // base system bin directories are exposed; subprocesses resolve from these.
  function gatePathEnv(executable) {
    const directories = [];
    for (const candidate of [executable, 'git']) {
      try { directories.push(path.dirname(modules.sandbox.resolveExecutable(candidate))); }
      catch { /* absent tool only narrows PATH */ }
    }
    return [...new Set([...directories, '/usr/bin', '/bin', '/usr/sbin', '/sbin'])].join(path.delimiter);
  }

  function agentGitPolicy(target) {
    const marker = path.join(target, '.git');
    if (!fs.existsSync(marker) || !fs.lstatSync(marker).isFile()) return null;
    const match = fs.readFileSync(marker, 'utf8').trim().match(/^gitdir:\s+(.+)$/);
    if (!match) throw localError('SANDBOX_GIT_INVALID', 'Worktree .git marker is invalid');
    const gitDirectory = fs.realpathSync(path.resolve(target, match[1]));
    const commonMarker = path.join(gitDirectory, 'commondir');
    const commonDirectory = fs.existsSync(commonMarker)
      ? fs.realpathSync(path.resolve(gitDirectory, fs.readFileSync(commonMarker, 'utf8').trim()))
      : gitDirectory;
    const sourceIndex = path.join(gitDirectory, 'index');
    const expectedHead = fs.readFileSync(path.join(gitDirectory, 'HEAD'), 'utf8').trim();
    if (!fs.existsSync(sourceIndex) || fs.readdirSync(gitDirectory).some((name) => name.startsWith('sharedindex.'))) {
      throw localError('SANDBOX_GIT_INDEX_UNSUPPORTED', 'Worktree requires a standalone Git index');
    }
    return {
      mode: 'private-ephemeral-v1', workTree: target,
      privateGitDir: path.join(target, '.workflow-sandbox', 'git'),
      objectDirectory: path.join(commonDirectory, 'objects'), sourceIndex, expectedHead,
      configProfile: 'status-only-v1',
    };
  }

  function agentReadPaths(resource, target, git) {
    // Resolved through PATH so the allowlist follows the host's actual git install; an absent git
    // only narrows the sandbox, and every stage that needs git has already proven it exists.
    let gitPaths = [];
    try { gitPaths = modules.sandbox.executableReadPaths('git'); } catch { /* narrower allowlist */ }
    return [target, ...(git ? [git.objectDirectory] : []), ...modules.sandbox.executableReadPaths(resource.executable), ...gitPaths];
  }

  function applySandboxPolicy({ step, role, resource, target, operationId }) {
    const writePaths = role === 'executor' ? step.allowedAreas : [];
    const git = role === 'executor' ? agentGitPolicy(target) : null;
    const policy = modules.sandbox.normalizeSandboxPolicy({
      role, resourceId: resource.id, target, git, readPaths: agentReadPaths(resource, target, git), writePaths,
      allowedDomains: resource.sandbox.networkDomains,
    });
    const stepRecord = state.steps.find((entry) => entry.id === step.id);
    const previous = stepRecord.sandbox.applications.find((entry) => entry.operationId === operationId);
    if (previous && previous.policyHash !== policy.policyHash) {
      throw localError('SANDBOX_POLICY_DRIFT', `Persisted sandbox policy changed for ${operationId}`, {
        expected: previous.policyHash, actual: policy.policyHash,
      });
    }
    if (!previous) {
      stepRecord.sandbox.applications.push({
        operationId, role, resourceId: resource.id, policyHash: policy.policyHash, policy,
        appliedAt: new Date().toISOString(),
      });
    }
    if (role === 'executor') {
      const attempt = state.attempts.find((entry) => entry.id === attemptId(step.id, Number(operationId.match(/-(\d+)$/)?.[1] || 1)));
      if (attempt) attempt.sandboxPolicyHash = policy.policyHash;
    }
    persist();
    return policy;
  }

  function revalidateSandboxApplication(application, step) {
    const resource = resolveResource(application.resourceId);
    const git = application.role === 'executor' ? agentGitPolicy(application.policy.filesystem.target) : null;
    let recomputed;
    try {
      recomputed = modules.sandbox.normalizeSandboxPolicy({
        role: application.role, resourceId: resource.id, target: application.policy.filesystem.target,
        git, readPaths: agentReadPaths(resource, application.policy.filesystem.target, git),
        writePaths: application.role === 'executor' ? step.allowedAreas : [],
        allowedDomains: resource.sandbox.networkDomains,
      });
    } catch (error) {
      throw localError('SANDBOX_POLICY_DRIFT', `Persisted sandbox policy cannot be reapplied for ${application.operationId}`, {
        cause: sanitize(error?.message || String(error), { maxBytes: 1024 }).content,
      });
    }
    if (recomputed.policyHash !== application.policyHash || JSON.stringify(recomputed) !== JSON.stringify(application.policy)) {
      throw localError('SANDBOX_POLICY_DRIFT', `Persisted sandbox policy changed for ${application.operationId}`, {
        expected: application.policyHash, actual: recomputed.policyHash,
      });
    }
    return recomputed;
  }

  async function invoke(input) {
    ensureStores();
    const role = input.role;
    const binding = boundWorktree(input);
    const worktree = binding.path;
    const resourceId = input.step.resources[role];
    const action = role === 'diagnostician' ? 'diagnosis' : 'agent-call';
    const reservationId = `reservation-${input.step.id}-${role}-${input.attempt}`;
    const reserved = modules.budget.reserveBudget(ledger, { stepId: input.step.id, action, reservationId }, persistLedger);
    if (!reserved.ok) throw localError(reserved.blocked.code, `${role} budget unavailable`, reserved.blocked);
    let reconciled = false;
    try {
      let before;
      let target = worktree;
      let sourceHash = executionSourceHash(input.step);
      if (role !== 'executor') {
        before = modules.review.captureGitState(worktree);
        modules.runtime.secureMkdir(repoRoot, path.join(runtimeRoot(), 'snapshots'));
        const sources = snapshotSources(worktree, input.step, input);
        sources.findings = input.failure ? [input.failure] : [];
        const snapshot = modules.review.createClosedSnapshot({
          worktree, snapshotRoot: path.join(runtimeRoot(), 'snapshots'), sources,
        });
        target = snapshot.path;
        sourceHash = snapshot.sourceHash;
      }
      const catalogResource = resolveResource(resourceId);
      const invokeResource = { ...catalogResource, executable: modules.sandbox.resolveExecutable(catalogResource.executable) };
      const agentAdapter = catalogResource.executable === 'agent' && cursorAgent ? cursorAgent : openCode;
      const operationId = `${context.runId}-${input.step.id}-${role}-${input.attempt}`;
      agentArtifactContext = {
        stepId: input.step.id, attempt: input.attempt, operationId, role,
        provenanceStepId: input.step.id, attemptId: attemptId(input.step.id, input.attempt), sourceHash,
      };
      const sandboxPolicy = applySandboxPolicy({ step: input.step, role, resource: invokeResource, target, operationId });
      agentArtifactContext.sandboxPolicyHash = sandboxPolicy.policyHash;
      const result = await agentAdapter.invoke({
        operationId, role, attempt: input.attempt, sandboxPolicy,
        resource: invokeResource, worktree: target,
        goal: role === 'diagnostician' ? `Diagnose failure ${input.failure?.code || 'unknown'}.` : input.step.goal,
        inScope: input.step.boundaries.inScope, outOfScope: input.step.boundaries.outOfScope,
        predictedFiles: role === 'executor' ? input.step.predictedFiles : [],
        allowedAreas: role === 'executor' ? input.step.allowedAreas : ['.'],
        acceptanceCriteria: input.step.acceptanceCriteria,
        context: role === 'executor' ? input.step.context : { snapshotSourceHash: sourceHash },
      });
      if (role !== 'executor' && before.hash !== modules.review.captureGitState(worktree).hash) {
        throw localError('READ_ONLY_MUTATION_DETECTED', `${role} changed its target worktree`);
      }
      modules.budget.reconcileReservation(ledger, reservationId, {
        status: 'consumed', role, estimatedCost: result.metrics?.estimatedCost, tokens: result.metrics?.tokens,
      }, persistLedger);
      reconciled = true;
      const attempt = state.attempts.find((entry) => entry.id === attemptId(input.step.id, input.attempt));
      persistArtifactRef(result.artifactRef, {
        stepId: input.step.id, attemptId: attempt?.id,
        kind: role === 'diagnostician' ? 'diagnosis' : undefined, sourceHash,
      });
      if (attempt && role === 'executor') { attempt.status = 'succeeded'; attempt.finishedAt = new Date().toISOString(); }
      persist();
      if (role === 'diagnostician') {
        return { ...result, diagnosis: modules.review.parseRoleOutput('diagnostician', stores.artifacts.read(result.artifactRef)) };
      }
      return result;
    } catch (error) {
      try {
        const violation = preserveSandboxViolation(error);
        const signals = riskSignals.sandboxSignals({
          error, evidenceRef: violation?.id,
          operationId: agentArtifactContext?.operationId,
          observedAt: new Date().toISOString(),
        });
        if (signals.length > 0) recordRiskSignals({ ...input, signals });
      } catch { /* audit persistence must not replace the sandbox failure */ }
      noteSandboxPoison(error);
      if (!reconciled) modules.budget.reconcileReservation(ledger, reservationId, { status: 'consumed', role, estimatedCost: null, tokens: null }, persistLedger);
      const attempt = state.attempts.find((entry) => entry.id === attemptId(input.step.id, input.attempt));
      if (attempt && role === 'executor') {
        attempt.status = 'failed'; attempt.finishedAt = new Date().toISOString();
        attempt.failureClassification = modules.retry.classifyFailure?.(error)?.classification || 'deterministic';
      }
      persist();
      const decision = modules.retry.retryDecision({ failures: [{ code: error.code, role }], maxAttempts: input.step.budgets.maxAttempts });
      error.details = { ...error.details, retry: decision };
      throw error;
    } finally {
      agentArtifactContext = undefined;
    }
  }

  function collectChanges(input) {
    const binding = boundWorktree(input);
    const changes = modules.git.collectChanges({ cwd: binding.path, baseSha: binding.parentSha });
    const identity = captureWorktreeIdentity(binding.path);
    factualIdentities.set(binding.id, { worktreeId: binding.id, attemptId: binding.attemptId, worktree: binding.path, identity });
    const ref = ensureStores().artifacts.preserve({
      stepId: input.step.id, attempt: input.attempt, kind: 'worktree-identity', mediaType: 'application/json', content: identity,
      provenance: { runId: context.runId, stepId: input.step.id, attemptId: binding.attemptId, worktreeId: binding.id, sourceHash: executionSourceHash(input.step) },
    });
    persistArtifactRef(ref, { stepId: input.step.id, attemptId: binding.attemptId, kind: 'stdout', sourceHash: executionSourceHash(input.step) });
    persist();
    return { ...changes, identity };
  }

  async function runGate(input) {
    ensureStores();
    const binding = boundWorktree(input);
    if (!factualIdentities.has(binding.id)) {
      factualIdentities.set(binding.id, {
        worktreeId: binding.id, attemptId: binding.attemptId, worktree: binding.path, identity: captureWorktreeIdentity(binding.path),
      });
    }
    const resolved = modules.catalogs.resolveGate({ ok: true, value: context.validation.catalogs }, input.id);
    if (!resolved.ok) throw localError(resolved.errors[0].code, resolved.errors[0].message);
    const gate = resolved.value;
    const artifactStepId = input.scope === 'global' ? 'global' : input.step.id;
    // Roteamento do gate: `mcp` consulta um servidor MCP (conhecimento externo); caso contrário é um
    // gate executável (script + argv) num ambiente isolado (HOME/TMPDIR temporários). Os dois
    // preservam um artifact sanitizado com provenance, incluindo o factualIdentityHash do worktree.
    if (gate.type === 'mcp') {
      const server = resolveResource(gate.server);
      const mcpResult = await mcpModule.runMcpGate({
        server, tool: gate.tool, args: gate.args, worktree: binding.path,
        timeoutMs: gate.timeoutMs, maxOutputBytes: gate.maxOutputBytes,
      });
      const ref = stores.artifacts.preserve({
        stepId: artifactStepId, attempt: input.attempt, kind: `gate-${input.id}`, mediaType: 'application/json',
        content: { id: input.id, server: server.id, tool: gate.tool, args: gate.args, passed: mcpResult.ok === true, content: mcpResult.content, process: mcpResult.process, isolation: { home: 'isolated-temporary', temporaryDirectory: 'isolated-temporary', inheritedEnvironment: ['PATH'], networkSandbox: false } },
        provenance: { runId: context.runId, stepId: input.scope === 'global' ? null : input.step.id, gateId: input.id, baseSha: binding.parentSha, attemptId: input.scope === 'global' ? null : binding.attemptId, worktreeId: binding.id, scope: input.scope || 'local', sourceHash: executionSourceHash(input.scope === 'global' ? null : input.step), factualIdentityHash: factualIdentities.get(binding.id)?.identity.hash },
      });
      const mcpArtifact = { ...ref, fresh: true, passed: true, provenance: { ...ref.provenance, attempt: binding.attempt, factualIdentityHash: factualIdentities.get(binding.id)?.identity.hash } };
      persistArtifactRef(ref, {
        stepId: input.scope === 'global' ? null : input.step.id, attemptId: input.scope === 'global' ? null : binding.attemptId,
        kind: 'gate-result', sourceHash: ref.provenance.sourceHash,
      });
      persist();
      return { ok: true, passed: true, resultRef: ref.id, artifact: mcpArtifact, artifacts: [mcpArtifact], isolation: { home: 'isolated-temporary', temporaryDirectory: 'isolated-temporary', inheritedEnvironment: ['PATH'], networkSandbox: false }, attemptId: binding.attemptId, worktreeId: binding.id };
    }
    const resource = resolveResource(gate.resourceId);
    if (!resource.gateSandbox) throw localError('GATE_SANDBOX_REQUIRED', `Gate resource ${resource.id} declares no gate sandbox policy`, { resourceId: resource.id, gateId: input.id });
    const activeWorktrees = state?.worktrees?.filter((entry) => entry.status !== 'removed') || [];
    const location = gateExecutionLocation(gate, binding.path, repoRoot, activeWorktrees.length > 0);
    ensureStores();
    // An executable, non-MCP gate runs worktree code, so it goes through the same sandbox port as the
    // agents but under the asymmetric gate policy (ADR 028): broad-but-bounded read, no network,
    // writes confined to the worktree, sockets denied. The runner owns the ephemeral HOME/TMPDIR and
    // cleanup; a violation or unproven cleanup fails the gate closed, never falls back to direct exec.
    const gatePolicy = modules.sandbox.normalizeSandboxPolicy({
      role: 'gate', resourceId: resource.id, target: location.root,
      readPaths: gateReadPaths(fs.realpathSync(location.root)), writePaths: [location.root], allowedDomains: [],
    });
    const result = await sandboxedProcessRunner({
      policy: gatePolicy, executable: modules.sandbox.resolveExecutable(gate.executable), args: gate.args,
      env: { PATH: gatePathEnv(gate.executable) },
      timeoutMs: gate.timeoutMs, maxOutputBytes: gate.maxOutputBytes,
    });
    const isolation = { home: 'isolated-temporary', temporaryDirectory: 'isolated-temporary', inheritedEnvironment: ['PATH'], networkSandbox: true, policyHash: gatePolicy.policyHash };
    const factualIdentityHash = factualIdentities.get(binding.id)?.identity.hash;
    const ref = stores.artifacts.preserve({
      stepId: artifactStepId, attempt: input.attempt, kind: `gate-${input.id}`, mediaType: 'application/json',
      content: { id: input.id, process: gateProcessSummary(result), passed: result.ok, isolation },
       provenance: { runId: context.runId, stepId: input.scope === 'global' ? null : input.step.id, gateId: input.id, baseSha: binding.parentSha, cwdPolicy: location.policy, executionRoot: location.root, attemptId: input.scope === 'global' ? null : binding.attemptId, worktreeId: binding.id, scope: input.scope || 'local', sourceHash: executionSourceHash(input.scope === 'global' ? null : input.step), factualIdentityHash },
    });
    const logicalRefs = input.scope === 'global' ? [ref.id]
      : [...new Set(logicalGateRequirements(input.step, input.id).map((requirement) => requirement.resultRef))];
    if (logicalRefs.length === 0) logicalRefs.push(ref.id);
    const artifacts = logicalRefs.map((logicalRef) => ({
      ...ref, id: logicalRef, physicalId: ref.id, fresh: true, passed: result.ok === true,
      provenance: { ...ref.provenance, attempt: binding.attempt, factualIdentityHash },
    }));
    const scopeKey = input.scope === 'global' ? 'global' : input.step.id;
    for (const artifact of artifacts) {
      gateArtifacts.set(`${scopeKey}:${binding.attempt}:${input.id}:${artifact.id}`, artifact);
      persistArtifactRef(ref, {
        logicalRef: artifact.id, stepId: input.scope === 'global' ? null : input.step.id,
        attemptId: input.scope === 'global' ? null : binding.attemptId, kind: 'gate-result',
        sourceHash: ref.provenance.sourceHash,
      });
    }
    persist();
    return { ok: result.ok, passed: result.ok, resultRef: logicalRefs[0], logicalRefs, artifact: artifacts[0], artifacts, isolation, attemptId: binding.attemptId, worktreeId: binding.id };
  }

  function snapshotSources(worktree, step, extra = {}) {
    const required = loadReviewContext(worktree, context.validation, step);
    return {
      spec: required.spec, step: step ? required.steps[0] : required.steps, steps: required.steps,
      boundaries: step?.boundaries || context.validation.steps.map((entry) => entry.boundaries),
      invariants: step?.boundaries?.inScope || context.validation.steps.map((entry) => entry.boundaries.inScope),
      acceptanceCriteria: step?.acceptanceCriteria || context.validation.spec.acceptanceCriteria,
      adrs: required.adrs, agents: { applicable: required.agents, contracts: required.contracts },
      notes: context.validation.spec.implementationNotes || [], diff: extra.diff || {}, gates: extra.gates || [],
      revalidation: extra.latestRevalidation || extra.revalidations?.at(-1), artifacts: [...gateArtifacts.values()], evidence: [], findings: [],
    };
  }

  async function reviewerCall(input, snapshot, targetWorktree, step) {
    ensureStores();
    const postRun = context.mode === 'review';
    const budgetStep = step || context.validation.steps.at(-1);
    const reviewAttempt = input.attempt || state.attempts.filter((entry) => entry.stepId === budgetStep.id).at(-1)?.number || 1;
    const reservationId = `reservation-${budgetStep.id}-reviewer-${reviewAttempt}-${step ? 'local' : 'global'}`;
    if (!postRun) {
      const reserved = modules.budget.reserveBudget(ledger, { stepId: budgetStep.id, action: 'review', reservationId }, persistLedger);
      if (!reserved.ok) throw localError(reserved.blocked.code, 'Reviewer budget unavailable', reserved.blocked);
    }
    const before = modules.review.captureGitState(targetWorktree);
    let reconciled = false;
    try {
      const reviewOperationId = input.snapshot?.reviewOperationId || postRunReview?.id;
      if (postRun && postRunReview) postRunReview.attempt = reviewAttempt;
      agentArtifactContext = {
        stepId: reviewOperationId || (step ? budgetStep.id : 'global'), attempt: reviewAttempt,
        runId: context.runId, provenanceStepId: step ? budgetStep.id : null,
        attemptId: step ? attemptId(budgetStep.id, reviewAttempt) : null, sourceHash: snapshot.sourceHash,
        reviewOperationId, originalSnapshotHash: input.snapshot?.hash,
      };
      const catalogResource = resolveResource(step?.resources.reviewer || 'opencode-reviewer');
      const reviewResource = { ...catalogResource, executable: modules.sandbox.resolveExecutable(catalogResource.executable) };
      const reviewAdapter = catalogResource.executable === 'agent' && cursorAgent ? cursorAgent : openCode;
      const operationId = reviewOperationId || `${context.runId}-${step?.id || 'global'}-reviewer-${reviewAttempt}`;
      Object.assign(agentArtifactContext, { operationId, role: 'reviewer' });
      const sandboxPolicy = applySandboxPolicy({ step: budgetStep, role: 'reviewer', resource: reviewResource, target: snapshot.path, operationId });
      agentArtifactContext.sandboxPolicyHash = sandboxPolicy.policyHash;
      const result = await reviewAdapter.invoke({
        operationId, role: 'reviewer', attempt: reviewAttempt, sandboxPolicy,
        resource: reviewResource, worktree: snapshot.path,
        goal: 'Review the closed snapshot and return only the required review JSON.',
        inScope: ['closed snapshot analysis'], outOfScope: ['editing', 'automatic correction'], predictedFiles: [], allowedAreas: ['.'],
        acceptanceCriteria: step?.acceptanceCriteria || context.validation.spec.acceptanceCriteria,
        context: { snapshotHash: snapshot.hash, sourceHash: snapshot.sourceHash },
      });
      if (before.hash !== modules.review.captureGitState(targetWorktree).hash) throw localError('READ_ONLY_MUTATION_DETECTED', 'Reviewer changed its target worktree');
      const value = modules.review.parseRoleOutput('reviewer', stores.artifacts.read(result.artifactRef));
      if (!postRun) modules.budget.reconcileReservation(ledger, reservationId, {
          status: 'consumed', role: 'reviewer', estimatedCost: result.metrics?.estimatedCost, tokens: result.metrics?.tokens,
        }, persistLedger);
      reconciled = true;
      const previousFindingRef = [...state.artifacts].reverse().find((entry) => (
        entry.kind === 'finding' && entry.provenance.stepId === (step ? budgetStep.id : 'global')
      ));
      const previousFindings = [];
      if (previousFindingRef) {
        try {
          const persisted = readPersistedArtifact(previousFindingRef);
          const parsed = JSON.parse(persisted.content);
          if (Array.isArray(parsed.findings)) previousFindings.push(...parsed.findings);
        } catch { /* stale or corrupt — accumulate fresh */ }
      }
      const backlog = modules.findings.appendFindingsBacklog({
        artifacts: stores.artifacts, findings: value.findings.map(modules.review.backlogFinding), reviewId: result.operationId || `${context.runId}-review`,
        stepId: postRun ? reviewOperationId : step ? budgetStep.id : 'global', attempt: reviewAttempt,
        previous: previousFindings,
      });
      const reviewArtifact = postRun ? result.artifactRef : persistArtifactRef(result.artifactRef, {
        stepId: step ? budgetStep.id : null, attemptId: step ? attemptId(budgetStep.id, reviewAttempt) : null, kind: 'review', sourceHash: snapshot.sourceHash,
      });
      const backlogArtifact = postRun ? backlog.artifactRef : persistArtifactRef(backlog.artifactRef, {
        stepId: step ? budgetStep.id : null, attemptId: step ? attemptId(budgetStep.id, reviewAttempt) : null, kind: 'finding', sourceHash: snapshot.sourceHash,
      });
      const findingRecords = backlog.findings.map((finding) => ({
        id: `finding-${step ? budgetStep.id : 'global'}-${finding.fingerprint}`,
        stepId: step ? budgetStep.id : null, fingerprint: finding.fingerprint,
        severity: finding.severity, status: 'open', summary: finding.summary,
        artifactIds: [backlogArtifact.id], createdAt: new Date().toISOString(),
      }));
      if (!postRun) {
        state.findings = [...state.findings.filter((entry) => entry.stepId !== (step ? budgetStep.id : null)), ...findingRecords];
        if (step) state.steps.find((entry) => entry.id === budgetStep.id).findingIds = findingRecords.map((entry) => entry.id);
        persist();
      }
      return { ...value, review: value, artifactRef: reviewArtifact, backlog, reviewOperationId, mutated: false };
    } catch (error) {
      try { preserveSandboxViolation(error); } catch { /* preserving diagnostics must not replace the sandbox failure */ }
      noteSandboxPoison(error);
      if (!postRun && !reconciled) modules.budget.reconcileReservation(ledger, reservationId, {
        status: 'consumed', role: 'reviewer', estimatedCost: null, tokens: null,
      }, persistLedger);
      if (!postRun) persist();
      throw error;
    } finally {
      agentArtifactContext = undefined;
    }
  }

  async function reviewStep(input) {
    ensureStores();
    const worktree = boundWorktree(input).path;
    modules.runtime.secureMkdir(repoRoot, path.join(runtimeRoot(), 'snapshots'));
    assertWorktreeIdentity(worktree, input.diff.identity);
    const snapshot = modules.review.createClosedSnapshot({
      worktree, snapshotRoot: path.join(runtimeRoot(), 'snapshots'), sources: snapshotSources(worktree, input.step, input),
    });
    const result = await reviewerCall(input, snapshot, worktree, input.step);
    assertWorktreeIdentity(worktree, input.diff.identity);
    stepReviews.set(input.step.id, result);
    return result;
  }

  function acceptanceArtifacts(stepId, gates) {
    const current = gates.flatMap((gate) => gate.artifacts || [gate.artifact]).filter(Boolean);
    return [...new Map([...persistedEvidenceArtifacts.values(), ...current].map((artifact) => [artifact.id, artifact])).values()];
  }

  function canonicalEvidenceRecord(acId, requirement, artifact) {
    const record = {
      acId, requirementId: requirement.id, kind: requirement.kind,
      hash: artifact.hash, resultRef: artifact.id,
    };
    if (['automated-test', 'contract-test', 'static-check'].includes(requirement.kind)) {
      record.gateId = requirement.gateId;
      record.testSelector = requirement.testSelector;
    }
    if (requirement.kind === 'manual-inspection') {
      record.justification = requirement.justification;
      record.manualRecord = requirement.manualRecord;
    }
    return record;
  }

  function evidenceMap(criteria, gates, artifacts) {
    const artifactById = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
    return criteria.flatMap((criterion) => criterion.evidence.flatMap((declared) => {
      const requirement = modules.evidence.normalizeEvidenceRequirement(declared);
      const artifact = artifactById.get(requirement.resultRef);
      if (!artifact) return [];
      if (['automated-test', 'contract-test', 'static-check'].includes(requirement.kind)
        && !gates.some((gate) => gate.id === requirement.gateId && gate.passed === true && gate.resultRef === requirement.resultRef)) return [];
      return [canonicalEvidenceRecord(criterion.id, requirement, artifact)];
    }));
  }

  function reviewedIdentityFor(binding, input) {
    const inMemory = input.diff.identity || factualIdentities.get(binding.id)?.identity;
    if (inMemory) return inMemory;
    for (const ref of [...state.artifacts].reverse()) {
      if (ref.kind !== 'stdout' || ref.provenance.attemptId !== binding.attemptId) continue;
      const persisted = readPersistedArtifact(ref);
      if (persisted.manifestRef.kind !== 'worktree-identity') continue;
      const identity = JSON.parse(persisted.content);
      factualIdentities.set(binding.id, { worktreeId: binding.id, attemptId: binding.attemptId, worktree: binding.path, identity });
      return identity;
    }
    const actual = captureWorktreeIdentity(binding.path);
    if (input.latestRevalidation?.ok === true && input.latestRevalidation.identityHash === actual.hash) return actual;
    return undefined;
  }

  function acceptStep(input) {
    const binding = boundWorktree(input);
    const reviewedIdentity = reviewedIdentityFor(binding, input);
    assertWorktreeIdentity(binding.path, reviewedIdentity);
    const artifacts = acceptanceArtifacts(input.step.id, input.gates);
    const gates = input.gates.flatMap((gate) => (gate.logicalRefs || [gate.resultRef])
      .map((resultRef) => ({ id: gate.id, passed: gate.ok === true, resultRef })));
    const changed = changedPaths(input.diff.changes);
    const scope = {
      logicalFileCount: input.scope.logicalFileCount, allowed: true,
      unpredicted: input.scope.unpredicted, predictedMissing: input.step.predictedFiles.filter((file) => !changed.includes(file)),
    };
    const records = evidenceMap(input.step.acceptanceCriteria, gates, artifacts);
    const outcome = (options.evaluateLocalAcceptance || modules.acceptance.evaluateLocalAcceptance)({
      schema: { spec: true, step: true, state: true, review: true }, state: { run: 'RUNNING', step: 'ACCEPTING' },
      lock: { held: true, valid: true }, budget: { available: true }, scope,
      // Required gates come from the step contract, not from the results: deriving them from
      // `gates` asks "did the gates that ran, run?" and can never fail.
      requiredGateIds: input.step.verification.gateIds, gates, revalidation: input.latestRevalidation,
      review: { jsonValid: true, value: input.review.review || input.review }, artifacts,
      acceptanceCriteria: input.step.acceptanceCriteria, evidence: records,
      implementationNotes: context.validation.spec.implementationNotes || [],
      requiredImplementationNoteIds: input.step.context.implementationNoteIds,
      // The note's baseSha records when it was approved, not which commit is running: NOTE-03 of the
      // pipeline spec makes it informative provenance and gives --base-sha the sole authority over
      // mutation. Comparing it against the CLI base invalidated every note the moment HEAD moved.
      approvedBaseSha: context.validation.spec.source.baseSha,
      documentationImpact: input.step.documentationImpact,
      documentationPaths: changed,
    });
    const expectedContext = {
      runId: context.runId, scope: 'local', stepId: input.step.id, attemptId: binding.attemptId,
      runStartedAt: state.createdAt, evaluatedAt: new Date().toISOString(),
      sourceHash: executionSourceHash(input.step), factualIdentityHash: reviewedIdentity.hash,
      factualRevalidation: { ok: input.latestRevalidation?.ok === true, identityHash: input.latestRevalidation?.identityHash },
      ownedArtifactIds: new Set(artifacts.filter((artifact) => state.artifacts.some((entry) => (
        entry.id === aggregateArtifactId(artifact.id) && entry.hash === artifact.hash
        && entry.provenance.attemptId === binding.attemptId
      ))).map((artifact) => artifact.physicalId || artifact.id)),
    };
    const validatedEvidence = modules.evidence.validateEvidenceMap({
      acceptanceCriteria: input.step.acceptanceCriteria, evidence: records, artifacts, gates, expectedContext,
    });
    if (outcome.ok === true && validatedEvidence.ok) {
      stepEvidence.set(input.step.id, records);
      const stepRecord = state.steps.find((entry) => entry.id === input.step.id);
      stepRecord.evidence = records.map((record) => ({
        acceptanceCriterionId: record.acId,
        artifactId: aggregateArtifactId(record.resultRef),
        hash: record.hash,
        fresh: artifacts.find((artifact) => artifact.id === record.resultRef).fresh,
      }));
      persist();
    }
    if (outcome.ok === true && !validatedEvidence.ok) {
      return { ok: false, status: 'rejected', reasons: [{ code: 'AC_EVIDENCE_PROVENANCE_INVALID', details: validatedEvidence.errors }], warnings: outcome.warnings || [] };
    }
    return outcome;
  }

  function commitStep(input) {
    const binding = boundWorktree(input);
    const worktree = binding.path;
    assertWorktreeIdentity(worktree, input.diff.identity);
    const acceptedPaths = changedPaths(input.diff.changes);
    if (acceptedPaths.length === 0) {
      modules.budget.pauseBudget(ledger, persistLedger);
      transitionStep(input.step.id, 'ACCEPTED', 'auto-commit step produced no file changes', { acceptancePassed: true });
      const record = state.worktrees.find((entry) => entry.id === binding.id);
      record.headSha = binding.parentSha;
      record.status = 'committed';
      persist();
      return { sha: binding.parentSha, parentSha: binding.parentSha, treeSha: binding.parentSha, status: 'created' };
    }
    const intent = modules.git.preflightCommit({
      cwd: worktree, parentSha: binding.parentSha, acceptedPaths,
      predictedFiles: input.step.predictedFiles,
    });
    persistCommitIntent(input, binding, intent);
    modules.budget.pauseBudget(ledger, persistLedger);
    const declaredBehavior = input.step.boundaries.inScope.find((entry) => entry.startsWith('behaviorType='))?.split('=')[1];
    const behaviorType = ['feature', 'feat', 'fix', 'bugfix', 'bug-fix', 'refactor', 'documentation', 'docs', 'test', 'chore'].includes(declaredBehavior)
      ? declaredBehavior : 'chore';
    const commit = modules.git.createLocalCommit({
      ...intent, schemaVersion: input.step.schemaVersion, changeType: input.step.changeType, behaviorType,
      summary: input.step.goal, specPath: context.validation.specPath, stepId: input.step.id,
    });
    transitionStep(input.step.id, 'ACCEPTED', 'authorized commit created', { acceptancePassed: true });
    const record = state.worktrees.find((entry) => entry.id === binding.id);
    record.headSha = commit.sha;
    record.status = 'committed';
    factualIdentities.set(binding.id, {
      worktreeId: binding.id, attemptId: binding.attemptId, worktree, identity: captureWorktreeIdentity(worktree),
    });
    persist();
    return commit;
  }

  async function cleanupWorktree(step) {
    const record = boundWorktree({ id: step.id, attemptId: step.attemptId, worktreeId: step.worktreeId });
    if (!record || !fs.existsSync(record.path)) return;
    const status = await command('git', ['status', '--porcelain=v1', '--untracked-files=all'], record.path);
    if (!status.ok || outputText(status) !== '') {
      record.stateRecord.status = 'dirty';
      persist();
      return;
    }
    record.stateRecord.status = 'removal-pending';
    persist();
    const removed = await command('git', ['worktree', 'remove', record.path]);
    if (!removed.ok) {
      record.stateRecord.status = 'committed';
      persist();
      return;
    }
    record.stateRecord.status = 'removed';
    record.stateRecord.removedAt = new Date().toISOString();
    persist();
  }

  async function noopCommitFor(record, stepId) {
    const parentTreeSha = await command('git', ['rev-parse', `${record.parentSha}^{tree}`], record.path);
    const treeSha = outputText(parentTreeSha).trim();
    // A synthetic commit object for steps that produce zero file changes.
    // Uses the parent's commit SHA as its own SHA — this object is never
    // fed back into reconcileCommit or createLocalCommit. The record exists
    // only to satisfy the COMMITTED state contract so the pipeline advances.
    const commit = { sha: record.parentSha, parentSha: record.parentSha, treeSha, status: 'reconciled' };
    transitionStep(stepId, 'COMMITTED', 'step accepted without file changes', { commitAuthorized: true, commitCreated: true });
    record.stateRecord.status = 'committed';
    persist();
    return commit;
  }

  async function reconcileStep(input) {
    if (input.persisted.status === 'ACCEPTING') {
      const stepRecord = state.steps.find((entry) => entry.id === input.step.id);
      const autoCommit = context.validation.spec.execution.autoCommit === true && context.options.allowCommit === true;
      if (stepRecord?.evidence?.length > 0) {
        transitionStep(input.step.id, 'ACCEPTED', 'acceptance completed before crash', { acceptancePassed: true, acceptanceReconciled: true });
        persist();
        if (autoCommit) {
          const collectInput = { ...input, step: input.step, attempt: input.persisted.attempt, attemptId: input.persisted.attemptId, worktreeId: input.persisted.worktreeId };
          const diff = collectChanges(collectInput);
          const commitInput = { ...collectInput, diff, acceptance: {} };
          const commit = commitStep(commitInput);
          checkpoint({ ...input, step: input.step, attempt: input.persisted.attempt, attemptId: input.persisted.attemptId, worktreeId: input.persisted.worktreeId, status: 'COMMITTED', commit });
          return { id: input.step.id, status: 'COMMITTED', attempt: input.persisted.attempt, attemptId: input.persisted.attemptId, worktreeId: input.persisted.worktreeId, commit };
        }
        return { id: input.step.id, status: 'AWAITING_COMMIT', attempt: input.persisted.attempt, safeToRetry: false };
      }
      return { status: 'BLOCKED', safeToRetry: false };
    }
    const record = boundWorktree({
      ...input, attemptId: input.persisted.attemptId, worktreeId: input.persisted.worktreeId,
    });
    if (!record || !fs.existsSync(record.path)) return { status: 'BLOCKED', safeToRetry: false };
    const status = await command('git', ['status', '--porcelain=v1', '--untracked-files=all'], record.path);
    const headResult = await command('git', ['rev-parse', 'HEAD'], record.path);
    const headSha = outputText(headResult).trim();
    if (!status.ok || !headResult.ok) return { status: 'BLOCKED', safeToRetry: false };
    if (headSha === record.parentSha) {
      if ((input.persisted.status === 'AWAITING_COMMIT' || input.persisted.status === 'ACCEPTED')
        && outputText(status) === '') {
        const commit = await noopCommitFor(record, input.step.id);
        return { id: input.step.id, status: 'COMMITTED', attempt: input.persisted.attempt, attemptId: record.attemptId, worktreeId: record.id, commit };
      }
      if (input.persisted.status === 'AWAITING_COMMIT') {
        return { id: input.step.id, status: 'AWAITING_COMMIT', attempt: input.persisted.attempt, safeToRetry: false };
      }
      return { status: input.persisted.status, safeToRetry: true };
    }
    if (outputText(status) !== '') {
      record.stateRecord.status = 'dirty';
      persist();
      return { status: 'AWAITING_COMMIT', safeToRetry: false };
    }
    const intentRef = [...state.artifacts].reverse().find((entry) => entry.kind === 'commit'
      && entry.provenance.stepId === input.step.id && entry.provenance.attemptId === record.attemptId);
    if (!intentRef) return { status: 'BLOCKED', safeToRetry: false };
    let intent;
    try { intent = JSON.parse(readPersistedArtifact(intentRef).content); }
    catch { return { status: 'BLOCKED', safeToRetry: false }; }
    const parent = await command('git', ['rev-parse', `${headSha}^`], record.path);
    const tree = await command('git', ['rev-parse', `${headSha}^{tree}`], record.path);
    const names = await command('git', ['diff', '--name-only', '-z', record.parentSha, headSha, '--'], record.path);
    const acceptedPaths = outputText(names).split('\0').filter(Boolean).sort();
    const predicted = input.step.predictedFiles;
    const accepted = acceptedPaths.length > 0 && acceptedPaths.length === intent.acceptedPaths?.length
      && acceptedPaths.every((candidate, index) => candidate === intent.acceptedPaths[index])
      && acceptedPaths.every((candidate) => predicted.some((pattern) => path.matchesGlob(candidate, pattern)));
    if (!parent.ok || outputText(parent).trim() !== record.parentSha || !tree.ok
      || outputText(tree).trim() !== intent.acceptedTreeSha || intent.parentSha !== record.parentSha
      || intent.attemptId !== record.attemptId || intent.worktreeId !== record.id || !names.ok || !accepted) {
      record.stateRecord.status = 'dirty';
      persist();
      return { status: 'AWAITING_COMMIT', safeToRetry: false };
    }
    const commit = modules.git.reconcileCommit({ cwd: record.path, sha: headSha, parentSha: record.parentSha, treeSha: intent.acceptedTreeSha });
    record.stateRecord.headSha = commit.sha;
    record.stateRecord.status = 'committed';
    // The identity hashes the working tree, so the human commit that AWAITING_COMMIT waits for is
    // itself what changes it: staged file before, clean tree after. commitStep already rewrites the
    // identity after its own commit; without the same here, the default flow — stop, wait, resume —
    // always died on REVALIDATION_DRIFT with identity false.
    // It is rewritten only past reconcileCommit, which has just proved the commit carries exactly
    // the parent, tree and paths acceptance approved. Rewriting it earlier would accept any worktree.
    factualIdentities.set(record.id, {
      worktreeId: record.id, attemptId: record.attemptId, worktree: record.path,
      identity: captureWorktreeIdentity(record.path),
    });
    checkpoint({ ...input, status: 'COMMITTED', commit });
    return { id: input.step.id, status: 'COMMITTED', attempt: input.persisted.attempt, attemptId: record.attemptId, worktreeId: record.id, commit };
  }

  function integratedWorktree(input) {
    const last = input.steps?.at(-1);
    const worktreeId = last?.worktreeId || state.steps.find((entry) => entry.id === state.commits.at(-1)?.stepId)?.worktreeId;
    const record = state.worktrees.find((entry) => entry.id === worktreeId && entry.status === 'committed');
    if (!record) throw localError('INTEGRATED_WORKTREE_NOT_FOUND', 'No committed worktree matches the winning attempt');
    return record.path;
  }

  async function reviewGlobal(input) {
    ensureStores();
    const worktree = input.snapshot?.worktree || integratedWorktree(input);
    let snapshot = input.snapshot;
    if (!snapshot) {
      const diff = modules.review.captureIntegratedDiff(worktree, context.validation.baseSha);
      const identity = captureWorktreeIdentity(worktree);
      diff.identity = identity;
      const binding = boundWorktree(input);
      factualIdentities.set(binding.id, { worktreeId: binding.id, attemptId: binding.attemptId, worktree, identity });
      modules.runtime.secureMkdir(repoRoot, path.join(runtimeRoot(), 'snapshots'));
      snapshot = modules.review.createGlobalReviewSnapshot({
        worktree, snapshotRoot: path.join(runtimeRoot(), 'snapshots'),
        sources: snapshotSources(worktree, null, { ...input, diff }),
      });
      persistGlobalSnapshot(snapshot);
    }
    if (snapshot.diff?.identity && snapshot.factualWorktreeAvailable !== false) assertWorktreeIdentity(worktree, snapshot.diff.identity);
    const result = await reviewerCall(input, snapshot, worktree, null);
    if (snapshot.diff?.identity && snapshot.factualWorktreeAvailable !== false) assertWorktreeIdentity(worktree, snapshot.diff.identity);
    return result;
  }

  function globalAcceptanceInput(input) {
    const localGates = [...gateArtifacts.values()].filter((artifact) => artifact.passed === true && artifact.provenance?.scope !== 'global')
      .map((artifact) => ({ id: artifact.provenance.gateId, passed: true, resultRef: artifact.id }));
    const gates = [...persistedEvidenceGates.values(), ...localGates, ...(input.gates || []).map((gate) => ({ id: gate.id, passed: gate.ok === true, resultRef: gate.resultRef }))];
    const artifacts = [...gateArtifacts.values(), ...(input.gates || []).map((gate) => gate.artifact).filter(Boolean)];
    const criteria = context.validation.steps.flatMap((step) => step.acceptanceCriteria.map((criterion) => ({ ...criterion, stepId: step.id })));
    const records = [...stepEvidence.entries()].flatMap(([stepId, entries]) => entries.map((record) => ({ ...record, stepId })));
    const evidenceArtifacts = [...persistedEvidenceArtifacts.values()];
    const worktree = input.snapshot ? null : integratedWorktree(input);
    const integratedDiff = input.snapshot?.diff || modules.review.captureIntegratedDiff(worktree, context.validation.baseSha);
    const snapshotPaths = input.snapshot
      ? [...integratedDiff.content.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)].flatMap((match) => [match[1], match[2]])
      : null;
    return {
      schema: { spec: true, steps: true, review: true }, integration: { consistent: true },
      diff: integratedDiff, gates,
      // The run path passes the declared global gate union; only the read-only snapshot review,
      // which accepts nothing, still falls back to the gates it was handed.
      requiredGateIds: input.requiredGateIds || [...new Set(gates.map((gate) => gate.id))],
      revalidation: { ...(input.latestRevalidation || revalidations.at(-1)), impacts: Object.fromEntries(context.validation.steps.map((step) => [step.id, true])) },
      review: { jsonValid: true, value: input.review.review || input.review },
      artifacts: [...new Map([...artifacts, ...evidenceArtifacts].map((artifact) => [artifact.id, artifact])).values()],
      acceptanceCriteria: criteria, evidence: records,
      documentationImpacts: context.validation.steps.map((step) => ({
        documentationImpact: step.documentationImpact,
        documentationPaths: snapshotPaths || changedPaths(modules.git.collectChanges({ cwd: worktree, baseSha: context.validation.baseSha }).changes),
      })),
    };
  }

  function validateGlobalEvidenceProvenance(value) {
    for (const step of context.validation.steps) {
      const criteria = step.acceptanceCriteria.map((criterion) => ({ ...criterion, stepId: step.id }));
      const records = value.evidence.filter((record) => record.stepId === step.id);
      const refs = new Set(records.map((record) => record.resultRef));
      const artifacts = value.artifacts.filter((artifact) => refs.has(artifact.id));
      const factualIdentityHashes = [...new Set(artifacts.map((artifact) => artifact.provenance?.factualIdentityHash).filter(Boolean))];
      const attemptIdValue = state.steps.find((entry) => entry.id === step.id)?.attemptIds.at(-1);
      const sourceHash = executionSourceHash(step);
      const factualIdentityHash = factualIdentityHashes.length === 1 ? factualIdentityHashes[0] : null;
      const result = modules.evidence.validateEvidenceMap({
        acceptanceCriteria: criteria, evidence: records, artifacts, gates: value.gates,
        expectedContext: {
          runId: context.runId, scope: 'local', stepId: step.id, attemptId: attemptIdValue, sourceHash, factualIdentityHash,
          factualRevalidation: {
            ok: Boolean(factualIdentityHash && revalidations.some((entry) => entry.ok === true && entry.identityHash === factualIdentityHash)),
            identityHash: factualIdentityHash,
          },
          ownedArtifactIds: new Set(artifacts.filter((artifact) => state.artifacts.some((entry) => (
            entry.id === aggregateArtifactId(artifact.id) && entry.hash === artifact.hash
            && entry.provenance.attemptId === attemptIdValue
          ))).map((artifact) => artifact.physicalId || artifact.id)),
        },
      });
      if (!result.ok) throw localError('GLOBAL_EVIDENCE_PROVENANCE_INVALID', 'Global evidence does not belong to its exact run, step, attempt, source, and factual revalidation', { stepId: step.id, errors: result.errors });
    }
  }

  function acceptGlobal(input) {
    const worktree = input.snapshot?.worktree || integratedWorktree(input);
    if (input.snapshot?.diff?.identity && input.snapshot.factualWorktreeAvailable !== false) assertWorktreeIdentity(worktree, input.snapshot.diff.identity);
    const value = globalAcceptanceInput(input);
    validateGlobalEvidenceProvenance(value);
    const outcome = (options.evaluateGlobalAcceptance || modules.acceptance.evaluateGlobalAcceptance)(value);
    if (context.mode === 'review' && postRunReview) {
      stores.artifacts.preserve({
        stepId: postRunReview.id, attempt: postRunReview.attempt, kind: 'review-outcome', mediaType: 'application/json',
        content: {
          reviewOperationId: postRunReview.id, originalSnapshotHash: postRunReview.originalSnapshotHash,
          reviewArtifact: input.review.artifactRef, backlogArtifact: input.review.backlog?.artifactRef, outcome,
        },
        provenance: { runId: context.runId, reviewOperationId: postRunReview.id, originalSnapshotHash: postRunReview.originalSnapshotHash },
      });
    }
    return outcome;
  }

  function writeReports(input) {
    ensureStores();
    return stores.reports.writeFinalArtifacts({
      runId: context.runId, outcome: 'succeeded', steps: input.steps, transitions: state.transitions,
      usage: modules.budget.publicLedger(ledger), gates: [...gateArtifacts.values()], revalidation: input.revalidations || revalidations,
      evidence: [...stepEvidence.entries()].flatMap(([stepId, entries]) => entries.map((record) => ({ ...record, stepId }))),
      documentationImpact: context.validation.steps.map((step) => step.documentationImpact),
      findingsBacklog: input.review.backlog?.findings || [], commits: state.commits,
      risks: [], notifications: notificationEvents, acceptance: input.acceptance,
    });
  }

  async function openReviewSnapshot(input) {
    context = input;
    assertNotSandboxPoisoned();
    const repository = modules.runtime.identifyRepository(repoRoot);
    let reviewLock;
    try {
      reviewLock = modules.runtime.acquireLock({ cwd: repoRoot, runId: input.runId, specPath: input.validation.specPath });
      lock = reviewLock;
      context = { ...input, lock: reviewLock };
      state = modules.runtime.readRunState(reviewLock);
    } catch (error) {
      if (reviewLock && !reviewLock.released) modules.runtime.releaseLock(reviewLock);
      lock = undefined;
      if (error.code === 'STATE_READ_INVALID' && /ENOENT/.test(error.message)) throw localError('REVIEW_STATE_NOT_FOUND', 'No completed run state exists for review');
      throw error;
    }
    const snapshotRef = validateReviewState(state, repository, input.validation, input.runId);
    ledger = modules.budget.restoreBudgetLedger(
      input.validation.spec.budgets,
      Object.fromEntries(input.validation.steps.map((step) => [step.id, step.budgets])),
      state.usage,
      { now: options.now, startActive: false },
    );
    verifyPersistedArtifacts();
    rehydrateEvidence(input.validation);
    const listedResult = await command('git', ['worktree', 'list', '--porcelain']);
    if (!listedResult.ok) throw localError('REVIEW_WORKTREE_INVALID', 'Git worktree membership could not be validated');
    const listed = outputText(listedResult).split(/\r?\n/).filter((line) => line.startsWith('worktree ')).map((line) => fs.realpathSync(line.slice(9)));
    const committedStep = state.steps.find((entry) => entry.id === state.commits.at(-1)?.stepId);
    const committedWorktree = state.worktrees.find((entry) => entry.id === committedStep?.worktreeId);
    const originalWorktreeAvailable = Boolean(committedWorktree && fs.existsSync(committedWorktree.path));
    const worktree = fs.realpathSync(originalWorktreeAvailable ? committedWorktree.path : repoRoot);
    const common = await command('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], worktree);
    if (!listed.includes(worktree) || !common.ok || fs.realpathSync(outputText(common).trim()) !== repository.commonDirectory) {
      throw localError('REVIEW_WORKTREE_INVALID', 'Review target is not a worktree of the persisted repository');
    }
    ensureStores();
    const snapshot = readClosedSnapshot(snapshotRef);
    if (originalWorktreeAvailable && snapshot.diff?.identity) assertWorktreeIdentity(worktree, snapshot.diff.identity);
    postRunReview = { id: `review-op-${crypto.randomUUID()}`, originalSnapshotHash: snapshot.hash };
    return { ...snapshot, worktree, factualWorktreeAvailable: originalWorktreeAvailable, reviewOperationId: postRunReview.id };
  }

  function closeReviewSnapshot() {
    if (!lock || lock.released) return false;
    const released = modules.runtime.releaseLock(lock);
    lock = undefined;
    return released;
  }

  function createPullRequest(input) {
    return modules.pr.createPullRequest({
      createPr: true, globalStatus: 'SUCCEEDED', acceptance: input.acceptance,
      worktree: integratedWorktree(input), specPath: context.validation.specPath, steps: input.steps,
      gates: [...gateArtifacts.values()],
      evidence: [...stepEvidence.entries()].flatMap(([stepId, entries]) => entries.map((record) => ({ ...record, stepId }))), risks: [],
    }, {
      runProcess: options.ghRunProcess || runProcess,
      gitResource: resolveResource('git'),
      ghResource: resolveResource('gh'),
    });
  }

  function notify(input) {
    ensureStores();
    const type = input.type === 'succeeded' ? 'spec-succeeded' : input.type;
    return notificationService.notify(
      { type, runId: context.runId, stepId: input.step?.id, status: input.status },
      context.validation.spec.execution.notificationResourceIds || [],
    );
  }

  return {
    runId, loadCatalogs: modules.catalogs.loadCatalogsFromGit, preflight, acquireLock, releaseLock, openRun, checkpoint,
    revalidate, createAttempt, invoke, collectChanges, recordRiskSignals, consumeDecision, runGate, reviewStep, acceptStep, commitStep, reconcileStep,
    cleanupStep: cleanupWorktree, integratedWorktree,
    reviewGlobal, acceptGlobal, writeReports, openReviewSnapshot, closeReviewSnapshot, createPullRequest, notify,
  };
}

module.exports = { assertWorktreeIdentity, captureWorktreeIdentity, createGateEnvironment, createLocalAdapter, gateExecutionLocation, gateProcessSummary, loadReviewContext, readDecisionFile, validateReviewState };
