'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  SCHEMA_TYPES,
  compileSchemas,
  loadSchemas,
  parseMarkdownFrontMatter,
  parseYaml,
  validate,
  validateFile,
  validateSource,
} = require('./lib/contracts.cjs');
const { parseRoleOutput } = require('./lib/review.cjs');

const HASH = 'a'.repeat(64);
const GIT_SHA = 'b'.repeat(40);

function metric(limit = 2) {
  return { limit, consumed: 0, reserved: 0 };
}

function usageCounters() {
  return {
    attempts: metric(),
    agentCalls: metric(),
    agentCallsByRole: { executor: 0, reviewer: 0, diagnostician: 0 },
    reviewCycles: metric(),
    diagnosisCycles: metric(),
    elapsedMinutes: metric(10),
    estimatedCost: { limit: null, consumed: null, reserved: 0 },
    tokens: { limit: null, consumed: null, reserved: 0 },
  };
}

const fixtures = {
  spec: {
    schemaVersion: '1.0.0',
    id: 'pipeline',
    title: 'Pipeline',
    status: 'approved',
    source: { path: 'specs/pipeline.md', hash: GIT_SHA, baseSha: GIT_SHA },
    approval: { approvedBy: 'operator', approvedAt: '2026-07-16T00:00:00Z', baseSha: GIT_SHA },
    goal: 'Run approved specifications.',
    nonGoals: ['Deploy changes.', 'Push commits.'],
    acceptanceCriteria: [{ id: 'AC-01', description: 'Contracts validate.' }],
    implementationNotes: [],
    documentationImpact: { kind: 'none', justification: 'No durable behavior changes.' },
    budgets: {
      maxAttemptsPerStep: 2,
      maxAttemptsTotal: 4,
      maxAgentCallsPerStep: 3,
      maxAgentCallsTotal: 6,
      maxReviewCyclesPerStep: 1,
      maxReviewCyclesTotal: 2,
      maxDiagnosisCyclesPerStep: 1,
      maxDiagnosisCyclesTotal: 2,
      maxElapsedMinutesPerStep: 10,
      maxElapsedMinutesTotal: 20,
      maxEstimatedCostPerStep: null,
      maxEstimatedCostTotal: null,
      maxTokensPerStep: null,
      maxTokensTotal: null,
    },
    execution: { adapter: 'opencode', autoCommit: false, pullRequest: false, correctionStep: false, notificationResourceIds: [] },
    isolation: { strategy: 'git-worktree', operatingSystemSandbox: true, shell: false, reviewerReadOnly: true, diagnosticianReadOnly: true },
    review: { local: true, final: true, globalAcceptance: true, freshSessions: true, blockingSeverities: ['critical', 'high'] },
  },
  step: {
    schemaVersion: '1.0.0',
    id: 'pipeline-step-1',
    sequence: 1,
    specId: 'pipeline',
    source: { path: 'specs/steps/pipeline-step-1.md', hash: GIT_SHA, baseSha: GIT_SHA },
    goal: 'Validate contracts.',
    boundaries: { inScope: ['Schemas'], outOfScope: ['Execution'], maxLogicalFiles: 5 },
    dependsOn: [],
    predictedFiles: ['schemas/spec.schema.json'],
    allowedAreas: ['schemas'],
    resources: { executor: 'opencode', reviewer: 'opencode-reviewer', diagnostician: 'opencode-diagnostician', notifications: [] },
    context: { specPath: 'specs/pipeline.md', stepPath: 'specs/steps/pipeline-step-1.md', baseSha: GIT_SHA, implementationNoteIds: [] },
    acceptanceCriteria: [{ id: 'AC-01', evidence: [{ id: 'EVIDENCE-01', kind: 'test', description: 'Tests pass.' }] }],
    budgets: { maxAttempts: 2, maxAgentCalls: 3, maxReviewCycles: 1, maxDiagnosisCycles: 1, maxElapsedMinutes: 10, maxEstimatedCost: null, maxTokens: null },
    verification: { gateIds: ['contracts'] },
    revalidation: { triggers: ['after-lock'], driftPolicy: 'block' },
    documentationImpact: { kind: 'none', justification: 'No durable behavior changes.' },
    testing: { required: true, gateIds: ['contracts'], rationale: null },
    execution: { adapter: 'opencode', isolation: 'git-worktree', writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false },
  },
  'risk-signal': {
    schemaVersion: '1.0.0',
    source: { type: 'reviewer', id: 'local-review' },
    kind: 'high-finding',
    minimumLevel: 'restricted',
    reason: 'The local review produced a high-severity finding.',
    evidenceRefs: ['artifact-review-1'],
    observedAt: '2026-07-19T00:00:00.000Z',
    fingerprint: HASH,
  },
  'approval-decision': {
    schemaVersion: '1.0.0',
    requestId: 'approval-run-1-step-1',
    outcome: 'approved',
    actor: 'local-user',
    justification: 'The identified risk was reviewed and accepted.',
    nextAction: null,
  },
  state: {
    schemaVersion: '2.0.0',
    runId: 'run-1',
    revision: 0,
    repo: { root: '/repo', realRoot: '/repo', identity: HASH, baseSha: GIT_SHA, parentSha: GIT_SHA },
    spec: { id: 'pipeline', path: 'specs/pipeline.md', hash: HASH, stepsHash: HASH, notesHash: HASH, schemasHash: HASH, catalogsHash: HASH, policyHash: HASH, dagHash: HASH },
    state: 'CREATED',
    transitions: [],
    lock: null,
    usage: { revision: 0, total: usageCounters(), perStep: [], reservations: [], timing: { totalActiveMs: 0, activeMsByStep: {} } },
    steps: [],
    attempts: [],
    commits: [],
    findings: [],
    worktrees: [],
    artifacts: [],
    createdAt: '2026-07-16T00:00:00Z',
    updatedAt: '2026-07-16T00:00:00Z',
  },
  review: {
    schemaVersion: '1.0.0',
    decision: 'approved_with_findings',
    summary: 'The review found one non-blocking issue.',
    confidence: 'high',
    findings: [{
      id: 'finding-1',
      category: 'maintainability',
      status: 'open',
      severity: 'medium',
      autoFixEligible: false,
      file: 'scripts/workflow/lib/review.cjs',
      line: 1,
      title: 'Non-blocking issue.',
      description: 'The issue does not prevent acceptance.',
      evidence: ['The affected path remains covered by tests.'],
      impact: 'Maintenance may be harder.',
      suggestedCorrection: 'Address the issue in a later change.',
      acceptanceTest: 'The contract tests continue to pass.',
      boundaryViolation: false,
      invariantViolation: false,
    }],
  },
  diagnosis: {
    schemaVersion: '1.0.0',
    rootCause: 'The gate process timed out.',
    confidence: 'medium',
    evidence: ['The gate artifact records a timeout.'],
    recommendedAction: 'Retry after checking process availability.',
    scopeImpact: 'The current step cannot complete.',
    requiresHumanDecision: false,
  },
  retrospective: {
    schemaVersion: '1.0.0',
    retrospectiveId: 'retrospective-1',
    runId: 'run-1',
    outcome: 'succeeded',
    metrics: { attempts: 1, agentCalls: 2, reviewCycles: 1, diagnosisCycles: 0, elapsedMinutes: 2.5, estimatedCost: null, tokens: null, reworkCycles: 0 },
    observations: [{ category: 'outcome', summary: 'All contracts passed.', artifactIds: ['artifact-report'] }],
    findingsBacklog: [],
    proposals: [{ summary: 'Keep the contracts executable.', rationale: 'Executable checks prevent drift.', autoApply: false }],
    createdAt: '2026-07-16T00:00:00Z',
  },
};

function clone(value) {
  return structuredClone(value);
}

function assertErrorCode(result, code) {
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.code === code), JSON.stringify(result.errors));
  assert.ok(result.errors.every((error) => typeof error.path === 'string' && error.path.length > 0));
}

function main() {
  const schemas = loadSchemas();
  const validators = compileSchemas(schemas);
  assert.deepEqual(Object.keys(validators), SCHEMA_TYPES);

  for (const type of SCHEMA_TYPES) {
    assert.equal(validate(type, fixtures[type], validators).ok, true, `${type} fixture should be valid`);

    const withExtra = { ...clone(fixtures[type]), unexpected: true };
    assertErrorCode(validate(type, withExtra, validators), 'SCHEMA_ADDITIONALPROPERTIES');

    const missingVersion = clone(fixtures[type]);
    delete missingVersion.schemaVersion;
    assertErrorCode(validate(type, missingVersion, validators), 'SCHEMA_REQUIRED');
  }

  const stepV2 = { ...clone(fixtures.step), schemaVersion: '2.0.0', changeType: 'feature' };
  assert.equal(validate('step', stepV2, validators).ok, true, 'step v2 with changeType should be valid');

  const stepV1WithChangeType = { ...clone(fixtures.step), changeType: 'feature' };
  assert.equal(validate('step', stepV1WithChangeType, validators).ok, false, 'step v1 must remain a closed contract');

  const stepV2WithoutChangeType = { ...clone(fixtures.step), schemaVersion: '2.0.0' };
  assertErrorCode(validate('step', stepV2WithoutChangeType, validators), 'SCHEMA_REQUIRED');

  const stepWithUnknownVersion = { ...clone(fixtures.step), schemaVersion: '3.0.0' };
  assertErrorCode(validate('step', stepWithUnknownVersion, validators), 'SCHEMA_ENUM');

  const invalidRiskSignal = clone(fixtures['risk-signal']);
  invalidRiskSignal.minimumLevel = 'lower';
  assertErrorCode(validate('risk-signal', invalidRiskSignal, validators), 'SCHEMA_ENUM');

  const riskSignalWithUnknownVersion = { ...clone(fixtures['risk-signal']), schemaVersion: '2.0.0' };
  assertErrorCode(validate('risk-signal', riskSignalWithUnknownVersion, validators), 'SCHEMA_CONST');

  const riskSignalWithUnknownSourceField = clone(fixtures['risk-signal']);
  riskSignalWithUnknownSourceField.source.unexpected = true;
  assertErrorCode(validate('risk-signal', riskSignalWithUnknownSourceField, validators), 'SCHEMA_ADDITIONALPROPERTIES');

  const oversizedRiskReason = clone(fixtures['risk-signal']);
  oversizedRiskReason.reason = 'x'.repeat(2001);
  assertErrorCode(validate('risk-signal', oversizedRiskReason, validators), 'SCHEMA_MAXLENGTH');

  const decisionWithUnknownVersion = { ...clone(fixtures['approval-decision']), schemaVersion: '2.0.0' };
  assertErrorCode(validate('approval-decision', decisionWithUnknownVersion, validators), 'SCHEMA_CONST');

  const approvedWithAction = { ...clone(fixtures['approval-decision']), nextAction: 'retry' };
  assertErrorCode(validate('approval-decision', approvedWithAction, validators), 'SCHEMA_CONST');

  const rejectedWithoutAction = {
    ...clone(fixtures['approval-decision']),
    outcome: 'rejected',
    nextAction: null,
  };
  assertErrorCode(validate('approval-decision', rejectedWithoutAction, validators), 'SCHEMA_ENUM');

  for (const severity of ['critical', 'high', 'medium', 'low']) {
    const review = clone(fixtures.review);
    review.findings[0].severity = severity;
    assert.equal(validate('review', review, validators).ok, true);
  }

  const unknownSeverity = clone(fixtures.review);
  unknownSeverity.findings[0].severity = 'blocker';
  assertErrorCode(validate('review', unknownSeverity, validators), 'SCHEMA_ENUM');

  const approvingDiagnosis = { ...clone(fixtures.diagnosis), decision: 'approved' };
  assertErrorCode(validate('diagnosis', approvingDiagnosis, validators), 'SCHEMA_ADDITIONALPROPERTIES');

  assert.doesNotThrow(() => parseRoleOutput('reviewer', JSON.stringify(fixtures.review)), 'schema-valid review must pass runtime validation');
  assert.doesNotThrow(() => parseRoleOutput('diagnostician', JSON.stringify(fixtures.diagnosis)), 'schema-valid diagnosis must pass runtime validation');

  const runtimeReview = parseRoleOutput('reviewer', JSON.stringify(fixtures.review));
  const runtimeDiagnosis = parseRoleOutput('diagnostician', JSON.stringify(fixtures.diagnosis));
  assert.equal(validate('review', runtimeReview, validators).ok, true, 'runtime review output must pass its public schema');
  assert.equal(validate('diagnosis', runtimeDiagnosis, validators).ok, true, 'runtime diagnosis output must pass its public schema');

  for (const [type, field, invalid] of [
    ['review', 'decision', 'pass'],
    ['review', 'confidence', 'certain'],
    ['diagnosis', 'confidence', 'certain'],
  ]) {
    const value = clone(fixtures[type]);
    value[field] = invalid;
    assertErrorCode(validate(type, value, validators), 'SCHEMA_ENUM');
    assert.throws(() => parseRoleOutput(type === 'review' ? 'reviewer' : 'diagnostician', JSON.stringify(value)), { code: 'ROLE_SCHEMA_INVALID' });
  }

  const automaticProposal = clone(fixtures.retrospective);
  automaticProposal.proposals[0].autoApply = true;
  assertErrorCode(validate('retrospective', automaticProposal, validators), 'SCHEMA_CONST');

  assert.equal(parseYaml('schemaVersion: [').ok, false, 'invalid YAML must fail');
  assert.equal(parseYaml('value: !execute payload').ok, false, 'custom YAML tags must fail');
  assertErrorCode(parseMarkdownFrontMatter('# Missing front matter'), 'FRONT_MATTER_MISSING');

  const reviewYaml = `---\n${JSON.stringify(fixtures.review)}\n---\n# Review\n`;
  assert.equal(validateSource('review', reviewYaml, 'md', validators).ok, true);

  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-contracts-'));
  try {
    const reviewPath = path.join(temporaryDirectory, 'review.md');
    fs.writeFileSync(reviewPath, reviewYaml);
    assert.equal(validateFile('review', reviewPath, { validators }).ok, true);

    const missingFrontMatterPath = path.join(temporaryDirectory, 'missing.md');
    fs.writeFileSync(missingFrontMatterPath, '# Missing front matter\n');
    assertErrorCode(validateFile('review', missingFrontMatterPath, { validators }), 'FRONT_MATTER_MISSING');
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }

  assertErrorCode(validate('unknown', {}), 'UNKNOWN_CONTRACT_TYPE');
  process.stdout.write('workflow contract tests passed\n');
}

main();
