'use strict';

const EVIDENCE_KINDS = Object.freeze([
  'automated-test',
  'contract-test',
  'static-check',
  'manual-inspection',
  'artifact',
  'documentation',
]);
const HASH = /^[0-9a-f]{64}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const AUTOMATED_KINDS = new Set(['automated-test', 'contract-test', 'static-check']);
const LEGACY_KINDS = Object.freeze({ gate: 'automated-test', test: 'automated-test', diff: 'artifact', review: 'manual-inspection' });

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function validateArtifact(ref, expected) {
  const structurallyValid = Boolean(
    ref
    && nonEmpty(ref.id)
    && HASH.test(ref.hash || '')
    && ref.fresh === true
    && ref.provenance
    && typeof ref.provenance === 'object'
    && !Array.isArray(ref.provenance)
    && Object.keys(ref.provenance).length > 0
  );
  if (!structurallyValid) return false;
  if (!expected || typeof expected !== 'object') return true;
  const scopeStepId = expected.scope === 'global' ? null : expected.stepId;
  return ref.provenance.runId === expected.runId
    && ref.provenance.stepId === scopeStepId
    && ref.provenance.attemptId === (expected.scope === 'global' ? null : expected.attemptId)
    && ref.provenance.sourceHash === expected.sourceHash
    && ref.provenance.factualIdentityHash === expected.factualIdentityHash
    && expected.factualRevalidation?.ok === true
    && expected.factualRevalidation.identityHash === expected.factualIdentityHash
    && (expected.ownedArtifactIds instanceof Set
      ? expected.ownedArtifactIds.has(ref.physicalId || ref.id)
      : Array.isArray(expected.ownedArtifactIds) && expected.ownedArtifactIds.includes(ref.physicalId || ref.id));
}

function normalizeEvidenceRequirement(requirement) {
  if (!requirement || typeof requirement !== 'object') return requirement;
  return { ...requirement, kind: LEGACY_KINDS[requirement.kind] || requirement.kind };
}

function validateEvidenceMap(input) {
  const errors = [];
  const criteria = Array.isArray(input?.acceptanceCriteria) ? input.acceptanceCriteria : [];
  const records = Array.isArray(input?.evidence) ? input.evidence : [];
  const artifacts = Array.isArray(input?.artifacts) ? input.artifacts : [];
  const gates = Array.isArray(input?.gates) ? input.gates : [];
  const expected = input?.expectedContext;
  const criterionIds = criteria.map((criterion) => (typeof criterion === 'string' ? criterion : criterion?.id));
  const criterionById = new Map(criteria.map((criterion) => [typeof criterion === 'string' ? criterion : criterion?.id, criterion]));
  const artifactById = new Map(artifacts.map((artifact) => [artifact?.id, artifact]));
  const requirementByKey = new Map();
  for (const criterion of criteria) {
    if (!criterion || typeof criterion === 'string') continue;
    for (const declared of criterion.evidence || []) {
      const requirement = normalizeEvidenceRequirement(declared);
      requirementByKey.set(`${criterion.stepId || ''}:${criterion.id}:${requirement?.id}`, requirement);
    }
  }

  for (const record of records) {
    if (!record || !criterionIds.includes(record.acId)) {
      errors.push({ code: 'EVIDENCE_AC_UNKNOWN', acId: record?.acId || null });
      continue;
    }
    const requirement = requirementByKey.get(`${record.stepId || ''}:${record.acId}:${record.requirementId}`);
    const declaredRequirements = criterionById.get(record.acId)?.evidence;
    if (Array.isArray(declaredRequirements) && declaredRequirements.length > 0 && !requirement) {
      errors.push({ code: 'EVIDENCE_REQUIREMENT_UNKNOWN', acId: record.acId, requirementId: record.requirementId || null });
    }
    if (!EVIDENCE_KINDS.includes(record.kind)) errors.push({ code: 'EVIDENCE_KIND_INVALID', acId: record.acId });
    if (requirement && record.kind !== requirement.kind) errors.push({ code: 'EVIDENCE_REQUIREMENT_KIND_MISMATCH', acId: record.acId, requirementId: record.requirementId });
    if (!HASH.test(record.hash || '')) errors.push({ code: 'EVIDENCE_HASH_INVALID', acId: record.acId });
    if (!nonEmpty(record.resultRef)) errors.push({ code: 'EVIDENCE_RESULT_REF_REQUIRED', acId: record.acId });
    const artifact = artifactById.get(record.resultRef);
    if (!validateArtifact(artifact, expected)) errors.push({ code: 'EVIDENCE_ARTIFACT_INVALID', acId: record.acId, resultRef: record.resultRef || null });
    if (artifact && record.hash !== artifact.hash) errors.push({ code: 'EVIDENCE_ARTIFACT_HASH_MISMATCH', acId: record.acId, resultRef: record.resultRef });
    if (requirement && record.resultRef !== requirement.resultRef) errors.push({ code: 'EVIDENCE_REQUIREMENT_REF_MISMATCH', acId: record.acId, requirementId: record.requirementId });

    if (AUTOMATED_KINDS.has(record.kind)) {
      if (!nonEmpty(record.gateId)) errors.push({ code: 'EVIDENCE_GATE_ID_REQUIRED', acId: record.acId });
      if (!nonEmpty(record.testSelector)) errors.push({ code: 'EVIDENCE_TEST_SELECTOR_REQUIRED', acId: record.acId });
      if (requirement && (record.gateId !== requirement.gateId || record.testSelector !== requirement.testSelector)) {
        errors.push({ code: 'EVIDENCE_REQUIREMENT_GATE_MISMATCH', acId: record.acId, requirementId: record.requirementId });
      }
      if (!gates.some((gate) => gate?.id === record.gateId && gate.passed === true && gate.resultRef === record.resultRef)) {
        errors.push({ code: 'EVIDENCE_GATE_RESULT_MISMATCH', acId: record.acId });
      }
    }
    if (record.kind === 'manual-inspection') {
      if (!nonEmpty(record.justification)) errors.push({ code: 'EVIDENCE_MANUAL_JUSTIFICATION_REQUIRED', acId: record.acId });
      const manual = record.manualRecord;
      if (!manual || !nonEmpty(manual.inspector) || !nonEmpty(manual.recordedAt) || manual.result !== 'pass') {
        errors.push({ code: 'EVIDENCE_MANUAL_RECORD_REQUIRED', acId: record.acId });
      } else {
        const recordedAt = Date.parse(manual.recordedAt);
        const runStartedAt = Date.parse(expected?.runStartedAt);
        const evaluatedAt = Date.parse(expected?.evaluatedAt);
        if (!ISO_TIMESTAMP.test(manual.recordedAt) || !Number.isFinite(recordedAt)) {
          errors.push({ code: 'EVIDENCE_MANUAL_TIMESTAMP_INVALID', acId: record.acId });
        } else if (Number.isFinite(runStartedAt) && Number.isFinite(evaluatedAt)
          && (recordedAt < runStartedAt || recordedAt > evaluatedAt)) {
          errors.push({ code: 'EVIDENCE_MANUAL_NOT_CURRENT', acId: record.acId });
        }
      }
      if (requirement && (record.justification !== requirement.justification
        || JSON.stringify(record.manualRecord) !== JSON.stringify(requirement.manualRecord))) {
        errors.push({ code: 'EVIDENCE_REQUIREMENT_MANUAL_MISMATCH', acId: record.acId, requirementId: record.requirementId });
      }
    }
  }

  for (const criterion of criteria) {
    const acId = typeof criterion === 'string' ? criterion : criterion?.id;
    const requirements = Array.isArray(criterion?.evidence) ? criterion.evidence : [];
    if (!nonEmpty(acId)) {
      errors.push({ code: 'EVIDENCE_AC_MISSING', acId: acId || null });
      continue;
    }
    if (requirements.length === 0) {
      if (!records.some((record) => record?.acId === acId)) errors.push({ code: 'EVIDENCE_AC_MISSING', acId });
      continue;
    }
    for (const requirement of requirements) {
      const count = records.filter((record) => (
        record?.acId === acId
        && record.requirementId === requirement.id
        && (criterion.stepId === undefined || record.stepId === criterion.stepId)
      )).length;
      if (count !== 1) errors.push({ code: 'EVIDENCE_REQUIREMENT_MISSING', acId, requirementId: requirement.id });
    }
  }

  return { ok: errors.length === 0, errors };
}

module.exports = { EVIDENCE_KINDS, normalizeEvidenceRequirement, validateArtifact, validateEvidenceMap };
