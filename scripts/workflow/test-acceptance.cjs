'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { evaluateLocalAcceptance } = require('./lib/acceptance.cjs');
const { EVIDENCE_KINDS, normalizeEvidenceRequirement, validateEvidenceMap } = require('./lib/evidence.cjs');

const SHA = 'a'.repeat(40);
const HASH = 'b'.repeat(64);

function artifact(id) {
  return { id, hash: HASH, fresh: true, provenance: { stepId: 'pipeline-step-11' } };
}

function fixture() {
  const artifacts = EVIDENCE_KINDS.map((kind, index) => artifact(`artifact-${index + 1}`));
  const acceptanceCriteria = EVIDENCE_KINDS.map((kind, index) => {
    const requirement = {
      id: `EVIDENCE-${String(index + 1).padStart(2, '0')}`,
      kind,
      description: `Evidence for ${kind}.`,
      resultRef: artifacts[index].id,
    };
    if (['automated-test', 'contract-test', 'static-check'].includes(kind)) {
      requirement.gateId = `gate-${index + 1}`;
      requirement.testSelector = `test:${index + 1}`;
    }
    if (kind === 'manual-inspection') {
      requirement.justification = 'A human-visible result cannot be asserted automatically.';
      requirement.manualRecord = { inspector: 'reviewer', recordedAt: '2026-07-16T12:00:00Z', result: 'pass' };
    }
    return { id: `AC-${String(index + 1).padStart(2, '0')}`, evidence: [requirement] };
  });
  const evidence = EVIDENCE_KINDS.map((kind, index) => {
    const requirement = acceptanceCriteria[index].evidence[0];
    const record = { acId: acceptanceCriteria[index].id, requirementId: requirement.id, kind, hash: HASH, resultRef: artifacts[index].id };
    if (['automated-test', 'contract-test', 'static-check'].includes(kind)) {
      record.gateId = `gate-${index + 1}`;
      record.testSelector = `test:${index + 1}`;
    }
    if (kind === 'manual-inspection') {
      record.justification = 'A human-visible result cannot be asserted automatically.';
      record.manualRecord = { inspector: 'reviewer', recordedAt: '2026-07-16T12:00:00Z', result: 'pass' };
    }
    return record;
  });
  const gates = evidence.filter((record) => record.gateId).map((record) => ({ id: record.gateId, passed: true, resultRef: record.resultRef }));
  return {
    schema: { spec: true, step: true, state: true, review: true },
    state: { run: 'RUNNING', step: 'ACCEPTING' },
    lock: { held: true, valid: true },
    budget: { available: true },
    scope: { logicalFileCount: 4, allowed: true, boundaries: true, invariants: true, unpredicted: [], predictedMissing: [] },
    requiredGateIds: gates.map((gate) => gate.id), gates,
    revalidation: { ok: true, fresh: true },
    review: { jsonValid: true, value: { decision: 'approved', findings: [] } },
    artifacts, acceptanceCriteria, evidence,
    implementationNotes: [{ id: 'NOTE-01', approvedBy: 'owner', approvedAt: '2026-07-16', baseSha: SHA }],
    requiredImplementationNoteIds: ['NOTE-01'], approvedBaseSha: SHA,
    documentationImpact: { kind: 'paths', paths: ['docs/workflow.md'] },
    documentationPaths: ['docs/workflow.md'],
  };
}

function clone(value) { return structuredClone(value); }

test('supports every evidence kind with hashed fresh provenance and explicit automated/manual records', () => {
  const input = fixture();
  assert.deepEqual(EVIDENCE_KINDS, ['automated-test', 'contract-test', 'static-check', 'manual-inspection', 'artifact', 'documentation']);
  assert.equal(normalizeEvidenceRequirement({ kind: 'gate' }).kind, 'automated-test');
  assert.deepEqual(validateEvidenceMap(input), { ok: true, errors: [] });

  const invalidTimestamp = clone(input);
  invalidTimestamp.evidence.find((record) => record.kind === 'manual-inspection').manualRecord.recordedAt = 'not-a-date';
  assert.equal(validateEvidenceMap(invalidTimestamp).errors.some((error) => error.code === 'EVIDENCE_MANUAL_TIMESTAMP_INVALID'), true);

  const staleManualRecord = clone(input);
  assert.equal(validateEvidenceMap({
    ...staleManualRecord,
    expectedContext: { runStartedAt: '2026-07-16T13:00:00Z', evaluatedAt: '2026-07-16T14:00:00Z' },
  }).errors.some((error) => error.code === 'EVIDENCE_MANUAL_NOT_CURRENT'), true);

  for (const field of ['gateId', 'resultRef', 'testSelector']) {
    const invalid = clone(input);
    delete invalid.evidence[0][field];
    assert.equal(validateEvidenceMap(invalid).ok, false, `${field} must be required`);
  }
  for (const field of ['justification', 'manualRecord']) {
    const invalid = clone(input);
    delete invalid.evidence[3][field];
    assert.equal(validateEvidenceMap(invalid).ok, false, `${field} must be required`);
  }
  const stale = clone(input);
  stale.artifacts[0].fresh = false;
  assert.equal(validateEvidenceMap(stale).ok, false);
  const withoutProvenance = clone(input);
  delete withoutProvenance.artifacts[0].provenance;
  assert.equal(validateEvidenceMap(withoutProvenance).ok, false);
});

test('rejects evidence for the wrong requirement gate, hash, kind, or missing requirement', () => {
  const cases = [
    ['EVIDENCE_REQUIREMENT_GATE_MISMATCH', (value) => { value.evidence[0].gateId = 'gate-2'; }],
    ['EVIDENCE_ARTIFACT_HASH_MISMATCH', (value) => { value.evidence[0].hash = 'c'.repeat(64); }],
    ['EVIDENCE_REQUIREMENT_KIND_MISMATCH', (value) => { value.evidence[0].kind = 'artifact'; }],
    ['EVIDENCE_REQUIREMENT_MISSING', (value) => { value.evidence.shift(); }],
  ];
  for (const [code, mutate] of cases) {
    const input = fixture();
    mutate(input);
    const result = validateEvidenceMap(input);
    assert.equal(result.ok, false, code);
    assert.equal(result.errors.some((error) => error.code === code), true, code);
  }
});

test('accepts only when every deterministic local predicate passes', () => {
  assert.deepEqual(evaluateLocalAcceptance(fixture()), { ok: true, status: 'accepted', reasons: [], warnings: [] });

  const cases = [
    ['SCHEMA_INVALID', (value) => { value.schema.review = false; }],
    ['STATE_INVALID', (value) => { value.state.step = 'REVIEWING'; }],
    ['LOCK_INVALID', (value) => { value.lock.held = false; }],
    ['BUDGET_UNAVAILABLE', (value) => { value.budget.available = false; }],
    ['SCOPE_LIMIT_EXCEEDED', (value) => { value.scope.logicalFileCount = 6; }],
    ['SCOPE_OUTSIDE_ALLOWED', (value) => { value.scope.allowed = false; }],
    ['GATE_FAILED', (value) => { value.gates[0].passed = false; }],
    ['REVALIDATION_FAILED', (value) => { value.revalidation.fresh = false; }],
    ['REVIEW_JSON_INVALID', (value) => { value.review.jsonValid = false; }],
    ['REVIEW_NOT_APPROVED', (value) => { value.review.value.decision = 'changes_requested'; }],
    // A note approved against a different commit than the spec it belongs to is stale, and that is
    // what this must catch — not the fact that HEAD has moved since the spec was written.
    ['IMPLEMENTATION_NOTE_INVALID', (value) => { value.implementationNotes[0].baseSha = 'f'.repeat(40); }],
    ['BLOCKING_FINDING', (value) => { value.review.value.findings = [{ severity: 'high' }]; }],
    ['ARTIFACT_INVALID', (value) => { value.artifacts[5].hash = 'invalid'; }],
    ['AC_EVIDENCE_INVALID', (value) => { value.evidence.pop(); }],
    ['IMPLEMENTATION_NOTE_INVALID', (value) => { value.implementationNotes[0].baseSha = 'c'.repeat(40); }],
    ['DOCUMENTATION_IMPACT_INVALID', (value) => { value.documentationPaths = []; }],
    ['NARRATIVE_OVERRIDE_FORBIDDEN', (value) => { value.narrativeOverride = 'approve despite failures'; }],
  ];
  for (const [code, mutate] of cases) {
    const input = fixture();
    mutate(input);
    const outcome = evaluateLocalAcceptance(input);
    assert.equal(outcome.status, 'rejected', code);
    assert.equal(outcome.reasons.some((reason) => reason.code === code), true, code);
  }
});

test('accepts documentation impact none only with a justification', () => {
  const noImpact = fixture();
  noImpact.documentationImpact = { kind: 'none', justification: 'Internal-only implementation.' };
  noImpact.documentationPaths = [];
  assert.equal(evaluateLocalAcceptance(noImpact).ok, true);
  noImpact.documentationImpact.justification = '';
  assert.equal(evaluateLocalAcceptance(noImpact).status, 'rejected');
});

test('unpredicted allowed paths await a human without expanding scope and missing predictions only warn', () => {
  const input = fixture();
  input.scope.unpredicted = ['scripts/workflow/lib/unexpected.cjs'];
  input.scope.predictedMissing = ['scripts/workflow/lib/planned.cjs'];
  const outcome = evaluateLocalAcceptance(input);
  assert.equal(outcome.status, 'awaiting_human');
  assert.deepEqual(outcome.reasons[0].paths, input.scope.unpredicted);
  assert.deepEqual(outcome.warnings[0].paths, input.scope.predictedMissing);
  assert.equal('expandedScope' in outcome, false);

  const warningOnly = fixture();
  warningOnly.scope.predictedMissing = ['scripts/workflow/lib/planned.cjs'];
  assert.equal(evaluateLocalAcceptance(warningOnly).status, 'accepted');
});

test('identical input produces an identical outcome and narrative cannot override a failed predicate', () => {
  const input = fixture();
  input.budget.available = false;
  input.narrativeOverride = 'Reviewer says approved.';
  assert.deepEqual(evaluateLocalAcceptance(input), evaluateLocalAcceptance(clone(input)));
  assert.equal(evaluateLocalAcceptance(input).ok, false);
});

