'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Ajv2020 = require('ajv/dist/2020');
const YAML = require('yaml');
const { atomicWriteFile } = require('./artifacts.cjs');
const { validate, validateSource } = require('./contracts.cjs');
const { assertSecureRuntimePath, secureMkdir } = require('./runtime.cjs');
const { sanitize } = require('./sanitize.cjs');

const REPORT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['schemaVersion', 'reportId', 'runId', 'final', 'outcome', 'generatedAt', 'stateTransitions', 'metrics', 'budget', 'retries', 'gates', 'revalidation', 'evidence', 'documentationImpact', 'findingsBacklog', 'commits', 'risks', 'notifications', 'acceptance'],
  properties: {
    schemaVersion: { const: '1.0.0' },
    reportId: { type: 'string', pattern: '^report-[A-Za-z0-9][A-Za-z0-9._-]*$' },
    runId: { type: 'string', pattern: '^run-[A-Za-z0-9][A-Za-z0-9._-]*$' },
    final: { type: 'boolean' },
    outcome: { enum: ['running', 'succeeded', 'blocked', 'failed', 'cancelled'] },
    generatedAt: { type: 'string', minLength: 1 },
    stateTransitions: { type: 'array', items: { type: 'object' } },
    metrics: {
      type: 'object', additionalProperties: false,
      required: ['planned', 'completed', 'attempts', 'rejections', 'blocked'],
      properties: {
        planned: { type: 'integer', minimum: 0 }, completed: { type: 'integer', minimum: 0 },
        attempts: { type: 'integer', minimum: 0 }, rejections: { type: 'integer', minimum: 0 },
        blocked: { type: 'integer', minimum: 0 },
      },
    },
    budget: {
      type: 'object', additionalProperties: false,
      required: ['limits', 'consumed', 'reserved', 'estimatedCost', 'tokens'],
      properties: {
        limits: { type: 'object' }, consumed: { type: 'object' }, reserved: { type: 'object' },
        estimatedCost: { type: ['number', 'null'], minimum: 0 },
        tokens: { type: ['integer', 'null'], minimum: 0 },
      },
    },
    retries: { type: 'array' }, gates: { type: 'array' }, revalidation: { type: 'array' }, evidence: { type: 'array' },
    documentationImpact: { type: 'array' }, findingsBacklog: { type: 'array' }, commits: { type: 'array' },
    risks: { type: 'array' }, notifications: { type: 'array' }, acceptance: { type: ['object', 'null'] },
  },
};

const reportValidator = new Ajv2020({ allErrors: true, strict: true }).compile(REPORT_SCHEMA);

function reportError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  return error;
}

function nonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0 ? value : 0;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function metricValue(metric, fallback = 0) {
  if (metric && typeof metric === 'object' && Object.hasOwn(metric, 'consumed')) return metric.consumed;
  return metric ?? fallback;
}

function budgetView(usage = {}) {
  const counters = usage.total || usage;
  const limits = {};
  const consumed = {};
  const reserved = {};
  for (const [name, metric] of Object.entries(counters || {})) {
    if (!metric || typeof metric !== 'object' || !Object.hasOwn(metric, 'limit')) continue;
    limits[name] = metric.limit;
    consumed[name] = metric.consumed;
    reserved[name] = metric.reserved;
  }
  return {
    limits,
    consumed,
    reserved,
    estimatedCost: metricValue(counters?.estimatedCost, null),
    tokens: metricValue(counters?.tokens, null),
  };
}

function buildFinalReport(input, options = {}) {
  const steps = list(input.steps);
  const findings = list(input.findingsBacklog || input.findings);
  const report = {
    schemaVersion: '1.0.0',
    reportId: input.reportId || `report-${input.runId.replace(/^run-/, '')}`,
    runId: input.runId,
    final: input.final !== false,
    outcome: input.outcome || 'succeeded',
    generatedAt: input.generatedAt || (options.now || (() => new Date().toISOString()))(),
    stateTransitions: list(input.stateTransitions || input.transitions),
    metrics: {
      planned: nonNegativeInteger(input.metrics?.planned ?? steps.length),
      completed: nonNegativeInteger(input.metrics?.completed ?? steps.filter((step) => ['COMMITTED', 'committed', 'SUCCEEDED', 'succeeded'].includes(step.state || step.status)).length),
      attempts: nonNegativeInteger(input.metrics?.attempts ?? list(input.attempts).length),
      rejections: nonNegativeInteger(input.metrics?.rejections ?? findings.filter((finding) => ['critical', 'high'].includes(finding.severity)).length),
      blocked: nonNegativeInteger(input.metrics?.blocked ?? steps.filter((step) => ['BLOCKED', 'blocked'].includes(step.state || step.status)).length),
    },
    budget: budgetView(input.budget || input.usage),
    retries: list(input.retries),
    gates: list(input.gates),
    revalidation: list(input.revalidation || input.revalidations),
    evidence: list(input.evidence),
    documentationImpact: list(input.documentationImpact || input.documentationImpacts),
    findingsBacklog: findings,
    commits: list(input.commits || steps.map((step) => step.commit).filter(Boolean)),
    risks: list(input.risks),
    notifications: list(input.notifications),
    acceptance: input.acceptance || null,
  };
  const sanitized = sanitize(report);
  if (sanitized.truncated) throw reportError('REPORT_TOO_LARGE', 'Report cannot be safely persisted within the sanitization limit');
  const value = JSON.parse(sanitized.content);
  const validation = validateReport(value);
  if (!validation.ok) throw reportError('REPORT_SCHEMA_INVALID', 'Report failed schema validation', { errors: validation.errors });
  return value;
}

function validateReport(value) {
  const ok = reportValidator(value);
  return { ok, value: ok ? value : undefined, errors: ok ? [] : structuredClone(reportValidator.errors || []) };
}

function artifactIds(observation) {
  return [...new Set(list(observation.artifactIds).filter((id) => /^artifact-[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)))];
}

function buildRetrospective(input, options = {}) {
  const report = input.report || buildFinalReport(input, options);
  const usage = input.budget?.total || input.usage?.total || input.budget || input.usage || {};
  const observations = list(input.observations).map((observation) => ({
    category: observation.category,
    summary: observation.summary,
    artifactIds: artifactIds(observation),
  }));
  if (observations.length === 0) observations.push({ category: 'outcome', summary: `Run ${report.outcome}.`, artifactIds: [] });
  const proposals = list(input.proposals).map((proposal) => {
    if (proposal.autoApply !== false) throw reportError('RETROSPECTIVE_AUTO_APPLY_FORBIDDEN', 'Retrospective proposals must set autoApply to false');
    return { summary: proposal.summary, rationale: proposal.rationale, autoApply: false };
  });
  const retrospective = {
    schemaVersion: '1.0.0',
    retrospectiveId: input.retrospectiveId || `retrospective-${input.runId.replace(/^run-/, '')}`,
    runId: input.runId,
    outcome: report.outcome === 'running' ? 'blocked' : report.outcome,
    metrics: {
      attempts: nonNegativeInteger(metricValue(usage.attempts, report.metrics.attempts)),
      agentCalls: nonNegativeInteger(metricValue(usage.agentCalls)),
      reviewCycles: nonNegativeInteger(metricValue(usage.reviewCycles)),
      diagnosisCycles: nonNegativeInteger(metricValue(usage.diagnosisCycles)),
      elapsedMinutes: Math.max(0, Number(metricValue(usage.elapsedMinutes)) || 0),
      estimatedCost: metricValue(usage.estimatedCost, null),
      tokens: metricValue(usage.tokens, null),
      reworkCycles: nonNegativeInteger(input.metrics?.reworkCycles ?? metricValue(usage.diagnosisCycles)),
    },
    observations,
    findingsBacklog: [...new Set(report.findingsBacklog.map((finding) => typeof finding === 'string' ? finding : finding.id).filter((id) => /^finding-[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id || '')))],
    proposals,
    createdAt: input.createdAt || report.generatedAt,
  };
  const sanitized = sanitize(retrospective);
  if (sanitized.truncated) throw reportError('RETROSPECTIVE_TOO_LARGE', 'Retrospective cannot be safely persisted within the sanitization limit');
  const value = JSON.parse(sanitized.content);
  const validation = validate('retrospective', value);
  if (!validation.ok) throw reportError('RETROSPECTIVE_SCHEMA_INVALID', 'Retrospective failed schema validation', { errors: validation.errors });
  return value;
}

function createReportStore(options = {}) {
  if (typeof options.runtimeRoot !== 'string' || !path.isAbsolute(options.runtimeRoot)) {
    throw reportError('REPORT_RUNTIME_INVALID', 'runtimeRoot must be absolute');
  }
  const runtimeRoot = path.resolve(options.runtimeRoot);
  const reportsRoot = path.join(runtimeRoot, 'artifacts', 'reports');
  const primaryRoot = path.dirname(path.dirname(path.dirname(runtimeRoot)));
  const protectedRuntime = path.basename(path.dirname(runtimeRoot)) === 'runs'
    && path.basename(path.dirname(path.dirname(runtimeRoot))) === '.workflow-runtime';
  const io = options.fs || fs;
  const now = options.now || (() => new Date().toISOString());
  if (protectedRuntime && io === fs) secureMkdir(primaryRoot, reportsRoot);

  function write(name, content) {
    const filePath = path.join(reportsRoot, name);
    if (protectedRuntime && io === fs) assertSecureRuntimePath(primaryRoot, filePath);
    atomicWriteFile(filePath, content, { ...(options.atomic || {}), fs: io, primaryRoot: protectedRuntime ? primaryRoot : undefined });
    return {
      id: `artifact-${name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9._-]/g, '-')}`,
      path: path.relative(runtimeRoot, filePath).split(path.sep).join('/'),
      hash: crypto.createHash('sha256').update(content).digest('hex'),
      createdAt: now(),
    };
  }

  function writeReport(input) {
    const report = buildFinalReport(input, { now });
    const content = `${JSON.stringify(report, null, 2)}\n`;
    return { value: report, artifactRef: write(report.final ? 'final-report.json' : 'partial-report.json', content) };
  }

  function writeRetrospective(input) {
    const retrospective = buildRetrospective(input, { now });
    const content = YAML.stringify(retrospective);
    const validation = validateSource('retrospective', content, 'yaml');
    if (!validation.ok) throw reportError('RETROSPECTIVE_SCHEMA_INVALID', 'Serialized retrospective failed schema validation', { errors: validation.errors });
    return { value: retrospective, artifactRef: write('retrospective.yaml', content) };
  }

  function writeFinalArtifacts(input) {
    const report = writeReport({ ...input, final: true });
    const retrospective = writeRetrospective({ ...input, report: report.value });
    return { report, retrospective };
  }

  return { writeFinalArtifacts, writePartial: (input) => writeReport({ ...input, final: false }), writeReport, writeRetrospective };
}

module.exports = { REPORT_SCHEMA, buildFinalReport, buildRetrospective, createReportStore, validateReport };
