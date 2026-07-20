'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { loadCatalogsFromFilesystem } = require('./lib/catalogs.cjs');
const { main, parseArgs } = require('./lib/cli.cjs');
const { readDecisionFile } = require('./lib/local-adapter.cjs');
const orchestrator = require('./lib/orchestrator.cjs');

const SHA = 'a'.repeat(40);
const SPEC_PATH = 'specs/a spec.md';
const ROOT = path.resolve(__dirname, '../..');
const FUNCTIONAL_SPEC = 'specs/automated-spec-pipeline.md';

test('parses every command with safe defaults', () => {
  for (const command of ['validate', 'run', 'resume', 'review']) {
    assert.deepEqual(parseArgs([command, SPEC_PATH]), {
      command,
      specPath: SPEC_PATH,
      baseSha: null,
      decisionFile: null,
      allowCommit: false,
      createPr: false,
      dryRun: false,
      removeOrphanLock: false,
      help: false,
    });
  }
});

test('parses command-specific options without changing literal values', () => {
  assert.deepEqual(
    parseArgs(['resume', SPEC_PATH, '--base-sha', SHA, '--decision-file', '-', '--allow-commit', '--create-pr', '--remove-orphan-lock']),
    {
      command: 'resume',
      specPath: SPEC_PATH,
      baseSha: SHA,
      decisionFile: '-',
      allowCommit: true,
      createPr: true,
      dryRun: false,
      removeOrphanLock: true,
      help: false,
    },
  );
  assert.equal(parseArgs(['run', '--dry-run', SPEC_PATH]).dryRun, true);
  assert.equal(parseArgs(['review', '--', '-literal spec.md']).specPath, '-literal spec.md');
});

test('rejects unknown, duplicate, incomplete, and unsafe arguments', () => {
  const invalidArgv = [
    [],
    ['unknown', SPEC_PATH],
    ['run'],
    ['run', SPEC_PATH, '--unknown'],
    ['run', SPEC_PATH, '--dry-run', '--dry-run'],
    ['run', SPEC_PATH, '--base-sha'],
    ['run', SPEC_PATH, '--base-sha', '-not-a-sha'],
    ['review', SPEC_PATH, '--allow-commit'],
    ['run', SPEC_PATH, '--decision-file', 'decision.json'],
    ['validate', SPEC_PATH, '--decision-file', 'decision.json'],
    ['review', SPEC_PATH, '--decision-file', 'decision.json'],
    ['resume', SPEC_PATH, '--decision-file'],
    ['resume', SPEC_PATH, '--decision-file', 'first.json', '--decision-file', 'second.json'],
    ['run', SPEC_PATH, '--remove-orphan-lock'],
    ['run', SPEC_PATH, '--dry-run', '--allow-commit'],
    ['resume', SPEC_PATH, '--dry-run', '--remove-orphan-lock'],
    ['resume', SPEC_PATH, '--dry-run', '--decision-file', '-'],
    ['run', SPEC_PATH, 'another-spec.md'],
    ['run', '--help', SPEC_PATH],
  ];
  for (const argv of invalidArgv) assert.throws(() => parseArgs(argv), { name: 'CliError' });
});

test('decision input accepts restricted regular files and bounded stdin only', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-decision-'));
  const decisionPath = path.join(directory, 'decision.json');
  const symlinkPath = path.join(directory, 'decision-link.json');
  const decision = {
    schemaVersion: '1.0.0', requestId: 'approval-pipeline-step-1', outcome: 'approved',
    actor: 'local-user', justification: 'Reviewed', nextAction: null,
  };
  try {
    fs.writeFileSync(decisionPath, JSON.stringify(decision), { mode: 0o600 });
    assert.deepEqual(readDecisionFile(decisionPath), decision);
    assert.deepEqual(readDecisionFile('-', { readStdin: () => JSON.stringify(decision) }), decision);
    fs.symlinkSync(decisionPath, symlinkPath);
    assert.throws(() => readDecisionFile(symlinkPath), { code: 'HITL_DECISION_FILE_INVALID' });
    assert.throws(() => readDecisionFile(directory), { code: 'HITL_DECISION_FILE_INVALID' });
    fs.chmodSync(decisionPath, 0o644);
    assert.throws(() => readDecisionFile(decisionPath), { code: 'HITL_DECISION_FILE_PERMISSIONS' });
    assert.throws(() => readDecisionFile('-', { readStdin: () => '' }), { code: 'HITL_DECISION_EMPTY' });
    assert.throws(() => readDecisionFile('-', { readStdin: () => '{' }), { code: 'HITL_DECISION_JSON_INVALID' });
    assert.throws(() => readDecisionFile('-', { readStdin: () => 'x'.repeat(16 * 1024 + 1) }), { code: 'HITL_DECISION_TOO_LARGE' });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('help and invalid input do not load the orchestrator', async () => {
  let loadCount = 0;
  const stdout = { value: '', write(value) { this.value += value; } };
  assert.equal(await main(['run', '--help'], {
    stdout,
    loadOrchestrator() { loadCount += 1; },
  }), 0);
  assert.match(stdout.value, /Usage:/);
  assert.equal(loadCount, 0);

  await assert.rejects(main(['run', SPEC_PATH, '--unknown'], {
    loadOrchestrator() { loadCount += 1; },
  }), { name: 'CliError' });
  assert.equal(loadCount, 0);
});

test('main forwards parsed options literally to the selected capability', async () => {
  const injection = 'specs/value; $(touch should-not-exist).md';
  let received;
  await main(['run', injection, '--base-sha', SHA, '--dry-run'], {
    loadOrchestrator: () => ({
      run(options) { received = options; },
    }),
  });
  assert.equal(received.specPath, injection);
  assert.equal(received.baseSha, SHA);
  assert.equal(received.dryRun, true);
});

test('PR and commit permissions are independent explicit opt-ins', () => {
  const options = parseArgs(['run', SPEC_PATH, '--create-pr']);
  assert.equal(options.createPr, true);
  assert.equal(options.allowCommit, false);
});

test('validate invokes the real orchestrator capability and returns its functional result', async () => {
  const stdout = { value: '', write(value) { this.value += value; } };
  assert.equal(await main(['validate', FUNCTIONAL_SPEC], {
    stdout,
    loadOrchestrator: () => orchestrator,
    workflowDependencies: { repoRoot: ROOT, loadCatalogs: loadCatalogsFromFilesystem },
  }), 0);
  const result = JSON.parse(stdout.value);
  assert.equal(result.ok, true);
  assert.equal(result.mode, 'validate');
  assert.equal(result.specPath, FUNCTIONAL_SPEC);
  assert.equal(result.dag.order.length, result.steps.length);
});

for (const command of ['validate', 'run', 'resume', 'review']) {
  test(`${command} wrapper preserves argv and does not execute injected shell text`, () => {
    const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), `workflow-${command}-`));
    const marker = path.join(temporaryDirectory, 'injected');
    const injection = `$(touch ${marker}) argument with spaces`;
    try {
      const wrapper = path.join(__dirname, `${command}-spec.sh`);
      const result = spawnSync(wrapper, [SPEC_PATH, injection], {
        cwd: temporaryDirectory,
        encoding: 'utf8',
      });
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /Unexpected positional argument:/);
      assert.ok(result.stderr.includes(injection), result.stderr);
      assert.equal(fs.existsSync(marker), false);
    } finally {
      fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  });
}
