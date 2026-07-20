'use strict';

const { validateArtifact, validateEvidenceMap } = require('./evidence.cjs');

const BLOCKING_SEVERITIES = new Set(['critical', 'high']);
// The reviewer's schema defines `decision` only, with this enum. Local and global acceptance read
// the same set: they diverged once, and local also honoured a `verdict: 'pass'` shape that no
// schema-valid review can produce.
const APPROVING_DECISIONS = new Set(['approved', 'approved_with_findings']);

function allTrue(value) {
  return Boolean(value && typeof value === 'object' && Object.keys(value).length > 0 && Object.values(value).every((entry) => entry === true));
}

function addReason(reasons, condition, code, details) {
  if (!condition) reasons.push(details === undefined ? { code } : { code, details });
}

function validateNotes(notes, requiredIds, baseSha) {
  if (!Array.isArray(notes) || !Array.isArray(requiredIds) || typeof baseSha !== 'string' || baseSha === '') return false;
  const byId = new Map(notes.map((note) => [note?.id, note]));
  const valid = (note) => Boolean(
    note
    && typeof note.approvedBy === 'string' && note.approvedBy.trim() !== ''
    && typeof note.approvedAt === 'string' && note.approvedAt.trim() !== ''
    && note.baseSha === baseSha
    && note.materialChange !== true
  );
  if (!notes.every(valid)) return false;
  return requiredIds.every((id) => {
    const note = byId.get(id);
    return valid(note);
  });
}

function validateDocumentation(input) {
  const declaration = input.documentationImpact;
  if (!declaration || !['paths', 'none'].includes(declaration.kind)) return false;
  if (declaration.kind === 'none') return typeof declaration.justification === 'string' && declaration.justification.trim() !== '';
  if (!Array.isArray(declaration.paths) || declaration.paths.length === 0) return false;
  const changed = new Set(input.documentationPaths || []);
  return declaration.paths.every((path) => changed.has(path));
}

function evaluateLocalAcceptance(input) {
  const reasons = [];
  const warnings = [];
  const scope = input?.scope || {};
  const review = input?.review || {};
  const artifacts = Array.isArray(input?.artifacts) ? input.artifacts : [];
  const gates = Array.isArray(input?.gates) ? input.gates : [];

  addReason(reasons, allTrue(input?.schema), 'SCHEMA_INVALID');
  addReason(reasons, input?.state?.run === 'RUNNING' && input.state.step === 'ACCEPTING', 'STATE_INVALID');
  addReason(reasons, input?.lock?.held === true && input.lock.valid === true, 'LOCK_INVALID');
  addReason(reasons, input?.budget?.available === true, 'BUDGET_UNAVAILABLE');
  addReason(reasons, Number.isInteger(scope.logicalFileCount) && scope.logicalFileCount >= 0 && scope.logicalFileCount <= 5, 'SCOPE_LIMIT_EXCEEDED');
  addReason(reasons, scope.allowed === true, 'SCOPE_OUTSIDE_ALLOWED');

  const gateRefs = new Set(artifacts.filter(validateArtifact).map((artifact) => artifact.id));
  const requiredGateIds = Array.isArray(input?.requiredGateIds) ? input.requiredGateIds : [];
  const gatesValid = requiredGateIds.length > 0
    && requiredGateIds.every((id) => gates.some((gate) => gate?.id === id))
    && gates.every((gate) => (
    typeof gate?.id === 'string' && gate.id !== '' && gate.passed === true
    && typeof gate.resultRef === 'string' && gateRefs.has(gate.resultRef)
  ));
  addReason(reasons, gatesValid, 'GATE_FAILED');
  addReason(reasons, input?.revalidation?.ok === true && input.revalidation.fresh === true, 'REVALIDATION_FAILED');
  addReason(reasons, review.jsonValid === true && review.value && typeof review.value === 'object', 'REVIEW_JSON_INVALID');
  addReason(reasons, APPROVING_DECISIONS.has(review.value?.decision), 'REVIEW_NOT_APPROVED');
  const findings = Array.isArray(review.value?.findings) ? review.value.findings : [];
  addReason(reasons, !findings.some((finding) => BLOCKING_SEVERITIES.has(finding?.severity)), 'BLOCKING_FINDING');
  addReason(reasons, artifacts.length > 0 && artifacts.every(validateArtifact), 'ARTIFACT_INVALID');

  const evidence = validateEvidenceMap({
    acceptanceCriteria: input?.acceptanceCriteria,
    evidence: input?.evidence,
    artifacts,
    gates,
  });
  addReason(reasons, evidence.ok, 'AC_EVIDENCE_INVALID', evidence.errors);
  addReason(reasons, validateNotes(input?.implementationNotes, input?.requiredImplementationNoteIds, input?.approvedBaseSha), 'IMPLEMENTATION_NOTE_INVALID');
  addReason(reasons, validateDocumentation(input || {}), 'DOCUMENTATION_IMPACT_INVALID');
  addReason(reasons, input?.narrativeOverride === undefined, 'NARRATIVE_OVERRIDE_FORBIDDEN');

  const predictedMissing = Array.isArray(scope.predictedMissing) ? scope.predictedMissing : [];
  if (predictedMissing.length > 0) warnings.push({ code: 'PREDICTED_PATH_MISSING', paths: [...predictedMissing] });
  const unpredicted = Array.isArray(scope.unpredicted) ? scope.unpredicted : [];
  if (reasons.length === 0 && unpredicted.length > 0) {
    return {
      ok: false,
      status: 'awaiting_human',
      reasons: [{ code: 'UNPREDICTED_PATH_AWAITING_HUMAN', paths: [...unpredicted] }],
      warnings,
    };
  }
  return { ok: reasons.length === 0, status: reasons.length === 0 ? 'accepted' : 'rejected', reasons, warnings };
}

function evaluateGlobalAcceptance(input) {
  const reasons = [];
  const review = input?.review || {};
  const artifacts = Array.isArray(input?.artifacts) ? input.artifacts : [];
  const gates = Array.isArray(input?.gates) ? input.gates : [];
  const requiredGateIds = Array.isArray(input?.requiredGateIds) ? input.requiredGateIds : [];
  const artifactIds = new Set(artifacts.filter(validateArtifact).map((artifact) => artifact.id));

  addReason(reasons, allTrue(input?.schema), 'GLOBAL_SCHEMA_INVALID');
  addReason(reasons, input?.integration?.consistent === true, 'CROSS_SLICE_INCONSISTENCY');
  addReason(reasons, input?.diff?.fresh === true && typeof input.diff.baseSha === 'string' && typeof input.diff.headSha === 'string', 'GLOBAL_DIFF_INVALID');
  const gatesValid = requiredGateIds.length > 0
    && requiredGateIds.every((id) => gates.some((gate) => gate?.id === id && gate.passed === true))
    && gates.every((gate) => typeof gate?.resultRef === 'string' && artifactIds.has(gate.resultRef));
  addReason(reasons, gatesValid, 'GLOBAL_GATE_FAILED');
  addReason(reasons, input?.revalidation?.ok === true && input.revalidation.fresh === true && allTrue(input.revalidation.impacts), 'GLOBAL_REVALIDATION_FAILED');
  addReason(reasons, review.jsonValid === true && review.value && typeof review.value === 'object', 'GLOBAL_REVIEW_JSON_INVALID');
  addReason(reasons, APPROVING_DECISIONS.has(review.value?.decision), 'GLOBAL_REVIEW_NOT_APPROVED');
  const findings = Array.isArray(review.value?.findings) ? review.value.findings : [];
  addReason(reasons, !findings.some((finding) => BLOCKING_SEVERITIES.has(finding?.severity)), 'GLOBAL_BLOCKING_FINDING');
  addReason(reasons, artifacts.length > 0 && artifacts.every(validateArtifact), 'GLOBAL_ARTIFACT_INVALID');

  const evidence = validateEvidenceMap({ acceptanceCriteria: input?.acceptanceCriteria, evidence: input?.evidence, artifacts, gates });
  addReason(reasons, evidence.ok, 'GLOBAL_AC_EVIDENCE_INVALID', evidence.errors);
  const documentationImpacts = Array.isArray(input?.documentationImpacts) ? input.documentationImpacts : [];
  addReason(reasons, documentationImpacts.length > 0 && documentationImpacts.every((entry) => validateDocumentation(entry)), 'GLOBAL_DOCUMENTATION_IMPACT_INVALID');
  addReason(reasons, input?.narrativeOverride === undefined, 'NARRATIVE_OVERRIDE_FORBIDDEN');

  return { ok: reasons.length === 0, status: reasons.length === 0 ? 'accepted' : 'remediation_required', reasons };
}

module.exports = { BLOCKING_SEVERITIES, evaluateGlobalAcceptance, evaluateLocalAcceptance, validateDocumentation, validateNotes };
