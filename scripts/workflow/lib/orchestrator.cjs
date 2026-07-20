'use strict';

/**
 * orchestrator.cjs — controle de alto nível do pipeline (run / resume / review).
 *
 * Primeiro `validate` prova a consistência normativa de spec + steps + DAG + catálogos + evidência +
 * budgets (validateSemantics) — nada muta antes disso. Depois `executeWorkflow` conduz o ciclo
 * acionando SEAMS do adapter (nunca toca git/fs diretamente): por step, o attempt loop faz
 * worktree → executor → diff → escopo → gates → review → acceptance → commit/AWAITING_COMMIT; falha
 * elegível vira retry/diagnosis (sem correction step automático). No fim: gates globais → review
 * final → aceite global → relatório → PR opt-in. `checkedRevalidation` roda em CADA fronteira para
 * detectar drift, e o lock é sempre liberado no finally. Passar todo efeito pelo adapter injetado dá
 * testabilidade por seam e mantém o trust boundary. Ver docs/workflows/automated-spec-pipeline.md.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const contracts = require('./contracts.cjs');
const catalogs = require('./catalogs.cjs');
const dagModule = require('./dag.cjs');
const budgets = require('./budget.cjs');
const scope = require('./scope.cjs');
const { classifyFailure, retryDecision } = require('./retry.cjs');
const { sanitize } = require('./sanitize.cjs');
const { evaluateGlobalAcceptance, evaluateLocalAcceptance } = require('./acceptance.cjs');
const { createLocalAdapter } = require('./local-adapter.cjs');
const riskPolicy = require('./risk-policy.cjs');
const riskSignals = require('./risk-signals.cjs');

// Blocked outcomes reach the operator's stdout, so the cause travels with them — sanitized, because
// stdout is a report surface. Without this the operator gets a code and has to reproduce the call.
function blockedCause(error) {
  const details = error?.details;
  if (!details || typeof details !== 'object' || Object.keys(details).length === 0) return {};
  try {
    const clean = sanitize(details, { maxBytes: 8 * 1024 });
    return { cause: clean.truncated ? { truncated: true } : JSON.parse(clean.content) };
  } catch {
    return { cause: { unsanitizable: true } };
  }
}

function orchestrationError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function assertFullRevalidation(result, trigger) {
  const required = ['hashes', 'base', 'catalog', 'lock'];
  if (result?.checks?.worktree !== undefined || result?.checks?.state !== undefined || result?.checks?.artifacts !== undefined) {
    required.push('worktree', 'state', 'artifacts');
  }
  if (!result || result.ok !== true || !result.checks || required.some((name) => result.checks[name] !== true)) {
    throw orchestrationError('REVALIDATION_DRIFT', `Full revalidation failed at ${trigger}`, { trigger, result });
  }
  return result;
}

// The provider's own verdict outranks a guess from our side: an auth failure never becomes
// retryable, and a rate limit always is. Both travel here from the adapter's providerError signal.
const PROVIDER_ERROR_CLASSIFICATIONS = Object.freeze({ ProviderAuthError: 'authorization' });

function failureFrom(error, role, phase = 'agent-call') {
  const classifications = {
    READ_ONLY_MUTATION_DETECTED: 'trust-boundary',
    READ_ONLY_STATE_CAPTURE_FAILED: 'trust-boundary',
    REVALIDATION_DRIFT: 'drift',
  };
  const providerError = error.details?.providerError;
  const failure = {
    code: error.code || 'AGENT_CALL_FAILED',
    status: error.details?.process?.timedOut ? 'timed_out' : undefined,
    phase,
    role,
    httpStatus: providerError?.statusCode,
    providerRetryable: providerError?.isRetryable,
    classification: error.details?.classification
      || PROVIDER_ERROR_CLASSIFICATIONS[providerError?.name]
      || classifications[error.code],
  };
  failure.classification = classifyFailure(failure).classification;
  return failure;
}

function throwValidation(code, message, details) {
  throw orchestrationError(code, message, details);
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function workflowDocument(absolutePath, root, outsideCode, invalidCode) {
  const realPath = fs.realpathSync(absolutePath);
  if (!isWithin(root, realPath)) throwValidation(outsideCode, 'Workflow path must remain inside the repository');
  const stat = fs.lstatSync(absolutePath);
  if (!stat.isFile() || stat.isSymbolicLink()) throwValidation(invalidCode, 'Workflow path must be a regular file, not a symlink');
  const source = fs.readFileSync(realPath, 'utf8');
  const split = contracts.splitMarkdownFrontMatter(source);
  if (!split.ok) throwValidation(invalidCode, 'Workflow Markdown front matter is invalid', { errors: split.errors });
  const normalizedBody = `${split.value.body.replace(/\r\n?/g, '\n').replace(/\n*$/, '')}\n`;
  return {
    absolutePath: realPath,
    relativePath: path.relative(root, realPath).split(path.sep).join('/'),
    source,
    body: normalizedBody,
    bodyHash: crypto.createHash('sha256').update(normalizedBody).digest('hex'),
  };
}

function workflowPaths(specPath, repoRoot) {
  const root = fs.realpathSync(repoRoot);
  const requestedSpec = path.resolve(root, specPath);
  const requestedRelative = path.relative(root, requestedSpec);
  if (requestedRelative.startsWith('..') || path.isAbsolute(requestedRelative)) {
    throwValidation('SPEC_PATH_OUTSIDE_REPOSITORY', 'Spec path must remain inside the repository');
  }
  const specDocument = workflowDocument(requestedSpec, root, 'SPEC_PATH_OUTSIDE_REPOSITORY', 'SPEC_PATH_INVALID');
  const stem = path.basename(specDocument.absolutePath, path.extname(specDocument.absolutePath));
  const requestedStepsDirectory = path.join(path.dirname(specDocument.absolutePath), 'steps');
  const stepsDirectory = fs.realpathSync(requestedStepsDirectory);
  if (!isWithin(root, stepsDirectory)) throwValidation('STEPS_PATH_OUTSIDE_REPOSITORY', 'Steps directory must remain inside the repository');
  const stepsStat = fs.lstatSync(requestedStepsDirectory);
  if (!stepsStat.isDirectory()) throwValidation('STEPS_PATH_INVALID', 'Steps path must be a directory');
  const stepDocuments = fs.readdirSync(stepsDirectory)
    .filter((name) => name.startsWith(`${stem}-step-`) && name.endsWith('.md'))
    .map((name) => workflowDocument(path.join(stepsDirectory, name), root, 'STEP_PATH_OUTSIDE_REPOSITORY', 'STEP_PATH_INVALID'));
  return {
    root,
    absoluteSpec: specDocument.absolutePath,
    relativeSpec: specDocument.relativePath,
    specDocument,
    stepPaths: stepDocuments.map((document) => document.absolutePath),
    stepDocuments,
  };
}

function loadRiskPolicyFromFilesystem(repoRoot) {
  const policyPath = path.join(repoRoot, riskPolicy.POLICY_PATH);
  let source;
  try { source = fs.readFileSync(policyPath, 'utf8'); }
  catch (error) {
    return { ok: false, errors: [{ code: 'RISK_POLICY_READ_ERROR', path: '/', message: error.message }] };
  }
  return riskPolicy.validateRiskPolicySource(source, { type: 'filesystem', path: riskPolicy.POLICY_PATH });
}

function riskAssessmentsFor(steps, policyRecord) {
  return steps.map((step) => ({ stepId: step.id, assessment: riskPolicy.assessRisk({ policyRecord, step }) }));
}

function assertRiskValidation(validation, requireApprovedBase) {
  const origin = validation.riskPolicy?.origin;
  if (!validation.riskPolicy || !Array.isArray(validation.riskAssessments)
    || (requireApprovedBase && (origin?.type !== 'git' || origin.baseSha !== validation.baseSha.toLowerCase()
      || origin.path !== riskPolicy.POLICY_PATH))) {
    throwValidation('RISK_POLICY_TRUST_INVALID', 'Risk policy must come from the exact approved baseSha');
  }
  let expected;
  try { expected = riskAssessmentsFor(validation.steps, validation.riskPolicy); }
  catch (error) {
    throwValidation(error.code || 'RISK_CLASSIFICATION_INVALID', error.message, error.details);
  }
  if (JSON.stringify(expected) !== JSON.stringify(validation.riskAssessments)) {
    throwValidation('RISK_ASSESSMENT_INVALID', 'Every step must have an intact risk assessment before workflow effects');
  }
  return validation;
}

function hasRiskValidation(validation) {
  return validation?.riskPolicy !== undefined || validation?.riskAssessments !== undefined;
}

function validateSemantics(spec, stepDag, catalogResult, options) {
  const errors = [];
  if (spec.status !== 'approved') errors.push({ code: 'SPEC_NOT_APPROVED' });
  if (spec.source?.path !== options.relativeSpec) errors.push({ code: 'SPEC_SOURCE_PATH_MISMATCH' });
  if (spec.source?.hash !== options.specDocument.bodyHash) errors.push({ code: 'SPEC_SOURCE_HASH_MISMATCH' });
  if (stepDag.steps.some((step) => step.specId !== spec.id)) errors.push({ code: 'STEP_SPEC_ID_MISMATCH' });
  if (stepDag.steps.some((step, index) => step.sequence !== index + 1)) errors.push({ code: 'STEP_SEQUENCE_INVALID' });

  const gateIds = new Set(catalogResult.value.gates.gates.map((entry) => entry.id));
  const resources = new Map(catalogResult.value.resources.resources.map((entry) => [entry.id, entry]));
  const documents = new Map(options.stepDocuments.map((document) => {
    const match = document.relativePath.match(/-step-([1-9][0-9]*)\.md$/);
    return [match ? Number(match[1]) : -1, document];
  }));
  const specAcIds = new Set(spec.acceptanceCriteria.map((criterion) => criterion.id));
  const evidenceIds = new Map();
  const coveredAcIds = new Set();
  const provenanceSha = spec.source?.baseSha;
  if (spec.approval?.baseSha !== provenanceSha
    || spec.implementationNotes.some((note) => note.baseSha !== provenanceSha)) errors.push({ code: 'SPEC_PROVENANCE_MISMATCH' });

  const planMatch = options.specDocument.body.match(/^## Implementation plan[\t ]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
  const planLines = planMatch ? planMatch[1].split('\n').filter((line) => line.trim() !== '') : [];
  const plan = planLines.map((line) => line.match(/^([1-9][0-9]*)\.\s+\S.*$/)).filter(Boolean).map((match) => Number(match[1]));
  if (!planMatch || plan.length !== planLines.length || plan.some((number, index) => number !== index + 1)
    || plan.length !== stepDag.steps.length) errors.push({ code: 'IMPLEMENTATION_PLAN_STEP_MISMATCH' });

  for (const step of stepDag.steps) {
    const stepEvidenceIds = new Set();
    const document = documents.get(step.sequence);
    if (!step.id.endsWith(`-step-${step.sequence}`)) errors.push({ code: 'STEP_SEQUENCE_INVALID', stepId: step.id });
    if (!document || step.source?.path !== document.relativePath) errors.push({ code: 'STEP_SOURCE_PATH_MISMATCH', stepId: step.id });
    else if (step.source.hash !== document.bodyHash) errors.push({ code: 'STEP_SOURCE_HASH_MISMATCH', stepId: step.id });
    if (document && step.context?.stepPath !== document.relativePath) errors.push({ code: 'STEP_CONTEXT_PATH_MISMATCH', stepId: step.id });
    if (step.context?.specPath !== options.relativeSpec) errors.push({ code: 'STEP_CONTEXT_SPEC_PATH_MISMATCH', stepId: step.id });
    if (step.source?.baseSha !== provenanceSha || step.context?.baseSha !== provenanceSha) errors.push({ code: 'STEP_PROVENANCE_MISMATCH', stepId: step.id });
    const noteIds = new Set(spec.implementationNotes.map((note) => note.id));
    if (step.context.implementationNoteIds.some((id) => !noteIds.has(id))) errors.push({ code: 'STEP_CONTEXT_NOTE_MISMATCH', stepId: step.id });
    if (step.execution?.adapter !== spec.execution.adapter
      || step.execution?.isolation !== spec.isolation.strategy
      || step.execution?.autoCommit !== spec.execution.autoCommit
      || step.execution?.allowPullRequest !== spec.execution.pullRequest
      || step.execution?.correctionStep !== spec.execution.correctionStep) errors.push({ code: 'STEP_EXECUTION_MISMATCH', stepId: step.id });
    for (const id of step.verification?.gateIds || []) {
      if (!gateIds.has(id)) errors.push({ code: 'UNKNOWN_GATE_ID', stepId: step.id, id });
    }
    for (const id of step.testing?.gateIds || []) {
      if (!gateIds.has(id)) errors.push({ code: 'UNKNOWN_TESTING_GATE_ID', stepId: step.id, id });
    }
    if (step.testing?.required === true && step.testing.gateIds.length === 0) errors.push({ code: 'REQUIRED_TESTING_GATES_EMPTY', stepId: step.id });
    for (const criterion of step.acceptanceCriteria || []) {
      if (!specAcIds.has(criterion.id)) errors.push({ code: 'UNKNOWN_ACCEPTANCE_CRITERION', stepId: step.id, id: criterion.id });
      coveredAcIds.add(criterion.id);
      for (const requirement of criterion.evidence || []) {
        if (stepEvidenceIds.has(requirement.id)) errors.push({ code: 'DUPLICATE_STEP_EVIDENCE_ID', stepId: step.id, id: requirement.id });
        stepEvidenceIds.add(requirement.id);
        if (evidenceIds.has(requirement.id)) errors.push({ code: 'DUPLICATE_EVIDENCE_ID', stepId: step.id, otherStepId: evidenceIds.get(requirement.id), id: requirement.id });
        else evidenceIds.set(requirement.id, step.id);

        const automated = ['automated-test', 'contract-test', 'static-check', 'gate', 'test'].includes(requirement.kind);
        if (automated) {
          const declaredGateIds = new Set([...(step.verification?.gateIds || []), ...(step.testing?.gateIds || [])]);
          if (!gateIds.has(requirement.gateId)) errors.push({ code: 'EVIDENCE_GATE_ID_UNKNOWN', stepId: step.id, id: requirement.id, gateId: requirement.gateId });
          else if (!declaredGateIds.has(requirement.gateId)) errors.push({ code: 'EVIDENCE_GATE_NOT_DECLARED_BY_STEP', stepId: step.id, id: requirement.id, gateId: requirement.gateId });
          const prefix = `${step.id}/attempt-`;
          const suffix = `/gate-${requirement.gateId}`;
          const attempt = typeof requirement.resultRef === 'string'
            ? requirement.resultRef.slice(prefix.length, -suffix.length) : '';
          if (!requirement.resultRef?.startsWith(prefix) || !requirement.resultRef.endsWith(suffix) || !/^[1-9][0-9]*$/.test(attempt)) {
            errors.push({ code: 'EVIDENCE_RESULT_REF_INVALID', stepId: step.id, id: requirement.id, resultRef: requirement.resultRef });
          }
          if (typeof requirement.testSelector !== 'string' || requirement.testSelector.trim() === '') {
            errors.push({ code: 'EVIDENCE_TEST_SELECTOR_REQUIRED', stepId: step.id, id: requirement.id });
          }
        } else if (typeof requirement.resultRef !== 'string' || requirement.resultRef.trim() === '') {
          errors.push({ code: 'EVIDENCE_RESULT_REF_REQUIRED', stepId: step.id, id: requirement.id });
        }
        if (['gate', 'test'].includes(requirement.kind)
          && (!requirement.gateId || !requirement.resultRef || !requirement.testSelector)) {
          errors.push({ code: 'DEPRECATED_EVIDENCE_ALIAS_UNRESOLVABLE', stepId: step.id, id: requirement.id });
        }
        if (requirement.kind === 'diff' && !requirement.resultRef) {
          errors.push({ code: 'DEPRECATED_EVIDENCE_ALIAS_UNRESOLVABLE', stepId: step.id, id: requirement.id });
        }
        if (requirement.kind === 'review' && (!requirement.resultRef || !requirement.justification || !requirement.manualRecord)) {
          errors.push({ code: 'DEPRECATED_EVIDENCE_ALIAS_UNRESOLVABLE', stepId: step.id, id: requirement.id });
        }
      }
    }
    for (const [role, value] of Object.entries(step.resources || {})) {
      const ids = Array.isArray(value) ? value : [value];
      for (const id of ids) {
        const resource = resources.get(id);
        if (!resource) errors.push({ code: 'UNKNOWN_RESOURCE_ID', stepId: step.id, role, id });
        else if (role === 'notifications' ? resource.type !== 'notifier' || resource.readOnly !== true
          : resource.type !== 'agent' || resource.role !== role
            || (['reviewer', 'diagnostician'].includes(role) ? resource.readOnly !== true : resource.readOnly !== false)) {
          errors.push({ code: 'RESOURCE_ROLE_INCOMPATIBLE', stepId: step.id, role, id });
        }
      }
    }
  }
  for (const id of specAcIds) if (!coveredAcIds.has(id)) errors.push({ code: 'ACCEPTANCE_CRITERION_UNCOVERED', id });
  // AC-17: the runtime executes the union of the required steps' testing.gateIds, so the declared
  // spec.globalGates must equal that union in both directions — a declared gate no step requires is
  // dead documentation, and a union gate the spec omits would run without appearing in the approved
  // document.
  const requiredGlobalGateIds = new Set(stepDag.steps.flatMap((step) => (
    step.testing?.required === true ? step.testing.gateIds : []
  )));
  const declaredGlobalGates = Array.isArray(spec.globalGates) ? spec.globalGates : [];
  const missingGlobalGates = declaredGlobalGates.filter((id) => !requiredGlobalGateIds.has(id));
  if (missingGlobalGates.length > 0) {
    errors.push({ code: 'GLOBAL_GATE_NOT_REQUIRED_BY_ANY_STEP', ids: missingGlobalGates, requiredGateIds: [...requiredGlobalGateIds] });
  }
  const undeclaredGlobalGates = [...requiredGlobalGateIds].filter((id) => !declaredGlobalGates.includes(id));
  if (undeclaredGlobalGates.length > 0) {
    errors.push({ code: 'GLOBAL_GATE_NOT_DECLARED', ids: undeclaredGlobalGates, declaredGateIds: [...declaredGlobalGates] });
  }
  for (const id of spec.execution.notificationResourceIds) {
    const resource = resources.get(id);
    if (!resource) errors.push({ code: 'UNKNOWN_RESOURCE_ID', role: 'notifications', id });
    else if (resource.type !== 'notifier' || resource.readOnly !== true) errors.push({ code: 'RESOURCE_ROLE_INCOMPATIBLE', role: 'notifications', id });
  }
  try {
    budgets.validateBudgetPolicy(spec.budgets, Object.fromEntries(stepDag.steps.map((step) => [step.id, step.budgets])));
  } catch (error) {
    errors.push({ code: error.code || 'INVALID_BUDGET_POLICY', path: error.path, message: error.message });
  }
  if (errors.length > 0) throwValidation('WORKFLOW_SEMANTIC_INVALID', 'Spec, steps, DAG, or catalog semantics are invalid', { errors });
}

async function validate(options, dependencies = {}) {
  const mutableCommand = ['run', 'resume'].includes(options.command) && options.dryRun !== true;
  if (mutableCommand && (typeof options.baseSha !== 'string' || options.baseSha.trim() === '')) {
    throwValidation('BASE_SHA_REQUIRED', 'Mutable run and resume require an explicit --base-sha');
  }
  if (dependencies.validationResult) {
    // validationResult is an internal dependency-injection seam used by adapter fixtures created
    // before risk policy existed. Public validation never takes this branch.
    return hasRiskValidation(dependencies.validationResult)
      ? assertRiskValidation(dependencies.validationResult, mutableCommand)
      : dependencies.validationResult;
  }
  const repoRoot = dependencies.repoRoot || process.cwd();
  let paths;
  try { paths = workflowPaths(options.specPath, repoRoot); }
  catch (error) {
    if (error.details && error.code) throw error;
    throwValidation('SPEC_READ_FAILED', `Could not discover workflow inputs: ${error.message}`);
  }
  const specResult = contracts.validateFile('spec', paths.absoluteSpec, dependencies.contractOptions);
  if (!specResult.ok) throwValidation('SPEC_SCHEMA_INVALID', 'Spec does not match its schema', { errors: specResult.errors });
  let stepDag;
  try { stepDag = dagModule.deriveDag(paths.stepPaths); }
  catch (error) { throwValidation(error.code || 'DAG_INVALID', error.message, error.details); }

  const baseSha = options.baseSha || specResult.value.approval?.baseSha;
  const adapter = dependencies.adapter || createLocalAdapter({
    repoRoot: paths.root,
    runProcess: dependencies.runProcess,
    openCode: dependencies.openCode,
    ghRunProcess: dependencies.ghRunProcess,
    modules: dependencies.modules,
  });
  const loadCatalogs = dependencies.loadCatalogs
    || ((options.baseSha || mutableCommand)
      ? (adapter.loadCatalogs || catalogs.loadCatalogsFromGit)
      : catalogs.loadCatalogsFromFilesystem);
  const catalogResult = await loadCatalogs(paths.root, baseSha);
  if (!catalogResult?.ok) throwValidation('CATALOG_INVALID', 'Gate/resource catalogs are invalid', { errors: catalogResult?.errors });
  validateSemantics(specResult.value, stepDag, catalogResult, { ...paths, baseSha });
  const loadRiskPolicy = dependencies.loadRiskPolicy
    || ((options.baseSha || mutableCommand)
      ? (adapter.loadRiskPolicy || riskPolicy.loadRiskPolicyFromGit)
      : loadRiskPolicyFromFilesystem);
  let riskPolicyResult;
  try { riskPolicyResult = await loadRiskPolicy(paths.root, baseSha); }
  catch (error) {
    throwValidation(error.code || 'RISK_POLICY_INVALID', 'Risk policy could not be loaded from the approved base', { message: error.message });
  }
  if (!riskPolicyResult?.ok) {
    throwValidation('RISK_POLICY_INVALID', 'Risk policy could not be loaded from the approved base', { errors: riskPolicyResult?.errors });
  }
  let riskAssessments;
  try { riskAssessments = riskAssessmentsFor(stepDag.steps, riskPolicyResult.value); }
  catch (error) { throwValidation(error.code || 'RISK_CLASSIFICATION_INVALID', error.message, error.details); }
  return {
    ok: true,
    mode: 'validate',
    spec: specResult.value,
    steps: stepDag.steps,
    dag: { order: stepDag.order, dependencies: stepDag.dependencies, hash: stepDag.hash },
    catalogs: catalogResult.value,
    riskPolicy: riskPolicyResult.value,
    riskAssessments,
    baseSha,
    repoRoot: paths.root,
    specPath: paths.relativeSpec,
  };
}

const MUTABLE_ADAPTER_METHODS = [
  'preflight', 'acquireLock', 'releaseLock', 'openRun', 'checkpoint', 'revalidate',
  'createAttempt', 'invoke', 'collectChanges', 'recordRiskSignals', 'runGate', 'reviewStep', 'acceptStep',
  'commitStep', 'reconcileStep', 'reviewGlobal', 'acceptGlobal', 'writeReports',
];

function requireAdapter(adapter, methods, mode) {
  const missing = methods.filter((method) => typeof adapter?.[method] !== 'function');
  if (missing.length > 0) {
    throw orchestrationError(
      'WORKFLOW_ADAPTER_UNAVAILABLE',
      `${mode} requires a workflow adapter before any mutable effect`,
      { missing },
    );
  }
  return adapter;
}

function runIdFor(validation, adapter) {
  return adapter.runId?.(validation) || `run-${validation.spec.id}`;
}

// Revalidação completa numa fronteira nomeada (trigger): confere hashes de spec/steps/schemas/
// catálogos, base SHA, lock e — quando aplicável — identidade do worktree/estado/artifacts. Qualquer
// divergência lança REVALIDATION_DRIFT (fail-closed). É chamada ao redor de cada efeito do ciclo.
async function checkedRevalidation(adapter, context, trigger) {
  const result = assertFullRevalidation(await adapter.revalidate({ ...context, trigger }), trigger);
  context.revalidations ||= [];
  context.revalidations.push({ trigger, ...result });
  context.latestRevalidation = { trigger, ...result };
  return result;
}

// Executa um step. No resume, um step já COMMITTED é pulado sem repetir efeito; estados intermediários
// (ACCEPTED/AWAITING_COMMIT/ACCEPTING/EXECUTING/COMMITTING) passam por reconcileStep — que prova o que
// já aconteceu em vez de refazer. Sem prova segura, para com RESUME_RECONCILIATION_REQUIRED.
async function processStep(adapter, context, step, persisted) {
  if (['COMMITTED', 'committed'].includes(persisted?.status)) return persisted;
  if (persisted?.status === 'READY' && persisted.approval?.checkpoint === 'pre-execution'
    && persisted.approval.status === 'satisfied') {
    persisted = { ...persisted, preApprovalSatisfied: true };
  }
  if (['AWAITING_PRE_APPROVAL', 'AWAITING_DIFF_APPROVAL'].includes(persisted?.status)) {
    if (persisted.approval?.status === 'stale') {
      const assessment = context.validation.riskAssessments
        ?.find((entry) => entry.stepId === step.id)?.assessment;
      const renewed = await adapter.checkpoint({
        ...context, step, attempt: persisted.attempt || 1,
        attemptId: persisted.attemptId, worktreeId: persisted.worktreeId,
        status: persisted.status, assessment,
        renewStale: true, ...(persisted.resumeContext || {}),
      });
      return { ...persisted, status: 'AWAITING_APPROVAL', approval: renewed };
    }
    if (persisted.approval?.status !== 'satisfied') return { ...persisted, status: 'AWAITING_APPROVAL' };
    if (persisted.status === 'AWAITING_PRE_APPROVAL') {
      await adapter.checkpoint({ ...context, step, status: 'READY', approvalSatisfied: true, revalidated: true });
      persisted = { ...persisted, status: 'READY', preApprovalSatisfied: true };
    }
  }
  if (persisted?.status === 'ACCEPTING' && persisted.resumeContext) {
    const resumed = persisted.resumeContext;
    const evaluatedScope = scope.evaluateScope({
      root: resumed.worktree.path || resumed.worktree,
      changes: resumed.diff.changes,
      predictedFiles: step.predictedFiles,
      allowedAreas: step.allowedAreas,
      semanticBoundaryEvidence: { inScope: step.boundaries.inScope, outOfScope: step.boundaries.outOfScope },
    });
    const attemptContext = {
      ...context, step, attempt: persisted.attempt, attemptId: persisted.attemptId,
      worktreeId: persisted.worktreeId,
    };
    return completeReviewedStep(adapter, attemptContext, {
      worktree: resumed.worktree, diff: resumed.diff, gates: resumed.gates,
      reviewResult: resumed.review, evaluatedScope,
    });
  }
  if (persisted && ['ACCEPTED', 'AWAITING_COMMIT', 'ACCEPTING', 'EXECUTING', 'COMMITTING'].includes(persisted.status)) {
    const reconciled = await adapter.reconcileStep({ ...context, step, persisted });
    if (['COMMITTED', 'committed'].includes(reconciled?.status)) {
      await checkedRevalidation(adapter, context, 'after-resume-reconciliation');
      return reconciled;
    }
    if (reconciled?.status === 'AWAITING_COMMIT') {
      await checkedRevalidation(adapter, context, 'after-resume-reconciliation');
      return reconciled;
    }
    if (reconciled?.safeToRetry !== true) throw orchestrationError('RESUME_RECONCILIATION_REQUIRED', `Step ${step.id} could not be reconciled safely`);
  }

  const maxAttempts = step.budgets.maxAttempts;
  const failures = [];
  const diagnoses = [];
  let lastFailure;
  for (let attempt = (persisted?.attempt || 0) + 1; attempt <= maxAttempts; attempt += 1) {
    const attemptContext = { ...context, step, attempt, attemptId: `attempt-${step.id}-${attempt}` };
    try {
      let assessment = persisted?.riskAssessment || context.validation.riskAssessments
        ?.find((entry) => entry.stepId === step.id)?.assessment;
      const priorRetrySignal = assessment?.signals?.find((signal) => (
        signal.kind === 'retry'
        && signal.source?.type === 'attempt'
        && signal.source.id === `attempt-${attempt}`
        && signal.evidenceRefs?.includes(attemptContext.attemptId)
      ));
      const retry = riskSignals.retrySignals({
        attempt, attemptId: attemptContext.attemptId,
        observedAt: priorRetrySignal?.observedAt || new Date().toISOString(),
      });
      if (retry.length > 0) assessment = await adapter.recordRiskSignals({ ...attemptContext, signals: retry });
      await adapter.checkpoint({ ...attemptContext, status: 'READY' });
      const approvedForCurrentAssessment = persisted?.preApprovalSatisfied === true
        && persisted.approval?.checkpoint === 'pre-execution'
        && persisted.approval.status === 'satisfied'
        && persisted.approval.binding?.assessmentHash === assessment?.hash
        && (persisted.approval.id === `approval-${step.id}-pre-execution-${attempt}`
          || persisted.approval.id.startsWith(`approval-${step.id}-pre-execution-${attempt}-renewal-`));
      if (assessment && assessment.effectiveLevel !== 'autonomous' && !approvedForCurrentAssessment) {
        const approval = await adapter.checkpoint({
          ...attemptContext, status: 'AWAITING_PRE_APPROVAL', assessment,
        });
        if (approval?.status === 'pending') {
          return { id: step.id, status: 'AWAITING_APPROVAL', approval };
        }
        if (approval?.status !== 'satisfied') {
          throw orchestrationError('RISK_APPROVAL_STATE_INVALID', 'Pre-execution risk approval was not explicitly satisfied');
        }
      }
      await checkedRevalidation(adapter, attemptContext, 'before-worktree');
      const worktree = await adapter.createAttempt(attemptContext);
      attemptContext.attemptId = worktree.attemptId || attemptContext.attemptId;
      attemptContext.worktreeId = worktree.worktreeId;
      await adapter.checkpoint({ ...attemptContext, status: 'EXECUTING', worktree });
      await checkedRevalidation(adapter, attemptContext, 'before-agent-call');
      const execution = await adapter.invoke({ ...attemptContext, role: 'executor', worktree });
      await checkedRevalidation(adapter, attemptContext, 'after-agent-call');
      const diff = await adapter.collectChanges({ ...attemptContext, worktree, execution });
      await checkedRevalidation(adapter, attemptContext, 'after-diff');
      const evaluatedScope = scope.evaluateScope({
        root: worktree.path || worktree,
        changes: diff.changes,
        predictedFiles: step.predictedFiles,
        allowedAreas: step.allowedAreas,
        semanticBoundaryEvidence: {
          inScope: step.boundaries.inScope,
          outOfScope: step.boundaries.outOfScope,
        },
      });
      const scopeRisk = riskSignals.scopeSignals({
        scope: evaluatedScope, attemptId: attemptContext.attemptId, observedAt: new Date().toISOString(),
      });
      if (scopeRisk.length > 0) assessment = await adapter.recordRiskSignals({ ...attemptContext, signals: scopeRisk });
      await adapter.checkpoint({ ...attemptContext, status: 'GATING' });
      const gates = [];
      for (const id of step.verification.gateIds) {
        const result = await adapter.runGate({ ...attemptContext, id, worktree });
        if (result?.ok !== true) throw orchestrationError('STEP_GATE_FAILED', `Gate failed: ${id}`, { stepId: step.id, gateId: id });
        gates.push({ id, ...result });
        await checkedRevalidation(adapter, attemptContext, `after-gate:${id}`);
      }
      await adapter.checkpoint({ ...attemptContext, status: 'REVALIDATING' });
      await checkedRevalidation(adapter, attemptContext, 'before-review');
      await adapter.checkpoint({ ...attemptContext, status: 'REVIEWING' });
      let reviewResult = await adapter.reviewStep({ ...attemptContext, worktree, diff, gates, scope: evaluatedScope });
      const reviewRisk = riskSignals.reviewSignals({
        review: reviewResult, evidenceRef: reviewResult.artifactRef?.id || `review-${attemptContext.attemptId}`,
        attempt, observedAt: new Date().toISOString(),
      });
      if (reviewRisk.length > 0) {
        assessment = await adapter.recordRiskSignals({ ...attemptContext, signals: reviewRisk });
        reviewResult = { ...reviewResult, assessment };
      }
      await checkedRevalidation(adapter, attemptContext, 'after-review');
      const reviewedAssessment = reviewResult.assessment || assessment;
      if (reviewedAssessment?.effectiveLevel === 'restricted') {
        const approval = await adapter.checkpoint({
          ...attemptContext, status: 'AWAITING_DIFF_APPROVAL', assessment: reviewedAssessment,
          worktree, diff, gates, scope: evaluatedScope, review: reviewResult,
        });
        if (approval?.status === 'pending') {
          return {
            id: step.id, status: 'AWAITING_APPROVAL', attempt,
            attemptId: attemptContext.attemptId, worktreeId: attemptContext.worktreeId, approval,
          };
        }
        if (approval?.status !== 'satisfied') {
          throw orchestrationError('RISK_APPROVAL_STATE_INVALID', 'Post-review risk approval was not explicitly satisfied');
        }
      }
      await adapter.checkpoint({ ...attemptContext, status: 'ACCEPTING' });
      return await completeReviewedStep(adapter, attemptContext, {
        worktree, diff, gates, reviewResult, evaluatedScope,
      });
    } catch (error) {
      // Falha do attempt: classifica (transiente vs determinística), e retryDecision decide se
      // reexecuta, chama o diagnostician (read-only, uma vez por fingerprint elegível) ou bloqueia.
      // O pipeline nunca corrige código sozinho — diagnosis apenas informa a decisão de retry.
      lastFailure = error;
      const failure = failureFrom(error, error.details?.role || 'executor', error.details?.phase || 'step');
      failures.push(failure);
      let decision = retryDecision({ failures, diagnoses, maxAttempts });
      if (decision.nextAction === 'DIAGNOSE') {
        await adapter.checkpoint({ ...attemptContext, status: 'RETRY_PENDING', cause: failure, retry: decision });
        await adapter.checkpoint({ ...attemptContext, status: 'DIAGNOSING', cause: failure });
        try {
          await checkedRevalidation(adapter, attemptContext, 'before-diagnosis');
          const diagnosis = await adapter.invoke({ ...attemptContext, role: 'diagnostician', failure });
          diagnoses.push({
            failureFingerprint: decision.failureFingerprint, afterFailureIndex: failures.length - 1,
            fresh: true, readOnly: true, artifactRef: diagnosis.artifactRef,
          });
          await checkedRevalidation(adapter, attemptContext, 'after-diagnosis');
        } catch (diagnosisError) {
          lastFailure = diagnosisError;
          await adapter.checkpoint({
            ...attemptContext, status: 'BLOCKED',
            cause: { code: diagnosisError.code || 'DIAGNOSIS_FAILED', role: 'diagnostician' },
          });
          break;
        }
        decision = retryDecision({ failures, diagnoses, maxAttempts });
        if (decision.retry === true) await adapter.checkpoint({ ...attemptContext, status: 'READY', retry: decision });
      }
      if (decision.retry !== true) {
        await adapter.checkpoint({ ...attemptContext, status: 'BLOCKED', cause: failure, retry: decision });
        break;
      }
      await adapter.checkpoint({ ...attemptContext, status: 'RETRY_PENDING', cause: failure, retry: decision });
    }
  }
  throw lastFailure;
}

async function completeReviewedStep(adapter, attemptContext, input) {
  const context = attemptContext;
  const { step, attempt } = attemptContext;
  const { worktree, diff, gates, reviewResult, evaluatedScope } = input;
  await checkedRevalidation(adapter, attemptContext, 'before-acceptance');
  const acceptance = await adapter.acceptStep({ ...attemptContext, diff, gates, review: reviewResult, scope: evaluatedScope });
  if (acceptance?.status === 'awaiting_human') {
    const result = {
      id: step.id, status: 'AWAITING_HUMAN', attempt, attemptId: attemptContext.attemptId,
      worktreeId: attemptContext.worktreeId, acceptance,
    };
    await adapter.checkpoint({ ...attemptContext, ...result, worktree, diff, cause: { code: 'ACCEPTANCE_AWAITING_HUMAN' } });
    return result;
  }
  if (acceptance?.ok !== true) throw orchestrationError('LOCAL_ACCEPTANCE_REJECTED', `Acceptance rejected step ${step.id}`, { acceptance });
  if (!(context.validation.spec.execution.autoCommit === true && context.options.allowCommit === true)) {
    await checkedRevalidation(adapter, attemptContext, 'before-commit');
    const result = { id: step.id, status: 'AWAITING_COMMIT', attempt, attemptId: attemptContext.attemptId, worktreeId: attemptContext.worktreeId, acceptance };
    await adapter.checkpoint({ ...attemptContext, ...result, worktree, diff });
    return result;
  }
  await checkedRevalidation(adapter, attemptContext, 'before-commit');
  await adapter.checkpoint({ ...attemptContext, status: 'COMMITTING', acceptance });
  const commit = await adapter.commitStep({ ...attemptContext, worktree, diff, acceptance });
  await checkedRevalidation(adapter, attemptContext, 'after-commit');
  const result = { id: step.id, status: 'COMMITTED', attempt, attemptId: attemptContext.attemptId, worktreeId: attemptContext.worktreeId, commit, acceptance };
  await adapter.checkpoint({ ...attemptContext, ...result });
  return result;
}

async function executeWorkflow(mode, options, dependencies = {}) {
  const validation = await validate(options, dependencies);
  if (options.dryRun) {
    return { ok: true, mode, dryRun: true, baseSha: validation.baseSha, dag: validation.dag, steps: validation.steps.map((step) => step.id) };
  }
  if (!dependencies.validationResult || hasRiskValidation(validation)) assertRiskValidation(validation, true);
  const adapter = requireAdapter(dependencies.adapter || createLocalAdapter({
    repoRoot: validation.repoRoot,
    runProcess: dependencies.runProcess,
    openCode: dependencies.openCode,
    ghRunProcess: dependencies.ghRunProcess,
    modules: dependencies.modules,
    evaluateLocalAcceptance: dependencies.evaluateLocalAcceptance,
    evaluateGlobalAcceptance: dependencies.evaluateGlobalAcceptance,
  }), MUTABLE_ADAPTER_METHODS, mode);
  const context = { mode, options, validation, runId: runIdFor(validation, adapter) };
  await adapter.preflight(context);
  const lock = await adapter.acquireLock({ ...context, removeOrphanLock: options.removeOrphanLock === true });
  context.lock = lock;
  try {
    let state = await adapter.openRun({ ...context, resume: mode === 'resume' });
    context.state = state;
    if (state?.status === 'SUCCEEDED') return { ok: true, mode, resumed: mode === 'resume', runId: context.runId, status: 'SUCCEEDED', steps: state.steps || [] };
    if (['FAILED', 'CANCELLED'].includes(state?.status)) {
      return { ok: false, mode, resumed: mode === 'resume', runId: context.runId, status: state.status, terminal: true, steps: state.steps || [] };
    }
    const awaitingCommit = mode === 'resume' && state?.steps?.some((step) => step.status === 'AWAITING_COMMIT');
    if (!awaitingCommit) {
      await checkedRevalidation(adapter, context, mode === 'resume' ? 'on-resume' : 'after-lock');
    }
    if (mode === 'resume' && options.decisionFile != null) {
      if (typeof adapter.consumeDecision !== 'function') {
        throw orchestrationError('WORKFLOW_ADAPTER_UNAVAILABLE', 'resume --decision-file requires decision consumption support');
      }
      const consumed = await adapter.consumeDecision({ ...context, decisionFile: options.decisionFile });
      state = consumed.state;
      if (consumed.classification === 'stale') {
        return { ok: false, blocked: true, code: 'HITL_DECISION_STALE', runId: context.runId, steps: state.steps || [] };
      }
      if (consumed.classification === 'rejected' && consumed.nextAction !== 'retry') {
        return {
          ok: false, rejected: true,
          code: consumed.nextAction === 'replan' ? 'RISK_REPLAN_REQUIRED' : 'RISK_ABORTED',
          runId: context.runId, status: state.status, steps: state.steps || [],
        };
      }
    }
    if (mode === 'resume' && state?.status === 'BLOCKED') {
      if (state.causeResolved !== true) {
        return { ok: false, blocked: true, code: 'BLOCKED_CAUSE_UNRESOLVED', runId: context.runId, steps: state.steps || [] };
      }
      await adapter.checkpoint({ ...context, status: 'RUNNING', resumeRequested: true, causeResolved: true, revalidated: true });
    }
    const completed = [];
    for (const step of validation.steps) {
      const persisted = state?.steps?.find((entry) => entry.id === step.id);
      let result;
      try {
        result = await processStep(adapter, context, step, persisted);
      } catch (error) {
        return { ok: false, blocked: true, code: error.code || 'STEP_FAILED', ...blockedCause(error), runId: context.runId, steps: completed };
      }
      completed.push(result);
      if (result.status === 'AWAITING_HUMAN') {
        return { ok: false, awaitingHuman: true, code: 'ACCEPTANCE_AWAITING_HUMAN', runId: context.runId, steps: completed, acceptance: result.acceptance };
      }
      if (result.status === 'AWAITING_APPROVAL') {
        return { ok: false, awaitingApproval: true, code: 'RISK_APPROVAL_REQUIRED', runId: context.runId, steps: completed, approval: result.approval };
      }
      if (result.status === 'AWAITING_COMMIT') {
        return { ok: false, awaitingHuman: true, code: 'COMMIT_AWAITING_HUMAN', runId: context.runId, steps: completed };
      }
    }
    if (completed.length !== validation.steps.length || completed.some((step) => step.status !== 'COMMITTED')) {
      await adapter.checkpoint({ ...context, status: 'BLOCKED', cause: { code: 'GLOBAL_STEPS_NOT_COMMITTED' } });
      return { ok: false, blocked: true, code: 'GLOBAL_STEPS_NOT_COMMITTED', runId: context.runId, steps: completed };
    }
    // AC-17: the global gates are exactly the deduplicated union of the required steps'
    // testing.gateIds. A spec whose steps all declare testing.required false has no global gates to
    // run, and inventing a set from the catalog's gate categories would run gates nobody declared —
    // the union is reachable-empty, since the schema accepts required: false.
    const globalGateIds = [...new Set(validation.steps.flatMap((step) => (
      step.testing?.required === true ? step.testing.gateIds : []
    )))];
    const globalGates = [];
    for (const id of globalGateIds) {
      let result;
      try {
        const winning = completed.at(-1);
        result = await adapter.runGate({
          ...context, scope: 'global', step: validation.steps.at(-1), attempt: winning.attempt,
          attemptId: winning.attemptId, worktreeId: winning.worktreeId, id,
          worktree: adapter.integratedWorktree?.({ ...context, steps: completed }),
        });
      } catch (error) {
        await adapter.checkpoint({ ...context, status: 'BLOCKED', cause: { code: error.code || 'GLOBAL_GATE_FAILED', gateId: id } });
        return { ok: false, blocked: true, code: error.code || 'GLOBAL_GATE_FAILED', gateId: id, ...blockedCause(error), runId: context.runId, steps: completed };
      }
      globalGates.push({ id, ...result });
      if (result?.ok !== true) {
        await adapter.checkpoint({ ...context, status: 'BLOCKED', cause: { code: 'GLOBAL_GATE_FAILED', gateId: id } });
        return { ok: false, blocked: true, code: 'GLOBAL_GATE_FAILED', gateId: id, runId: context.runId, steps: completed };
      }
      await checkedRevalidation(adapter, context, `after-global-gate:${id}`);
    }
    await adapter.checkpoint({ ...context, status: 'FINAL_REVIEW' });
    const winningAttempt = completed.at(-1);
    let globalReview;
    try {
      await checkedRevalidation(adapter, context, 'before-final-review');
      globalReview = await adapter.reviewGlobal({ ...context, ...winningAttempt, steps: completed, gates: globalGates, readOnly: true });
      await checkedRevalidation(adapter, context, 'after-final-review');
      await checkedRevalidation(adapter, context, 'before-global-acceptance');
    } catch (error) {
      await adapter.checkpoint({ ...context, status: 'BLOCKED', cause: { code: error.code || 'FINAL_REVIEW_FAILED' } });
      return { ok: false, blocked: true, code: error.code || 'FINAL_REVIEW_FAILED', ...blockedCause(error), runId: context.runId, steps: completed };
    }
    await adapter.checkpoint({ ...context, status: 'GLOBAL_ACCEPTANCE' });
    let globalAcceptance;
    try {
      globalAcceptance = await adapter.acceptGlobal({
        ...context, ...winningAttempt, steps: completed, gates: globalGates,
        requiredGateIds: globalGateIds, review: globalReview,
      });
    } catch (error) {
      await adapter.checkpoint({ ...context, status: 'BLOCKED', cause: { code: error.code || 'GLOBAL_ACCEPTANCE_FAILED' } });
      return { ok: false, blocked: true, code: error.code || 'GLOBAL_ACCEPTANCE_FAILED', ...blockedCause(error), runId: context.runId, steps: completed };
    }
    if (globalAcceptance?.ok !== true) {
      await adapter.checkpoint({ ...context, status: 'BLOCKED', cause: { code: 'GLOBAL_ACCEPTANCE_REJECTED' } });
      return { ok: false, blocked: true, code: 'GLOBAL_ACCEPTANCE_REJECTED', runId: context.runId, steps: completed, acceptance: globalAcceptance };
    }
    await adapter.checkpoint({ ...context, status: 'REPORTING' });
    let reports;
    try {
      reports = await adapter.writeReports({ ...context, ...winningAttempt, steps: completed, gates: globalGates, review: globalReview, acceptance: globalAcceptance });
    } catch (error) {
      await adapter.checkpoint({ ...context, status: 'BLOCKED', cause: { code: error.code || 'REPORTING_FAILED' } });
      return { ok: false, blocked: true, code: error.code || 'REPORTING_FAILED', ...blockedCause(error), runId: context.runId, steps: completed };
    }
    await adapter.checkpoint({ ...context, status: 'SUCCEEDED', steps: completed, reports });
    let pullRequest;
    if (options.createPr === true) {
      if (typeof adapter.createPullRequest !== 'function') throw orchestrationError('PR_ADAPTER_UNAVAILABLE', 'PR was requested but the adapter has no PR capability');
      await checkedRevalidation(adapter, context, 'before-pull-request');
      pullRequest = await adapter.createPullRequest({ ...context, steps: completed, reports, acceptance: globalAcceptance });
    }
    if (typeof adapter.cleanupStep === 'function') {
      for (const step of completed) await adapter.cleanupStep(step);
    }
    if (typeof adapter.notify === 'function') await adapter.notify({ ...context, type: 'succeeded', status: 'SUCCEEDED' });
    return { ok: true, mode, runId: context.runId, status: 'SUCCEEDED', steps: completed, review: globalReview, acceptance: globalAcceptance, reports, pullRequest };
  } finally {
    await adapter.releaseLock(lock);
  }
}

async function run(options, dependencies = {}) {
  return executeWorkflow('run', { ...options, command: 'run' }, dependencies);
}

async function resumeWorkflow(options, dependencies = {}) {
  return executeWorkflow('resume', { ...options, command: 'resume' }, dependencies);
}

async function reviewWorkflow(options, dependencies = {}) {
  const validation = await validate(options, dependencies);
  const defaultAdapter = dependencies.adapter ? null : createLocalAdapter({
    repoRoot: validation.repoRoot,
    runProcess: dependencies.runProcess,
    openCode: dependencies.openCode,
    modules: dependencies.modules,
    evaluateGlobalAcceptance: dependencies.evaluateGlobalAcceptance,
  });
  const adapter = requireAdapter(dependencies.adapter || defaultAdapter, ['openReviewSnapshot', 'reviewGlobal', 'acceptGlobal'], 'review');
  const context = { mode: 'review', options, validation, runId: runIdFor(validation, adapter) };
  if (defaultAdapter) await adapter.preflight(context);
  let snapshot;
  try {
    snapshot = await adapter.openReviewSnapshot(context);
    if (!snapshot || snapshot.closed !== true) throw orchestrationError('REVIEW_SNAPSHOT_NOT_CLOSED', 'Read-only review requires a closed snapshot');
    const reviewResult = await adapter.reviewGlobal({ ...context, snapshot, readOnly: true });
    if (reviewResult?.mutated === true) throw orchestrationError('READ_ONLY_MUTATION_DETECTED', 'Global reviewer mutated its target');
    const acceptance = await adapter.acceptGlobal({ ...context, snapshot, review: reviewResult, readOnly: true });
    return { ok: acceptance?.ok === true, mode: 'review', readOnly: true, review: reviewResult, acceptance };
  } finally {
    await adapter.closeReviewSnapshot?.(snapshot);
  }
}

module.exports = {
  assertFullRevalidation,
  resume: resumeWorkflow,
  review: reviewWorkflow,
  run,
  validate,
  validateSemantics,
  workflowPaths,
};
