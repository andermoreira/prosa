'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const {
  assessRisk,
  fingerprintRiskSignal,
  loadRiskPolicyFromGit,
  validateRiskPolicySource,
} = require('./lib/risk-policy.cjs');

const ROOT = path.resolve(__dirname, '../..');
const POLICY_SOURCE = fs.readFileSync(path.join(ROOT, 'workflow/risk-policy.yaml'), 'utf8');

function policyRecord(source = POLICY_SOURCE) {
  const result = validateRiskPolicySource(source, { type: 'test' });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  return result.value;
}

function step(overrides = {}) {
  return {
    schemaVersion: '2.0.0',
    id: 'spec-example-step-1',
    changeType: 'documentation',
    predictedFiles: ['docs/example.md'],
    allowedAreas: ['docs'],
    ...overrides,
  };
}

function signal(overrides = {}) {
  const value = {
    schemaVersion: '1.0.0',
    source: { type: 'test-producer', id: 'fixture' },
    kind: 'test-escalation',
    minimumLevel: 'approval_required',
    reason: 'A deterministic test signal',
    evidenceRefs: ['artifact:test'],
    observedAt: '2026-07-19T00:00:00.000Z',
    ...overrides,
  };
  value.fingerprint = fingerprintRiskSignal(value);
  return value;
}

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

test('validates the closed policy contract and rejects unsafe or ambiguous policies', () => {
  const valid = validateRiskPolicySource(POLICY_SOURCE);
  assert.equal(valid.ok, true, JSON.stringify(valid.errors));
  assert.match(valid.value.hash, /^[0-9a-f]{64}$/);
  assert.equal(Object.isFrozen(valid.value.policy), true);

  const unknownField = validateRiskPolicySource(POLICY_SOURCE.replace('schemaVersion: 1.0.0', 'schemaVersion: 1.0.0\nunknown: true'));
  assert.equal(unknownField.ok, false);
  assert.ok(unknownField.errors.some((error) => error.code === 'RISK_POLICY_SCHEMA_ADDITIONALPROPERTIES'));

  const invalidScale = validateRiskPolicySource(POLICY_SOURCE.replace('{id: autonomous, rank: 0}', '{id: autonomous, rank: 2}'));
  assert.equal(invalidScale.ok, false);
  assert.ok(invalidScale.errors.some((error) => error.code === 'RISK_POLICY_LEVELS_INVALID'));

  const duplicateArea = validateRiskPolicySource(POLICY_SOURCE.replace(
    '  - {id: schemas, prefix: schemas/, minimumLevel: approval_required}',
    '  - {id: workflow-policy-copy, prefix: workflow/, minimumLevel: restricted}',
  ));
  assert.equal(duplicateArea.ok, false);
  assert.ok(duplicateArea.errors.some((error) => error.code === 'RISK_POLICY_DUPLICATE_AREA_PREFIX'));

  const missingType = validateRiskPolicySource(POLICY_SOURCE.replace('  permissions: restricted\n', ''));
  assert.equal(missingType.ok, false);
  assert.ok(missingType.errors.some((error) => error.code === 'RISK_POLICY_CHANGE_TYPE_REQUIRED'));
});

test('loads only the risk policy committed at the approved baseSha', async () => {
  const repo = temporaryDirectory('workflow-risk-policy-git-');
  fs.mkdirSync(path.join(repo, 'workflow'));
  fs.writeFileSync(path.join(repo, 'workflow/risk-policy.yaml'), POLICY_SOURCE);
  git(repo, ['init', '-q']);
  git(repo, ['add', 'workflow/risk-policy.yaml']);
  git(repo, ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'risk policy']);
  const baseSha = git(repo, ['rev-parse', 'HEAD']);
  fs.writeFileSync(path.join(repo, 'workflow/risk-policy.yaml'), POLICY_SOURCE.replace('documentation: autonomous', 'documentation: restricted'));

  const loaded = await loadRiskPolicyFromGit(repo, baseSha);
  assert.equal(loaded.ok, true, JSON.stringify(loaded.errors));
  assert.deepEqual(loaded.value.origin, { type: 'git', baseSha, path: 'workflow/risk-policy.yaml' });
  assert.equal(loaded.value.hash, policyRecord(POLICY_SOURCE).hash);
  assert.notEqual(loaded.value.hash, policyRecord(fs.readFileSync(path.join(repo, 'workflow/risk-policy.yaml'), 'utf8')).hash);
  assert.equal(loaded.value.policy.changeTypes.documentation, 'autonomous');
  assert.equal((await loadRiskPolicyFromGit(repo, '--help')).errors[0].code, 'INVALID_BASE_SHA');
  assert.equal((await loadRiskPolicyFromGit(repo, 'f'.repeat(40))).errors[0].code, 'GIT_RISK_POLICY_READ_ERROR');
});

test('classifies every v2 changeType and lets area rules only raise base risk', () => {
  const record = policyRecord();
  const expected = {
    bugfix: 'autonomous', test: 'autonomous', vetted_dependency: 'autonomous', documentation: 'autonomous',
    feature: 'approval_required', api_contract: 'approval_required', database_migration: 'approval_required',
    architecture: 'restricted', security: 'restricted', irreversible: 'restricted', infrastructure: 'restricted', permissions: 'restricted',
  };
  for (const [changeType, level] of Object.entries(expected)) {
    const assessment = assessRisk({ policyRecord: record, step: step({ changeType }) });
    assert.equal(assessment.baseLevel, level, changeType);
    assert.equal(assessment.effectiveLevel, level, changeType);
  }

  const areaRaised = assessRisk({
    policyRecord: record,
    step: step({ predictedFiles: ['docs/standards/security/core.md'], allowedAreas: ['docs'] }),
  });
  assert.equal(areaRaised.typeLevel, 'autonomous');
  assert.equal(areaRaised.baseLevel, 'restricted');
  assert.deepEqual(areaRaised.matchedAreaRules.map((rule) => rule.id), ['security-policy']);

  const runtimeRaised = assessRisk({
    policyRecord: record,
    step: step({ predictedFiles: ['scripts/workflow/lib/risk-policy.cjs'], allowedAreas: ['scripts/workflow/lib'] }),
  });
  assert.equal(runtimeRaised.baseLevel, 'restricted');

  assert.throws(
    () => assessRisk({ policyRecord: record, step: step({ changeType: 'unknown' }) }),
    { code: 'RISK_CHANGE_TYPE_UNKNOWN' },
  );
  for (const invalidPath of ['./workflow/risk-policy.yaml', '../risk-policy.yaml', 'workflow\\risk-policy.yaml']) {
    assert.throws(
      () => assessRisk({ policyRecord: record, step: step({ predictedFiles: [invalidPath] }) }),
      { code: 'RISK_STEP_PATHS_INVALID' },
    );
  }
});

test('classifies v1 as restricted with an auditable legacy signal regardless of behaviorType', () => {
  const legacy = step({ schemaVersion: '1.0.0', behaviorType: 'vertical' });
  delete legacy.changeType;
  const assessment = assessRisk({ policyRecord: policyRecord(), step: legacy });
  assert.equal(assessment.baseLevel, 'restricted');
  assert.equal(assessment.effectiveLevel, 'restricted');
  assert.equal(assessment.step.changeType, null);
  assert.deepEqual(assessment.legacySignal, {
    kind: 'legacy-step-without-change-type',
    minimumLevel: 'restricted',
    reason: 'Legacy step without changeType is restricted',
  });
});

test('aggregates duplicate and out-of-order signals deterministically and monotonically', () => {
  const record = policyRecord();
  const retry = signal({ source: { type: 'attempt', id: 'attempt-2' }, kind: 'retry', reason: 'Second attempt' });
  const restricted = signal({
    source: { type: 'reviewer', id: 'local-review' },
    kind: 'high-finding',
    minimumLevel: 'restricted',
    reason: 'High finding in local review',
    evidenceRefs: ['artifact:review-1'],
  });
  const first = assessRisk({ policyRecord: record, step: step(), signals: [restricted, retry, retry] });
  const reordered = assessRisk({ policyRecord: record, step: step(), signals: [retry, restricted] });
  assert.equal(first.effectiveLevel, 'restricted');
  assert.equal(first.signals.length, 2);
  assert.equal(first.hash, reordered.hash);
  assert.deepEqual(first, reordered);

  const afterRetry = assessRisk({ policyRecord: record, step: step(), signals: [retry] });
  assert.equal(afterRetry.effectiveLevel, 'approval_required');
  const preserved = assessRisk({ policyRecord: record, step: step(), previousEffectiveLevel: first.effectiveLevel });
  assert.equal(preserved.effectiveLevel, 'restricted');
});

test('accepts a fictitious producer through the generic envelope and fails closed on tampering', () => {
  const future = signal({
    source: { type: 'future-analyzer', id: 'prototype' },
    kind: 'novel-risk',
    minimumLevel: 'restricted',
    reason: 'A future producer observed a restricted risk',
    evidenceRefs: ['artifact:future-1'],
  });
  const assessment = assessRisk({ policyRecord: policyRecord(), step: step(), signals: [future] });
  assert.equal(assessment.effectiveLevel, 'restricted');
  assert.equal(assessment.signals[0].source.type, 'future-analyzer');

  assert.throws(
    () => assessRisk({ policyRecord: policyRecord(), step: step(), signals: [{ ...future, reason: 'Tampered' }] }),
    { code: 'RISK_SIGNAL_FINGERPRINT_INVALID' },
  );
});
