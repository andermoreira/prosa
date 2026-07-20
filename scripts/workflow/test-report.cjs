'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const YAML = require('yaml');
const { validate } = require('./lib/contracts.cjs');
const { createNotificationService } = require('./lib/notifications.cjs');
const { buildRetrospective, createReportStore, validateReport } = require('./lib/report.cjs');

function catalog() {
  const notifier = (id, capability, executable) => ({
    id, type: 'notifier', executable, args: [], cwd: 'repo-root', timeoutMs: 1000,
    maxOutputBytes: 1024, capabilities: ['notification:send', capability], envAllowlist: [], readOnly: true,
  });
  return { ok: true, value: { resources: { resources: [
    notifier('notifier-macos', 'platform:macos', '/usr/bin/osascript'),
    notifier('notifier-linux', 'platform:linux', 'notify-send'),
    notifier('notifier-terminal', 'platform:terminal', 'tee'),
  ] } } };
}

function reportInput(overrides = {}) {
  return {
    runId: 'run-14', outcome: 'succeeded',
    steps: [{ id: 'step-14', state: 'COMMITTED', commit: { sha: 'a'.repeat(40) } }],
    transitions: [{ from: 'REPORTING', to: 'SUCCEEDED', cause: 'password=report-secret' }],
    usage: { total: {
      attempts: { limit: 2, consumed: 1, reserved: 0 }, agentCalls: { limit: 4, consumed: 2, reserved: 0 },
      reviewCycles: { limit: 2, consumed: 1, reserved: 0 }, diagnosisCycles: { limit: 2, consumed: 0, reserved: 0 },
      elapsedMinutes: { limit: 10, consumed: 1.5, reserved: 0 }, estimatedCost: { limit: null, consumed: null, reserved: 0 },
      tokens: { limit: null, consumed: null, reserved: 0 },
    } },
    gates: [{ id: 'workflow-tests', passed: true }], revalidations: [{ trigger: 'before-global-acceptance', ok: true }],
    retries: [{ attempt: 1, decision: 'stop' }],
    evidence: [{ acId: 'AC-18', resultRef: 'artifact-report' }], documentationImpacts: [{ kind: 'none', justification: 'No durable docs changed.' }],
    findingsBacklog: [{ id: 'finding-follow-up', severity: 'low' }], risks: ['Notifier unavailable'],
    observations: [{ category: 'outcome', summary: 'Completed safely.', artifactIds: ['artifact-report'] }],
    proposals: [{ summary: 'Review notification availability.', rationale: 'Fallback was used.', autoApply: false }],
    ...overrides,
  };
}

test('writes sanitized schema-valid final report JSON and retrospective YAML under artifacts/reports', () => {
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'workflow-report-'));
  test.after(() => fs.rmSync(runtimeRoot, { recursive: true, force: true }));
  const store = createReportStore({ runtimeRoot, now: () => '2026-07-16T00:00:00.000Z' });
  const result = store.writeFinalArtifacts(reportInput());
  const reportPath = path.join(runtimeRoot, 'artifacts/reports/final-report.json');
  const retrospectivePath = path.join(runtimeRoot, 'artifacts/reports/retrospective.yaml');
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  const retrospective = YAML.parse(fs.readFileSync(retrospectivePath, 'utf8'));
  assert.equal(validateReport(report).ok, true);
  assert.equal(validate('retrospective', retrospective).ok, true);
  assert.equal(report.budget.estimatedCost, null);
  assert.equal(report.budget.tokens, null);
  assert.deepEqual(report.metrics, { planned: 1, completed: 1, attempts: 0, rejections: 0, blocked: 0 });
  assert.deepEqual(report.retries, [{ attempt: 1, decision: 'stop' }]);
  assert.equal(fs.readFileSync(reportPath, 'utf8').includes('report-secret'), false);
  assert.match(result.report.artifactRef.hash, /^[0-9a-f]{64}$/);
});

test('retrospective keeps an empty backlog and rejects auto-apply proposals', () => {
  const retrospective = buildRetrospective(reportInput({ findingsBacklog: [], proposals: [] }));
  assert.deepEqual(retrospective.findingsBacklog, []);
  assert.deepEqual(retrospective.proposals, []);
  assert.throws(() => buildRetrospective(reportInput({ proposals: [{ summary: 'Mutate SSOT', rationale: 'Unsafe.', autoApply: true }] })), { code: 'RETROSPECTIVE_AUTO_APPLY_FORBIDDEN' });
});

test('uses fake macOS and Linux process commands with only a minimal sanitized payload', async () => {
  for (const [platform, executable] of [['darwin', '/usr/bin/osascript'], ['linux', 'notify-send']]) {
    const calls = [];
    const persisted = [];
    const service = createNotificationService({
      catalog: catalog(), platform, repoRoot: process.cwd(), persistEvent: async (event) => { persisted.push(event); return { id: 'event-1' }; },
      async runProcess(command) { calls.push(command); return { ok: true, status: 'succeeded' }; },
    });
    const result = await service.notify({ type: 'blocked', runId: 'run-14', code: 'password=notify-secret', raw: 'must-not-pass' }, ['notifier-macos', 'notifier-linux', 'notifier-terminal']);
    assert.equal(result.ok, true);
    assert.equal(calls[0].executable, executable);
    assert.equal(JSON.stringify(calls).includes('notify-secret'), false);
    assert.equal(JSON.stringify(calls).includes('must-not-pass'), false);
    assert.equal(persisted[0].delivery, 'pending');
  }
});

test('persists first and falls back to terminal bell without changing the caller outcome', async () => {
  const order = [];
  const calls = [];
  const service = createNotificationService({
    catalog: catalog(), platform: 'darwin', repoRoot: process.cwd(),
    async persistEvent(event) { order.push(`persist:${event.delivery}`); return { id: 'event-1' }; },
    async runProcess(command) {
      calls.push(command); order.push(`process:${command.executable}`);
      return command.executable === 'tee' ? { ok: true, status: 'succeeded' } : { ok: false, status: 'spawn_error' };
    },
  });
  const acceptance = { ok: true };
  const result = await service.notify({ type: 'spec-succeeded', runId: 'run-14', status: 'succeeded' }, ['notifier-macos', 'notifier-terminal']);
  assert.equal(result.ok, true);
  assert.equal(acceptance.ok, true);
  assert.deepEqual(order.slice(0, 3), ['persist:pending', 'process:/usr/bin/osascript', 'process:tee']);
  assert.match(calls[1].input, /^\u0007/);
});
