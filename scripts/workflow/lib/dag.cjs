'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const { parseMarkdownFrontMatter, validate } = require('./contracts.cjs');

class DagError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'DagError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new DagError(code, message, details);
}

function readStep(filePath) {
  const parsed = parseMarkdownFrontMatter(fs.readFileSync(filePath, 'utf8'));
  if (!parsed.ok) fail('DAG_FRONT_MATTER_INVALID', `Invalid step front matter: ${filePath}`, { errors: parsed.errors });
  if (!Object.hasOwn(parsed.value, 'dependsOn')) {
    fail('DAG_DEPENDENCIES_REQUIRED', `Step must declare dependsOn explicitly: ${filePath}`);
  }
  const validation = validate('step', parsed.value);
  if (!validation.ok) fail('DAG_STEP_INVALID', `Step does not match its schema: ${filePath}`, { errors: validation.errors });
  return parsed.value;
}

function compareSteps(left, right) {
  return left.sequence - right.sequence || left.id.localeCompare(right.id, 'en');
}

function indexSteps(steps) {
  const byId = new Map();
  for (const step of steps) {
    if (!step || typeof step !== 'object') fail('DAG_STEP_INVALID', 'Every step must be an object');
    if (!Object.hasOwn(step, 'dependsOn')) fail('DAG_DEPENDENCIES_REQUIRED', `Step must declare dependsOn explicitly: ${step.id || '<unknown>'}`);
    if (!Array.isArray(step.dependsOn)) fail('DAG_DEPENDENCIES_INVALID', `dependsOn must be an array: ${step.id || '<unknown>'}`);
    if (byId.has(step.id)) fail('DAG_DUPLICATE_ID', `Duplicate step ID: ${step.id}`, { stepId: step.id });
    byId.set(step.id, step);
  }
  return byId;
}

function validateDependencies(byId) {
  for (const step of byId.values()) {
    const seen = new Set();
    for (const dependencyId of step.dependsOn) {
      if (seen.has(dependencyId)) fail('DAG_DUPLICATE_DEPENDENCY', `Duplicate dependency ${dependencyId} in ${step.id}`);
      seen.add(dependencyId);
      if (dependencyId === step.id) fail('DAG_SELF_DEPENDENCY', `Step cannot depend on itself: ${step.id}`);
      if (!byId.has(dependencyId)) fail('DAG_UNKNOWN_DEPENDENCY', `Unknown dependency ${dependencyId} in ${step.id}`);
    }
  }
}

function insertReady(ready, step) {
  ready.push(step);
  ready.sort(compareSteps);
}

function topologicalOrder(byId) {
  const indegree = new Map([...byId.values()].map((step) => [step.id, step.dependsOn.length]));
  const dependents = new Map([...byId.keys()].map((id) => [id, []]));
  for (const step of byId.values()) {
    for (const dependencyId of step.dependsOn) dependents.get(dependencyId).push(step);
  }
  for (const values of dependents.values()) values.sort(compareSteps);

  const ready = [...byId.values()].filter((step) => indegree.get(step.id) === 0).sort(compareSteps);
  const order = [];
  while (ready.length > 0) {
    const step = ready.shift();
    order.push(step.id);
    for (const dependent of dependents.get(step.id)) {
      const remaining = indegree.get(dependent.id) - 1;
      indegree.set(dependent.id, remaining);
      if (remaining === 0) insertReady(ready, dependent);
    }
  }
  if (order.length !== byId.size) {
    const cycle = [...indegree].filter(([, degree]) => degree > 0).map(([id]) => id).sort();
    fail('DAG_CYCLE', `Step dependency cycle detected: ${cycle.join(', ')}`, { stepIds: cycle });
  }
  return order;
}

function deriveDagFromSteps(steps) {
  if (!Array.isArray(steps) || steps.length === 0) fail('DAG_EMPTY', 'At least one step is required');
  const byId = indexSteps(steps);
  validateDependencies(byId);
  for (const step of byId.values()) {
    const validation = validate('step', step);
    if (!validation.ok) fail('DAG_STEP_INVALID', `Step does not match its schema: ${step.id}`, { errors: validation.errors });
  }
  const order = topologicalOrder(byId);
  const dependencies = Object.fromEntries(order.map((id) => [id, [...byId.get(id).dependsOn].sort()]));
  const hash = crypto.createHash('sha256').update(JSON.stringify({ order, dependencies })).digest('hex');
  return { order, dependencies, hash, steps: order.map((id) => byId.get(id)) };
}

function deriveDag(stepPaths) {
  if (!Array.isArray(stepPaths)) fail('DAG_INPUT_INVALID', 'Step paths must be an array');
  return deriveDagFromSteps(stepPaths.map(readStep));
}

module.exports = { DagError, deriveDag, deriveDagFromSteps, readStep };
