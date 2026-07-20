'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { createArtifactStore } = require('./lib/artifacts.cjs');
const { loadCatalogsFromFilesystem } = require('./lib/catalogs.cjs');
const { decisionForFindings, deduplicateFindings, highCorrectionEligible } = require('./lib/findings.cjs');
const { loadReviewContext } = require('./lib/local-adapter.cjs');
const { SNAPSHOT_PARTS, backlogFinding, createClosedSnapshot, createReviewRunner, parseRoleOutput } = require('./lib/review.cjs');
const orchestratorModule = require('./lib/orchestrator.cjs');

const ROOT = path.resolve(__dirname, '../..');

function temporary(prefix) { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }

function finding(severity, overrides = {}) {
  return {
    id: `finding-${severity}`, category: 'correctness', status: 'open', severity, autoFixEligible: false,
    file: null, line: null, title: `${severity} finding`, description: 'Structured details.',
    evidence: ['artifact-evidence'], impact: 'The reviewed behavior may be incorrect.',
    suggestedCorrection: null, acceptanceTest: null, boundaryViolation: false, invariantViolation: false,
    ...overrides,
  };
}

function review(findings = []) {
  const internal = findings.map((entry) => ({
    severity: entry.severity, summary: entry.title, details: entry.description, location: null,
    acceptanceCriterionId: null,
    ruleId: entry.boundaryViolation ? 'boundary-violation' : (entry.invariantViolation ? 'invariant-violation' : null),
    gateId: null, evidence: entry.evidence,
  }));
  return { schemaVersion: '1.0.0', decision: decisionForFindings(internal), summary: 'Structured review.', confidence: 'high', findings };
}

test('creates a closed sanitized and hashed snapshot outside the worktree with every required part', () => {
  const worktree = temporary('workflow-target-');
  const snapshotRoot = temporary('workflow-snapshots-');
  const sources = Object.fromEntries(SNAPSHOT_PARTS.map((name) => [name, { name, password: 'must-not-leak' }]));
  const snapshot = createClosedSnapshot({ worktree, snapshotRoot, sources });
  assert.equal(snapshot.closed, true);
  assert.deepEqual(Object.keys(snapshot.parts), SNAPSHOT_PARTS);
  assert.equal(snapshot.path.startsWith(`${worktree}${path.sep}`), false);
  for (const part of Object.values(snapshot.parts)) {
    assert.match(part.hash, /^[0-9a-f]{64}$/);
    assert.equal(fs.readFileSync(path.join(snapshot.path, part.file), 'utf8').includes('must-not-leak'), false);
  }
  assert.equal(JSON.parse(fs.readFileSync(snapshot.manifestPath, 'utf8')).closed, true);
  assert.throws(() => fs.writeFileSync(path.join(snapshot.path, 'new-file'), 'mutation'));
});

test('rejects a truncated snapshot before creating a review directory', () => {
  const worktree = temporary('workflow-target-truncated-');
  const snapshotRoot = temporary('workflow-snapshots-truncated-');
  const sources = Object.fromEntries(SNAPSHOT_PARTS.map((name) => [name, name === 'diff' ? 'x'.repeat(1024) : name]));
  assert.throws(() => createClosedSnapshot({ worktree, snapshotRoot, sources, maxBytes: 128 }), {
    code: 'SNAPSHOT_PART_TRUNCATED', details: { part: 'diff' },
  });
  assert.deepEqual(fs.readdirSync(snapshotRoot), []);
});

test('normalizes reviewer findings for the persisted backlog contract', () => {
  assert.deepEqual(backlogFinding(finding('medium')), {
    severity: 'medium', summary: 'medium finding', details: 'Structured details.', location: null,
    acceptanceCriterionId: null, ruleId: null, gateId: null, evidence: ['artifact-evidence'],
  });
});

test('review context contains complete Markdown, declared ADRs, applicable AGENTS, and contracts and fails closed when incomplete', async () => {
  const validation = await orchestratorModule.validate(
    { specPath: 'specs/automated-spec-pipeline.md' },
    { repoRoot: ROOT, loadCatalogs: loadCatalogsFromFilesystem },
  );
  const context = loadReviewContext(ROOT, validation, validation.steps[0]);
  assert.equal(context.spec.content, fs.readFileSync(path.join(ROOT, validation.specPath), 'utf8'));
  assert.equal(context.steps[0].content, fs.readFileSync(path.join(ROOT, validation.steps[0].source.path), 'utf8'));
  assert.deepEqual(context.adrs.map((entry) => path.basename(entry.path).slice(0, 3)), ['015', '017', '018']);
  assert.ok(context.adrs.every((entry) => entry.content.includes('## Decision')));
  assert.ok(context.agents.some((entry) => entry.path === 'AGENTS.md' && entry.content.includes('# Agent Operating Manual')));
  assert.ok(context.contracts.some((entry) => entry.path === 'schemas/step.schema.json' && entry.content.includes('Normalized atomic step')));
  assert.ok(context.contracts.some((entry) => entry.path === 'workflow/gates.yaml' && entry.content.includes('workflow-tests')));

  assert.throws(
    () => loadReviewContext(ROOT, { ...validation, specPath: 'specs/missing.md' }, validation.steps[0]),
    { code: 'REVIEW_CONTEXT_MISSING' },
  );
  assert.throws(
    () => loadReviewContext(ROOT, { ...validation, steps: Array(100).fill(validation.steps[0]) }, null),
    { code: 'REVIEW_CONTEXT_TOO_LARGE' },
  );
});

test('uses closed severity and decision enums and never approves invalid JSON or prose', () => {
  for (const severity of ['critical', 'high', 'medium', 'low']) assert.doesNotThrow(() => parseRoleOutput('reviewer', JSON.stringify(review([finding(severity)]))));
  assert.throws(() => parseRoleOutput('reviewer', JSON.stringify({ ...review([]), findings: [{ ...finding('low'), severity: 'blocker' }] })), { code: 'ROLE_SCHEMA_INVALID' });
  assert.throws(() => parseRoleOutput('reviewer', 'Approved. Everything looks good.'), { code: 'ROLE_JSON_INVALID' });
  assert.throws(() => parseRoleOutput('reviewer', JSON.stringify({ ...review([]), decision: 'pass' })), { code: 'ROLE_SCHEMA_INVALID' });
  assert.throws(() => parseRoleOutput('reviewer', JSON.stringify({ ...review([finding('critical')]), decision: 'approved' })), { code: 'REVIEW_DECISION_INVALID' });
  assert.equal(review([finding('critical')]).decision, 'blocked');
  assert.equal(review([finding('high')]).decision, 'changes_requested');
  assert.equal(review([finding('medium')]).decision, 'approved_with_findings');
  assert.equal(review([finding('low', { boundaryViolation: true })]).decision, 'changes_requested');
});

test('high eligibility is conditional, correction creation stays absent, and dedup keeps occurrences', () => {
  const legacyFinding = (severity, overrides = {}) => ({
    severity, summary: `${severity} finding`, details: 'Structured details.', location: null,
    acceptanceCriterionId: null, ruleId: null, gateId: null, evidence: ['artifact-evidence'], ...overrides,
  });
  const eligible = legacyFinding('high', { correctionConditions: { withinStepScope: true, deterministic: true, regressionTest: true, requiresArchitecturalDecision: false } });
  assert.equal(highCorrectionEligible(eligible), true);
  assert.equal(highCorrectionEligible(legacyFinding('high')), false);
  const duplicate = deduplicateFindings([legacyFinding('medium'), legacyFinding('medium', { evidence: ['artifact-second'] })], { reviewId: 'review-1' });
  assert.equal(duplicate.length, 1);
  assert.equal(duplicate[0].occurrences.length, 2);
  assert.deepEqual(duplicate[0].evidence, ['artifact-evidence', 'artifact-second']);
  const escalated = deduplicateFindings([
    legacyFinding('low', { summary: 'same finding', details: 'old' }),
    legacyFinding('medium', { summary: 'same finding', details: 'new' }),
  ], { reviewId: 'review-1' });
  assert.equal(escalated[0].severity, 'medium');
  assert.equal(escalated[0].details, 'new');
  assert.equal('correctionStep' in duplicate[0], false);
});

function runnerFixture(outputs) {
  const runtimeRoot = temporary('workflow-review-runtime-');
  const artifacts = createArtifactStore({ runtimeRoot });
  const calls = [];
  let index = 0;
  const orchestrator = {
    async execute(input) {
      calls.push(input);
      const ref = artifacts.preserve({
        stepId: input.stepId, attempt: input.attempt, kind: `${input.role}-response-${input.attempt}`,
        mediaType: 'text/plain', content: outputs[index++], provenance: { operationId: input.operationId, role: input.role },
      });
      return { ok: true, artifactRef: ref };
    },
  };
  return { artifacts, calls, runner: createReviewRunner({ orchestrator, artifacts }) };
}

function runnerInput(overrides = {}) {
  return {
    operationId: 'operation-10', stepId: 'pipeline-step-10', attempt: 1,
    snapshot: { path: temporary('workflow-closed-snapshot-'), hash: 'a'.repeat(64), sourceHash: 'b'.repeat(64), closed: true },
    targetWorktree: temporary('workflow-review-target-'),
    resource: { type: 'agent', role: 'reviewer', executable: 'opencode', readOnly: true },
    ...overrides,
  };
}

test('retries invalid reviewer JSON within budget and appends only medium/low to sanitized backlog', async () => {
  const valid = review([finding('medium'), finding('low'), finding('high')]);
  const fixture = runnerFixture(['approval in prose', JSON.stringify(valid)]);
  const input = runnerInput();
  const result = await fixture.runner.review(input);
  assert.equal(result.ok, true);
  assert.equal(result.cycles, 2);
  assert.equal(result.review.decision, 'changes_requested');
  assert.deepEqual(result.backlog.findings.map((entry) => entry.severity), ['medium', 'low']);
  assert.equal(result.correctionCreationEnabled, false);
  assert.equal(fixture.calls.length, 2);
  assert.notEqual(fixture.calls[0].operationId, fixture.calls[1].operationId, 'each retry must be fresh');
  for (const call of fixture.calls) {
    assert.equal(call.worktree, input.snapshot.path);
    assert.equal(call.targetWorktree, input.targetWorktree);
  }
  assert.equal(fixture.calls[0].budgetAction, 'review');
  assert.deepEqual(fixture.calls[0].predictedFiles, []);
  assert.deepEqual(fixture.calls[0].allowedAreas, ['.']);
});

test('exhausts the bounded invalid JSON retry without accepting narrative approval', async () => {
  const fixture = runnerFixture(['approved', 'still approved']);
  const result = await fixture.runner.review(runnerInput());
  assert.equal(result.ok, false);
  assert.equal(result.blocked, true);
  assert.equal(result.code, 'ROLE_JSON_INVALID');
  assert.equal(result.cycles, 2);
  assert.equal(fixture.calls.length, 2);
});

test('diagnosis has a separate read-only schema and cannot approve or edit', async () => {
  const diagnosis = {
    schemaVersion: '1.0.0', rootCause: 'Repeated timeout.', confidence: 'medium', evidence: ['artifact-timeout'],
    recommendedAction: 'Retry after checking service availability.', scopeImpact: 'The current step cannot complete.', requiresHumanDecision: false,
  };
  assert.throws(() => parseRoleOutput('diagnostician', JSON.stringify({ ...diagnosis, decision: 'approved' })), { code: 'ROLE_SCHEMA_INVALID' });
  assert.throws(() => parseRoleOutput('diagnostician', JSON.stringify({ ...diagnosis, edits: ['src/file'] })), { code: 'ROLE_SCHEMA_INVALID' });
  const fixture = runnerFixture([JSON.stringify(diagnosis)]);
  const result = await fixture.runner.diagnose(runnerInput({ resource: { type: 'agent', role: 'diagnostician', executable: 'opencode', readOnly: true } }));
  assert.equal(result.ok, true);
  assert.equal(result.diagnosis.recommendedAction, 'Retry after checking service availability.');
  assert.equal(fixture.calls[0].role, 'diagnostician');
  assert.equal(fixture.calls[0].budgetAction, 'diagnosis');
  assert.equal('backlog' in result, false);
});

function fullValidation() { return { ok: true, checks: { hashes: true, base: true, catalog: true, lock: true } }; }

