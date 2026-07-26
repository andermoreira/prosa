'use strict';

const path = require('node:path');
const { validateFile } = require('./lib/contracts.cjs');

const ROOT = path.resolve(__dirname, '../..');
const EXAMPLE_ROOT = path.join(ROOT, 'examples/public-alpha');

function validatedContract(type, fileName) {
  const result = validateFile(type, path.join(EXAMPLE_ROOT, fileName));
  if (!result.ok) {
    const error = new Error(`${type} validation failed`);
    error.code = 'DEMO_CONTRACT_INVALID';
    error.details = result.errors;
    throw error;
  }
  return result.value;
}

function runPublicAlphaDemo() {
  const spec = validatedContract('spec', 'spec.md');
  const step = validatedContract('step', 'step.md');

  if (step.specId !== spec.id || step.context.specPath !== 'examples/public-alpha/spec.md') {
    const error = new Error('The demo step is not bound to the demo spec');
    error.code = 'DEMO_BINDING_INVALID';
    throw error;
  }

  return {
    demo: 'prosa-public-alpha',
    outcome: 'approved',
    externalCalls: 0,
    stages: [
      { name: 'validation', status: 'passed', evidence: [spec.id, step.id] },
      { name: 'confined-execution', status: 'passed', evidence: ['fixture-only', 'network-disabled'] },
      { name: 'gate', status: 'passed', evidence: ['demo-test'] },
      { name: 'review', status: 'approved', evidence: ['no-blocking-findings'] },
      { name: 'human-decision', status: 'approved', evidence: ['simulated-explicit-approval'] },
      { name: 'report', status: 'written', evidence: ['stdout-json'] },
    ],
  };
}

if (require.main === module) {
  process.stdout.write(`${JSON.stringify(runPublicAlphaDemo(), null, 2)}\n`);
}

module.exports = { runPublicAlphaDemo };
