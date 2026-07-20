'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const { atomicWriteFile, createArtifactStore } = require('./lib/artifacts.cjs');
const { assertWorktreeIdentity, captureWorktreeIdentity, createGateEnvironment, gateProcessSummary, validateReviewState } = require('./lib/local-adapter.cjs');
const { validateEvidenceMap } = require('./lib/evidence.cjs');
const { sanitize } = require('./lib/sanitize.cjs');
const { validate, validateSemantics, workflowPaths } = require('./lib/orchestrator.cjs');
const { runProcess } = require('./lib/process.cjs');
const { createReportStore } = require('./lib/report.cjs');
const { createClosedSnapshot } = require('./lib/review.cjs');
const { assertSecureRuntimePath, assertStateReferences, secureMkdir } = require('./lib/runtime.cjs');
const { loadCatalogsFromFilesystem } = require('./lib/catalogs.cjs');

const SECRETS = [
  'Bearer abc.def.secret',
  'api_key=super-secret-value',
  'password=hunter2',
  'Cookie: session_id=session-secret',
  'https://user:credential@example.invalid/path',
  'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature-secret',
  '-----BEGIN PRIVATE KEY-----\nprivate-material\n-----END PRIVATE KEY-----',
];

function temporaryRuntime() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-artifacts-'));
}

test('redacts secret fixtures and never serializes a complete environment', () => {
  const result = sanitize({
    output: `${SECRETS.join('\n')}\nHOME=/private/home\nPATH=/bin\nSHELL=/bin/zsh\n`,
    environment: { PATH: '/bin', TOKEN: 'environment-secret' },
  });
  for (const secret of ['super-secret-value', 'hunter2', 'credential', 'private-material', 'environment-secret', 'session-secret']) {
    assert.equal(result.content.includes(secret), false, secret);
  }
  assert.match(result.content, /REDACTED/);
  assert.equal(result.content.includes('/private/home'), false);
  assert.equal(result.redacted, true);
});

test('redacts opaque token, client, session, and cookie variants in structured and text artifacts', () => {
  const opaque = Array.from({ length: 18 }, (_, index) => `opaque-value-${index}`);
  const structured = sanitize({
    token: opaque[0], accessToken: opaque[1], 'refresh-token': opaque[2], client_secret: opaque[3],
    GH_TOKEN: opaque[4], 'npm.token': opaque[5], Session: opaque[6], cookieJar: opaque[7],
    secretKey: opaque[12], passwordHash: opaque[13], tokenValue: opaque[14],
    apiKeyValue: opaque[15], privateKeyMaterial: opaque[16], clientSecretHash: opaque[17],
  });
  const text = sanitize([
    `ToKeN=${opaque[8]}`, `access-token: "${opaque[9]}"`,
    `CLIENT.SECRET='${opaque[10]}'`, `Set-Cookie: session=${opaque[11]}`,
  ].join('\n'));
  for (const secret of opaque) {
    assert.equal(structured.content.includes(secret) || text.content.includes(secret), false, secret);
  }
  assert.equal(structured.redacted, true);
  assert.equal(text.redacted, true);
});

test('does not redact non-secret key substrings', () => {
  const result = sanitize({ keyboardLayout: 'us', keyName: 'enter', tokenizerVersion: '1' });
  assert.deepEqual(JSON.parse(result.content), { keyboardLayout: 'us', keyName: 'enter', tokenizerVersion: '1' });
  assert.equal(result.redacted, false);
});

test('generic tokens never reach runtime artifacts, closed snapshots, or final reports', () => {
  const secret = 'opaque-runtime-snapshot-report-secret';
  const runtimeRoot = temporaryRuntime();
  const worktree = temporaryRuntime();
  const snapshotRoot = temporaryRuntime();
  let snapshot;
  try {
    const artifactStore = createArtifactStore({ runtimeRoot });
    artifactStore.preserve({
      stepId: 'step-1', attempt: 1, kind: 'status', mediaType: 'application/json',
      content: { GH_TOKEN: secret }, provenance: { operationId: 'operation-1' },
    });
    const sources = Object.fromEntries([
      'spec', 'step', 'boundaries', 'invariants', 'acceptanceCriteria', 'adrs', 'agents', 'notes',
      'diff', 'gates', 'revalidation', 'artifacts', 'evidence', 'findings',
    ].map((name) => [name, name === 'diff' ? `refresh_token=${secret}` : {}]));
    snapshot = createClosedSnapshot({ worktree, snapshotRoot, sources });
    const reportStore = createReportStore({ runtimeRoot });
    reportStore.writeFinalArtifacts({
      runId: 'run-secret', outcome: 'succeeded', steps: [], transitions: [{ cause: `client_secret=${secret}` }],
      usage: { total: {} }, gates: [], revalidations: [], retries: [], evidence: [], documentationImpacts: [],
      findingsBacklog: [], risks: [], observations: [], proposals: [],
    });
    const persisted = [
      fs.readFileSync(path.join(runtimeRoot, 'artifacts/step-1/attempt-1/status.json'), 'utf8'),
      fs.readFileSync(path.join(snapshot.path, 'diff.snapshot'), 'utf8'),
      fs.readFileSync(path.join(runtimeRoot, 'artifacts/reports/final-report.json'), 'utf8'),
      fs.readFileSync(path.join(runtimeRoot, 'artifacts/reports/retrospective.yaml'), 'utf8'),
    ].join('\n');
    assert.equal(persisted.includes(secret), false);
  } finally {
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
    fs.rmSync(worktree, { recursive: true, force: true });
    if (snapshot) {
      fs.chmodSync(snapshot.path, 0o700);
      for (const name of fs.readdirSync(snapshot.path)) fs.chmodSync(path.join(snapshot.path, name), 0o600);
    }
    fs.chmodSync(snapshotRoot, 0o700);
    fs.rmSync(snapshotRoot, { recursive: true, force: true });
  }
});

test('semantic evidence validation rejects ambiguous aliases, duplicate IDs, undeclared gates, and forged logical refs', async () => {
  const root = path.resolve(__dirname, '../..');
  const specPath = 'specs/automated-spec-pipeline.md';
  const validated = await validate({ specPath }, { repoRoot: root, loadCatalogs: loadCatalogsFromFilesystem });
  const paths = workflowPaths(specPath, root);
  const catalog = { ok: true, value: validated.catalogs };
  const cases = [
    ['DUPLICATE_EVIDENCE_ID', (steps) => { steps[1].acceptanceCriteria[0].evidence[0].id = steps[0].acceptanceCriteria[0].evidence[0].id; }],
    ['EVIDENCE_GATE_NOT_DECLARED_BY_STEP', (steps) => { steps[0].acceptanceCriteria[0].evidence[0].gateId = 'verify-pack'; }],
    ['EVIDENCE_RESULT_REF_INVALID', (steps) => { steps[0].acceptanceCriteria[0].evidence[0].resultRef = 'artifact-output-hash'; }],
    ['EVIDENCE_TEST_SELECTOR_REQUIRED', (steps) => { steps[0].acceptanceCriteria[0].evidence[0].testSelector = '   '; }],
    ['DEPRECATED_EVIDENCE_ALIAS_UNRESOLVABLE', (steps) => {
      const requirement = steps[0].acceptanceCriteria[0].evidence[0];
      requirement.kind = 'gate';
      delete requirement.testSelector;
    }],
  ];
  for (const [code, mutate] of cases) {
    const steps = structuredClone(validated.steps);
    mutate(steps);
    assert.throws(
      () => validateSemantics(structuredClone(validated.spec), { steps }, catalog, structuredClone(paths)),
      (error) => error.code === 'WORKFLOW_SEMANTIC_INVALID' && error.details.errors.some((entry) => entry.code === code),
      code,
    );
  }
});

test('state integrity rejects reverse ownership orphans, conflicts, and noncanonical severities', () => {
  const hash = 'a'.repeat(64);
  const base = {
    runId: 'run-integrity',
    steps: [{
      id: 'pipeline-step-1', attemptIds: ['attempt-pipeline-step-1-1'], worktreeId: 'worktree-pipeline-step-1-1',
      commitIds: ['commit-pipeline-step-1'], findingIds: ['finding-one'],
      evidence: [{ acceptanceCriterionId: 'AC-01', artifactId: 'artifact-one', hash }],
      sandbox: { policyVersion: '1', applications: [] },
    }],
    attempts: [{ id: 'attempt-pipeline-step-1-1', stepId: 'pipeline-step-1', number: 1, role: 'executor', status: 'failed', finishedAt: 'now', artifactIds: ['artifact-one'], sandboxPolicyHash: null }],
    commits: [{ id: 'commit-pipeline-step-1', stepId: 'pipeline-step-1' }],
    findings: [{ id: 'finding-one', stepId: 'pipeline-step-1', severity: 'critical', artifactIds: ['artifact-one'] }],
    worktrees: [{ id: 'worktree-pipeline-step-1-1', stepId: 'pipeline-step-1' }],
    artifacts: [{ id: 'artifact-one', hash, provenance: { runId: 'run-integrity', stepId: 'pipeline-step-1', attemptId: 'attempt-pipeline-step-1-1' } }],
    usage: { reservations: [], perStep: [{ stepId: 'pipeline-step-1' }] },
  };
  assert.equal(assertStateReferences(structuredClone(base)).runId, base.runId);
  for (const mutate of [
    (state) => { state.steps[0].commitIds = []; },
    (state) => { state.steps[0].findingIds = []; },
    (state) => { state.steps[0].worktreeId = null; state.worktrees[0].id = 'worktree-orphan'; },
    (state) => { state.attempts[0].artifactIds = []; },
    (state) => { state.findings[0].severity = 'blocker'; },
  ]) {
    const state = structuredClone(base);
    mutate(state);
    assert.throws(() => assertStateReferences(state), { code: 'STATE_REFERENCE_INVALID' });
  }
});

test('persists bounded artifacts and manifest atomically with provenance and refs', () => {
  const runtimeRoot = temporaryRuntime();
  const store = createArtifactStore({ runtimeRoot, maxBytes: 256, now: () => '2026-07-16T00:00:00.000Z' });
  const provenance = { operationId: 'operation-1', role: 'executor', environment: { SECRET: 'not-on-disk' } };
  const refs = [
    store.preserve({ stepId: 'step-9', attempt: 2, kind: 'diff', mediaType: 'text/x-diff', content: `+${SECRETS[1]}\n${'x'.repeat(500)}`, provenance }),
    store.preserve({ stepId: 'step-9', attempt: 2, kind: 'status', mediaType: 'application/json', content: { status: 'failed', password: 'status-secret' }, provenance }),
    store.preserve({ stepId: 'step-9', attempt: 2, kind: 'verification', mediaType: 'application/json', content: { ok: true }, provenance }),
    store.preserve({ stepId: 'step-9', attempt: 2, kind: 'review', mediaType: 'application/json', content: { ref: 'review-1' }, provenance }),
    store.preserve({ stepId: 'step-9', attempt: 2, kind: 'diagnosis', mediaType: 'application/json', content: { ref: 'diagnosis-1' }, provenance }),
  ];
  const directory = path.join(runtimeRoot, 'artifacts', 'step-9', 'attempt-2');
  assert.equal(fs.existsSync(path.join(directory, 'diff.patch')), true);
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.artifacts.map((entry) => entry.kind), ['diff', 'status', 'verification', 'review', 'diagnosis']);
  assert.equal(refs[0].truncation, true);
  assert.equal(refs[0].redaction, true);
  for (const ref of refs) {
    assert.match(ref.hash, /^[0-9a-f]{64}$/);
    assert.equal(ref.sensitivity, 'internal');
    assert.equal(store.read(ref).includes('super-secret-value'), false);
  }
  const disk = fs.readdirSync(directory).map((name) => fs.readFileSync(path.join(directory, name), 'utf8')).join('\n');
  for (const secret of ['super-secret-value', 'status-secret', 'not-on-disk']) assert.equal(disk.includes(secret), false);
});

test('blocks unknown media, stale hashes, and interrupted writes without a partial target', () => {
  const runtimeRoot = temporaryRuntime();
  const store = createArtifactStore({ runtimeRoot });
  assert.throws(() => store.preserve({
    stepId: 'step-9', attempt: 1, kind: 'binary', mediaType: 'application/octet-stream',
    content: Buffer.from('secret'), provenance: { operationId: 'operation-1' },
  }), { code: 'ARTIFACT_NOT_SANITIZABLE' });
  const ref = store.preserve({ stepId: 'step-9', attempt: 1, kind: 'status', mediaType: 'application/json', content: { ok: true }, provenance: { operationId: 'operation-1' } });
  fs.appendFileSync(path.join(runtimeRoot, ref.path), 'corrupt');
  assert.throws(() => store.read(ref), { code: 'ARTIFACT_HASH_MISMATCH' });

  const target = path.join(runtimeRoot, 'interrupted.txt');
  assert.throws(() => atomicWriteFile(target, 'must-not-appear', { beforeRename() { throw new Error('interrupted'); } }), /interrupted/);
  assert.equal(fs.existsSync(target), false);
  assert.equal(fs.readdirSync(runtimeRoot).some((name) => name.endsWith('.tmp')), false);
});

test('validates provenance before replacing an existing artifact', () => {
  const runtimeRoot = temporaryRuntime();
  const store = createArtifactStore({ runtimeRoot, maxBytes: 128 });
  const original = store.preserve({
    stepId: 'step-9', attempt: 1, kind: 'status', mediaType: 'application/json',
    content: { version: 'old' }, provenance: { operationId: 'operation-1' },
  });
  assert.throws(() => store.preserve({
    stepId: 'step-9', attempt: 1, kind: 'status', mediaType: 'application/json',
    content: { version: 'new' }, provenance: { operationId: 'x'.repeat(1024) },
  }), { code: 'ARTIFACT_PROVENANCE_INVALID' });
  assert.match(store.read(original), /"old"/);
  assert.doesNotMatch(store.read(original), /"new"/);
});


test('rejects symlinks in runtime runs, artifact, and report roots', () => {
  const cases = ['runs', 'artifacts', 'reports'];
  for (const target of cases) {
    const primary = fs.mkdtempSync(path.join(os.tmpdir(), `workflow-${target}-symlink-`));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-symlink-target-'));
    try {
      fs.mkdirSync(path.join(primary, '.workflow-runtime'), { mode: 0o700 });
      if (target === 'runs') {
        fs.symlinkSync(outside, path.join(primary, '.workflow-runtime', 'runs'));
        assert.throws(
          () => assertSecureRuntimePath(primary, path.join(primary, '.workflow-runtime', 'runs', 'run-test', 'state.json')),
          { code: 'RUNTIME_SYMLINK_REJECTED' },
        );
        continue;
      }
      const runtimeRoot = path.join(primary, '.workflow-runtime', 'runs', 'run-test');
      fs.mkdirSync(runtimeRoot, { recursive: true, mode: 0o700 });
      if (target === 'artifacts') {
        fs.symlinkSync(outside, path.join(runtimeRoot, 'artifacts'));
        assert.throws(() => createArtifactStore({ runtimeRoot }), { code: 'RUNTIME_SYMLINK_REJECTED' });
        continue;
      }
      const artifactsRoot = path.join(runtimeRoot, 'artifacts');
      fs.mkdirSync(artifactsRoot, { mode: 0o700 });
      fs.symlinkSync(outside, path.join(artifactsRoot, 'reports'));
      assert.throws(() => createReportStore({ runtimeRoot }), { code: 'RUNTIME_SYMLINK_REJECTED' });
    } finally {
      fs.rmSync(primary, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  }
});

test('rejects forged closed review state identity, base, and DAG', () => {
  const hash = 'a'.repeat(64);
  const sha = 'b'.repeat(40);
  const repository = { identity: hash, realRoot: '/primary' };
  const validation = { baseSha: sha, dag: { hash } };
  const state = {
    runId: 'run-review', state: 'SUCCEEDED', repo: { identity: hash, realRoot: '/primary', baseSha: sha },
    spec: { dagHash: hash }, artifacts: [{ id: 'artifact-global-snapshot', kind: 'snapshot' }],
  };
  assert.equal(validateReviewState(state, repository, validation, 'run-review').kind, 'snapshot');
  for (const forged of [
    { repo: { ...state.repo, identity: 'c'.repeat(64) } },
    { repo: { ...state.repo, baseSha: 'd'.repeat(40) } },
    { spec: { dagHash: 'e'.repeat(64) } },
  ]) {
    assert.throws(() => validateReviewState({ ...state, ...forged }, repository, validation, 'run-review'), { code: 'REVIEW_STATE_FORGED' });
  }
});

test('gate environment isolates HOME and TMPDIR, inherits only PATH, and reports no network sandbox', async () => {
  const primary = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-gate-environment-'));
  const runtimeRoot = path.join(primary, '.workflow-runtime', 'runs', 'run-gate');
  const previousGh = process.env.GH_TOKEN;
  const previousSsh = process.env.SSH_AUTH_SOCK;
  try {
    secureMkdir(primary, runtimeRoot);
    process.env.GH_TOKEN = 'provider-secret';
    process.env.SSH_AUTH_SOCK = '/private/ssh-agent';
    const isolated = createGateEnvironment(runtimeRoot);
    const result = await runProcess({
      executable: process.execPath,
      args: ['-e', 'process.stdout.write(JSON.stringify(process.env))'],
      root: primary,
      cwd: '.',
      envAllowlist: ['HOME', 'PATH', 'TMPDIR'],
      env: isolated.env,
      timeoutMs: 5000,
      maxOutputBytes: 4096,
    });
    const environment = JSON.parse(result.stdout.text);
    assert.equal(environment.HOME, path.join(isolated.root, 'home'));
    assert.equal(environment.TMPDIR, path.join(isolated.root, 'tmp'));
    assert.equal(environment.PATH, process.env.PATH);
    assert.equal(environment.GH_TOKEN, undefined);
    assert.equal(environment.SSH_AUTH_SOCK, undefined);
    assert.equal(fs.statSync(environment.HOME).mode & 0o777, 0o700);
    const summary = gateProcessSummary({
      ...result,
      stdout: { text: `password=gate-secret\n${'x'.repeat(20000)}`, bytes: 20021, truncated: false },
    }, 256);
    assert.equal(summary.stdout.summary.includes('gate-secret'), false);
    assert.equal(summary.stdout.redaction, true);
    assert.equal(summary.stdout.truncation, true);
    assert.deepEqual(summary.inheritedEnvironment, ['PATH']);
    assert.equal(summary.networkSandbox, false);
    fs.rmSync(isolated.root, { recursive: true, force: true });
  } finally {
    if (previousGh === undefined) delete process.env.GH_TOKEN; else process.env.GH_TOKEN = previousGh;
    if (previousSsh === undefined) delete process.env.SSH_AUTH_SOCK; else process.env.SSH_AUTH_SOCK = previousSsh;
    fs.rmSync(primary, { recursive: true, force: true });
  }
});

test('factual worktree identity blocks unstaged and staged byte drift after review', () => {
  const root = temporaryRuntime();
  const git = (...args) => execFileSync('git', ['-C', root, ...args]);
  try {
    git('init', '-q');
    git('config', 'user.email', 'workflow@example.invalid');
    git('config', 'user.name', 'Workflow Test');
    fs.writeFileSync(path.join(root, 'tracked.txt'), 'reviewed\n');
    git('add', 'tracked.txt');
    git('commit', '-qm', 'base');
    fs.writeFileSync(path.join(root, 'tracked.txt'), 'candidate\n');
    const reviewed = captureWorktreeIdentity(root);
    assert.equal(assertWorktreeIdentity(root, reviewed).hash, reviewed.hash);

    fs.writeFileSync(path.join(root, 'tracked.txt'), 'unstaged drift\n');
    assert.throws(() => assertWorktreeIdentity(root, reviewed), { code: 'WORKTREE_IDENTITY_DRIFT' });
    fs.writeFileSync(path.join(root, 'tracked.txt'), 'candidate\n');
    git('add', 'tracked.txt');
    assert.throws(() => assertWorktreeIdentity(root, reviewed), { code: 'WORKTREE_IDENTITY_DRIFT' });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('agent artifacts reject opaque finals and persist only structural log summaries with ghr redaction', async () => {
  const runtimeRoot = temporaryRuntime();
  try {
    const store = createArtifactStore({ runtimeRoot });
    await assert.rejects(() => store.preserveAgentResponse({
      stepId: 'step-1', attempt: 1, operationId: 'opaque', role: 'reviewer', response: 'arbitrary opaque review', logs: 'opaque log body',
      sandboxPolicyHash: 'a'.repeat(64),
    }), { code: 'UNTRUSTED_JSON_INVALID' });
    const token = `ghr_${'A'.repeat(24)}`;
    const ref = await store.preserveAgentResponse({
      stepId: 'step-1', attempt: 2, operationId: 'structured', role: 'executor',
      response: JSON.stringify({ status: 'complete', token }), logs: `untrusted ${token} opaque body`,
      sandboxPolicyHash: 'a'.repeat(64),
    });
    assert.equal(store.read(ref).includes(token), false);
    const persisted = fs.readFileSync(path.join(runtimeRoot, 'artifacts/step-1/attempt-2/agent.log'), 'utf8');
    assert.equal(persisted.includes('opaque body'), false);
    assert.match(persisted, /opaque-summary/);
  } finally {
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  }
});

test('a review document survives the commentary and the fences a model wraps it in', async () => {
  const runtimeRoot = temporaryRuntime();
  try {
    const store = createArtifactStore({ runtimeRoot });
    const document = '{"schemaVersion":"1.0.0","decision":"approved","findings":[]}';
    // Verbatim from the run that found this: the reviewer emitted one text event of preamble and
    // another with the document, and parseEvents concatenates every text event.
    const preamble = 'Vou analisar o snapshot fechado e a evidência do gate `specs-lint` para emitir o JSON de review.';
    const shapes = [
      document,
      preamble + document,
      '```json\n' + document + '\n```',
      'Segue o review:\n```json\n' + document + '\n```\nEspero ter ajudado.',
    ];
    for (const [index, response] of shapes.entries()) {
      const ref = await store.preserveAgentResponse({
        stepId: 'step-1', attempt: index + 1, operationId: `review-${index}`, role: 'reviewer', response,
        sandboxPolicyHash: 'a'.repeat(64),
      });
      assert.deepEqual(JSON.parse(store.read(ref)), JSON.parse(document), `shape ${index} must recover the document`);
    }

    // Narrowing to the outermost braces must not turn something that is not the document into one.
    await assert.rejects(() => store.preserveAgentResponse({
      stepId: 'step-1', attempt: 9, operationId: 'review-prose', role: 'reviewer',
      response: 'Aprovado, sem ressalvas.',
      sandboxPolicyHash: 'a'.repeat(64),
    }), { code: 'UNTRUSTED_JSON_INVALID' });
  } finally {
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  }
});

test('an unparseable reviewer response is preserved as evidence and still fails the call', async () => {
  const runtimeRoot = temporaryRuntime();
  try {
    const store = createArtifactStore({ runtimeRoot });
    const prose = 'Revisei o snapshot e aprovo. Nenhum problema encontrado.';
    // The parse failure is the outcome and must survive.
    await assert.rejects(() => store.preserveAgentResponse({
      stepId: 'step-1', attempt: 1, operationId: 'review-bad', role: 'reviewer', response: prose,
      sandboxPolicyHash: 'a'.repeat(64),
    }), { code: 'UNTRUSTED_JSON_INVALID' });

    // …but so must what the agent said, or the failure can only be diagnosed by reproducing the
    // call by hand, which is exactly what this audit had to do.
    const persisted = fs.readFileSync(path.join(runtimeRoot, 'artifacts/step-1/attempt-1/agent-response-invalid.txt'), 'utf8');
    assert.match(persisted, /Revisei o snapshot/);

    // Reconciliation must never resume from it: it is evidence, not an answer.
    assert.equal(store.findAgentResponse('review-bad', 'a'.repeat(64)), null);
  } finally {
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  }
});

test('findAgentResponse reconciles every role it preserves, not only the executor', async () => {
  const runtimeRoot = temporaryRuntime();
  try {
    const store = createArtifactStore({ runtimeRoot });
    // The reconciliation seam must round-trip whatever preserveAgentResponse writes. It once looked
    // for a /response$/ suffix that 'review' and 'diagnosis' never had, so a crash after a reviewer
    // or diagnostician call could not be reconciled and the run blocked for human intervention.
    for (const [index, role] of ['executor', 'reviewer', 'diagnostician'].entries()) {
      const operationId = `operation-${role}`;
      const sandboxPolicyHash = String(index + 1).repeat(64);
      const written = await store.preserveAgentResponse({
        stepId: 'step-1', attempt: index + 1, operationId, role,
        response: JSON.stringify({ status: 'complete', role }), sandboxPolicyHash,
      });
      const found = store.findAgentResponse(operationId, sandboxPolicyHash);
      assert.ok(found, `findAgentResponse must reconcile a ${role} response`);
      assert.equal(found.artifactRef.id, written.id);
      assert.equal(found.artifactRef.hash, written.hash);
      assert.equal(store.findAgentResponse(operationId, 'f'.repeat(64)), null);
    }
    assert.equal(store.findAgentResponse('operation-absent', 'a'.repeat(64)), null);
  } finally {
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  }
});

test('evidence rejects wrong exact provenance, factual freshness, and artifact ownership', () => {
  const artifactHash = 'a'.repeat(64);
  const sourceHash = 'b'.repeat(64);
  const identityHash = 'c'.repeat(64);
  const artifact = {
    id: 'result-1', physicalId: 'physical-1', hash: artifactHash, fresh: true,
    provenance: { runId: 'run-1', stepId: 'step-1', attemptId: 'attempt-1', sourceHash, factualIdentityHash: identityHash },
  };
  const input = {
    acceptanceCriteria: [{ id: 'AC-1', evidence: [{ id: 'EV-1', kind: 'artifact', resultRef: 'result-1' }] }],
    evidence: [{ acId: 'AC-1', requirementId: 'EV-1', kind: 'artifact', hash: artifactHash, resultRef: 'result-1' }],
    artifacts: [artifact], gates: [],
    expectedContext: {
      runId: 'run-1', scope: 'local', stepId: 'step-1', attemptId: 'attempt-1', sourceHash,
      factualIdentityHash: identityHash, factualRevalidation: { ok: true, identityHash }, ownedArtifactIds: new Set(['physical-1']),
    },
  };
  assert.equal(validateEvidenceMap(input).ok, true);
  for (const mutate of [
    (value) => { value.expectedContext.runId = 'wrong-run'; },
    (value) => { value.expectedContext.sourceHash = 'd'.repeat(64); },
    (value) => { value.expectedContext.factualRevalidation.identityHash = 'e'.repeat(64); },
    (value) => { value.expectedContext.ownedArtifactIds = new Set(['other']); },
  ]) {
    const invalid = structuredClone(input);
    invalid.expectedContext.ownedArtifactIds = new Set(input.expectedContext.ownedArtifactIds);
    mutate(invalid);
    assert.equal(validateEvidenceMap(invalid).ok, false);
  }
});

test('unique post-run review namespaces preserve original review artifacts', async () => {
  const runtimeRoot = temporaryRuntime();
  try {
    const store = createArtifactStore({ runtimeRoot });
    const response = JSON.stringify({ schemaVersion: '1.0.0', decision: 'approved', summary: 'review', confidence: 'high', findings: [] });
    const original = await store.preserveAgentResponse({ stepId: 'global', attempt: 1, operationId: 'original', role: 'reviewer', response, sandboxPolicyHash: 'a'.repeat(64) });
    const originalBytes = fs.readFileSync(path.join(runtimeRoot, original.path));
    const first = await store.preserveAgentResponse({ stepId: 'review-op-one', attempt: 1, operationId: 'review-op-one', role: 'reviewer', response, sandboxPolicyHash: 'b'.repeat(64) });
    const second = await store.preserveAgentResponse({ stepId: 'review-op-two', attempt: 1, operationId: 'review-op-two', role: 'reviewer', response, sandboxPolicyHash: 'c'.repeat(64) });
    assert.notEqual(first.path, second.path);
    assert.deepEqual(fs.readFileSync(path.join(runtimeRoot, original.path)), originalBytes);
    assert.equal(store.read(original), originalBytes.toString('utf8'));
  } finally {
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  }
});
