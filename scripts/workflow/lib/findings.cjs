'use strict';

const crypto = require('node:crypto');
const { sanitize } = require('./sanitize.cjs');

const SEVERITIES = Object.freeze(['critical', 'high', 'medium', 'low']);
const DECISIONS = Object.freeze(['approved', 'approved_with_findings', 'changes_requested', 'blocked']);
const SEVERITY_RANK = Object.freeze({ critical: 0, high: 1, medium: 2, low: 3 });

function findingsError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function fingerprintFinding(finding) {
  const identity = {
    acceptanceCriterionId: finding.acceptanceCriterionId || null,
    gateId: finding.gateId || null,
    location: finding.location || null,
    ruleId: finding.ruleId || null,
    summary: finding.summary.trim().toLowerCase(),
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonical(identity))).digest('hex');
}

function assertFinding(finding) {
  if (!finding || typeof finding !== 'object' || Array.isArray(finding)) {
    throw findingsError('FINDING_INVALID', 'Finding must be an object');
  }
  if (!SEVERITIES.includes(finding.severity)) {
    throw findingsError('FINDING_SEVERITY_INVALID', `Unsupported finding severity: ${finding.severity}`);
  }
  for (const name of ['summary', 'details']) {
    if (typeof finding[name] !== 'string' || finding[name].trim() === '') {
      throw findingsError('FINDING_INVALID', `${name} must be a non-empty string`);
    }
  }
}

function highCorrectionEligible(finding) {
  if (finding.severity !== 'high') return false;
  const conditions = finding.correctionConditions;
  return Boolean(
    conditions?.withinStepScope === true
    && conditions?.deterministic === true
    && conditions?.regressionTest === true
    && conditions?.requiresArchitecturalDecision === false,
  );
}

function normalizeFinding(finding, occurrence = {}) {
  assertFinding(finding);
  const priorOccurrences = Array.isArray(finding.occurrences) ? finding.occurrences : [];
  const normalized = {
    ...finding,
    fingerprint: fingerprintFinding(finding),
    autoCorrectionEligible: highCorrectionEligible(finding),
    occurrences: priorOccurrences.length > 0 ? priorOccurrences : [{
      reviewId: occurrence.reviewId || null,
      artifactRefs: [...(finding.evidence || [])],
    }],
  };
  const sanitized = sanitize(normalized);
  if (sanitized.truncated) throw findingsError('FINDING_TOO_LARGE', 'Finding cannot be safely preserved within the artifact limit');
  return JSON.parse(sanitized.content);
}

function deduplicateFindings(findings, occurrence = {}) {
  const byFingerprint = new Map();
  for (const finding of findings) {
    const normalized = normalizeFinding(finding, occurrence);
    const existing = byFingerprint.get(normalized.fingerprint);
    if (!existing) {
      byFingerprint.set(normalized.fingerprint, normalized);
      continue;
    }
    existing.occurrences.push(...normalized.occurrences);
    existing.evidence = [...new Set([...(existing.evidence || []), ...(normalized.evidence || [])])];
    existing.autoCorrectionEligible ||= normalized.autoCorrectionEligible;
    if (SEVERITY_RANK[normalized.severity] < SEVERITY_RANK[existing.severity]) {
      existing.severity = normalized.severity;
      existing.details = normalized.details;
    }
  }
  return [...byFingerprint.values()];
}

function blocksForContract(finding) {
  if (finding.severity === 'critical' || finding.severity === 'high') return true;
  return Boolean(finding.acceptanceCriterionId || finding.ruleId || finding.gateId);
}

function decisionForFindings(findings) {
  for (const finding of findings) assertFinding(finding);
  if (findings.some((finding) => finding.severity === 'critical')) return 'blocked';
  if (findings.some(blocksForContract)) return 'changes_requested';
  if (findings.length > 0) return 'approved_with_findings';
  return 'approved';
}

function appendFindingsBacklog(options) {
  if (typeof options.artifacts?.preserve !== 'function') {
    throw findingsError('FINDINGS_ARTIFACT_SEAM_REQUIRED', 'A sanitizing artifact store is required');
  }
  const previous = Array.isArray(options.previous) ? options.previous : [];
  const eligible = options.findings.filter((finding) => ['medium', 'low'].includes(finding.severity));
  const findings = deduplicateFindings([
    ...deduplicateFindings(previous),
    ...deduplicateFindings(eligible, { reviewId: options.reviewId }),
  ]);
  for (const finding of findings) {
    const seen = new Set();
    finding.occurrences = finding.occurrences.filter((occ) => {
      const key = occ.reviewId;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  const payload = {
    schemaVersion: '1.0.0',
    kind: 'human-triage-findings-backlog',
    correctionCreationEnabled: false,
    findings,
  };
  const sanitizedPayload = sanitize(payload);
  if (sanitizedPayload.truncated) throw findingsError('FINDINGS_BACKLOG_TOO_LARGE', 'Findings backlog cannot be safely preserved within the artifact limit');
  const sanitized = JSON.parse(sanitizedPayload.content);
  const artifactRef = options.artifacts.preserve({
    stepId: options.stepId,
    attempt: options.attempt,
    kind: 'findings-backlog',
    mediaType: 'application/json',
    content: sanitized,
    provenance: { reviewId: options.reviewId, source: 'review' },
  });
  return { artifactRef, findings, correctionCreationEnabled: false };
}

module.exports = {
  DECISIONS,
  SEVERITIES,
  appendFindingsBacklog,
  blocksForContract,
  decisionForFindings,
  deduplicateFindings,
  fingerprintFinding,
  highCorrectionEligible,
};
