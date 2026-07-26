'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const { runPublicAlphaDemo } = require('./demo-public-alpha.cjs');

const SCRIPT = path.join(__dirname, 'demo-public-alpha.cjs');

test('public alpha demo is deterministic and covers the complete decision cycle', () => {
  const first = runPublicAlphaDemo();
  const second = runPublicAlphaDemo();

  assert.deepEqual(first, second);
  assert.equal(first.outcome, 'approved');
  assert.equal(first.externalCalls, 0);
  assert.deepEqual(
    first.stages.map(({ name, status }) => `${name}:${status}`),
    [
      'validation:passed',
      'confined-execution:passed',
      'gate:passed',
      'review:approved',
      'human-decision:approved',
      'report:written',
    ],
  );
});

test('public alpha demo runs without credentials, agent binaries, or network configuration', () => {
  const result = spawnSync(process.execPath, [SCRIPT], {
    cwd: path.resolve(__dirname, '../..'),
    encoding: 'utf8',
    env: { PATH: '' },
  });

  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.externalCalls, 0);
  assert.doesNotMatch(result.stdout, /(?:token|secret|password|\/Users\/|\/home\/)/i);
});
