'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { evaluateGlobalAcceptance } = require('./lib/acceptance.cjs');

const SHA = 'a'.repeat(40);
const HASH = 'b'.repeat(64);

function artifact(id) { return { id, hash: HASH, fresh: true, provenance: { runId: 'run-13' } }; }
function finding(severity) {
  return { severity, summary: 'Integrated finding', details: 'Slices conflict.', location: null, acceptanceCriterionId: null, ruleId: null, gateId: null, evidence: [] };
}
function approvedReview(findings = []) {
  const decision = findings.some((entry) => entry.severity === 'critical') ? 'blocked'
    : findings.some((entry) => entry.severity === 'high') ? 'changes_requested'
      : findings.length > 0 ? 'approved_with_findings' : 'approved';
  return { schemaVersion: '1.0.0', decision, summary: 'Global review.', confidence: 'high', findings };
}
function acceptance() {
  const artifacts = [artifact('gate-one'), artifact('gate-two'), artifact('ac-one'), artifact('docs-one')];
  return {
    schema: { spec: true, steps: true, review: true }, integration: { consistent: true }, boundaries: true, invariants: true,
    artifacts, acceptanceCriteria: [{ id: 'AC-01' }, { id: 'AC-02' }],
    evidence: [
      { acId: 'AC-01', kind: 'artifact', hash: HASH, resultRef: 'ac-one' },
      { acId: 'AC-02', kind: 'documentation', hash: HASH, resultRef: 'docs-one' },
    ],
    documentationImpacts: [{ documentationImpact: { kind: 'paths', paths: ['docs/workflow.md'] }, documentationPaths: ['docs/workflow.md'] }],
  };
}
function globalInput(overrides = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-global-'));
  const snapshotRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-global-snapshot-'));
  test.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  test.after(() => fs.rmSync(snapshotRoot, { recursive: true, force: true }));
  return {
    runId: 'run-13', baseSha: SHA, integratedWorktree: temp, snapshotRoot,
    dag: { order: ['step-1', 'step-2'], dependencies: { 'step-1': [], 'step-2': ['step-1'] } },
    steps: [
      { id: 'step-1', state: 'COMMITTED', commit: { sha: '1'.repeat(40) } },
      { id: 'step-2', state: 'COMMITTED', commit: { sha: '2'.repeat(40) } },
    ],
    globalGateIds: ['global-one', 'global-two'], globalImpactIds: ['contracts', 'documentation'],
    reviewerResource: { type: 'agent', role: 'reviewer', executable: 'opencode', readOnly: true },
    snapshotSources: {
      spec: { id: 'pipeline' }, steps: ['step-1', 'step-2'], adrs: ['ADR-015', 'ADR-017', 'ADR-018'], boundaries: {}, invariants: {},
      acceptanceCriteria: ['AC-01', 'AC-02'], agents: [], notes: [], artifacts: [], findings: [],
    },
    acceptance: acceptance(), ...overrides,
  };
}

test('a spec that declares no required test gates cannot pass global acceptance', () => {
  // AC-17: the global gates are exactly the deduplicated union of the required steps'
  // testing.gateIds. The union is reachable-empty — the schema accepts testing.required false — and
  // the orchestrator used to invent a set from the catalog's classification instead, running gates
  // nobody declared. With no declared gates there is nothing to run, and acceptance must block.
  const outcome = evaluateGlobalAcceptance({
    schema: { spec: true, steps: true, review: true },
    integration: { consistent: true }, boundaries: true, invariants: true,
    diff: { fresh: true, baseSha: SHA, headSha: SHA },
    requiredGateIds: [], gates: [],
    revalidation: { ok: true, fresh: true, impacts: { 'step-1': true } },
    review: { jsonValid: true, value: { decision: 'approved', findings: [] } },
    artifacts: [], acceptanceCriteria: [], evidence: [], documentationImpacts: [],
  });
  assert.equal(outcome.ok, false);
  assert.ok(outcome.reasons.some((reason) => reason.code === 'GLOBAL_GATE_FAILED'));
});
