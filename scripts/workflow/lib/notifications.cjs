'use strict';

const { resolveResource } = require('./catalogs.cjs');
const { runProcess } = require('./process.cjs');
const { sanitize } = require('./sanitize.cjs');

const EVENTS = Object.freeze([
  'blocked', 'budget-exhausted', 'awaiting-human', 'spec-succeeded', 'pull-request', 'fatal',
]);
const PLATFORM_CAPABILITY = Object.freeze({ darwin: 'platform:macos', linux: 'platform:linux' });

function notificationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function minimalPayload(event) {
  if (!EVENTS.includes(event.type)) throw notificationError('NOTIFICATION_EVENT_INVALID', `Unsupported notification event: ${event.type}`);
  const payload = {
    type: event.type,
    runId: event.runId,
    stepId: event.stepId || null,
    code: event.code || null,
    status: event.status || null,
  };
  const sanitized = sanitize(payload, { maxBytes: 1024 });
  if (sanitized.truncated) throw notificationError('NOTIFICATION_PAYLOAD_INVALID', 'Notification payload exceeds its safe limit');
  return JSON.parse(sanitized.content);
}

function createNotificationService(options = {}) {
  if (typeof options.persistEvent !== 'function') throw notificationError('NOTIFICATION_PERSISTENCE_REQUIRED', 'persistEvent is required');
  const execute = options.runProcess || runProcess;
  const platform = options.platform || process.platform;

  function resourcesFor(resourceIds) {
    if (!Array.isArray(resourceIds)) throw notificationError('NOTIFICATION_RESOURCES_INVALID', 'Notification resource IDs must be an array');
    return resourceIds.map((id) => {
      const resolved = resolveResource(options.catalog, id);
      if (!resolved.ok) throw notificationError(resolved.errors[0].code, resolved.errors[0].message);
      const resource = resolved.value;
      if (resource.type !== 'notifier' || !resource.capabilities.includes('notification:send')) {
        throw notificationError('NOTIFICATION_RESOURCE_INVALID', `Resource is not an approved notifier: ${id}`);
      }
      return resource;
    });
  }

  function orderedResources(resourceIds) {
    const resources = resourcesFor(resourceIds);
    const preferred = PLATFORM_CAPABILITY[platform];
    const terminal = resources.find((resource) => resource.capabilities.includes('platform:terminal'));
    const primary = resources.find((resource) => preferred && resource.capabilities.includes(preferred));
    return [...new Set([primary, terminal].filter(Boolean))];
  }

  async function notify(event, resourceIds) {
    const payload = minimalPayload(event);
    const persisted = await options.persistEvent({ ...payload, delivery: 'pending' });
    let candidates;
    try {
      candidates = orderedResources(resourceIds);
    } catch (error) {
      await options.persistEvent({ ...payload, delivery: 'failed', code: error.code || 'NOTIFICATION_RESOURCE_INVALID', eventId: persisted?.id });
      return { ok: false, code: error.code || 'NOTIFICATION_RESOURCE_INVALID' };
    }
    if (candidates.length === 0) {
      await options.persistEvent({ ...payload, delivery: 'failed', code: 'NOTIFICATION_PLATFORM_UNAVAILABLE', eventId: persisted?.id });
      return { ok: false, code: 'NOTIFICATION_PLATFORM_UNAVAILABLE' };
    }
    const message = JSON.stringify(payload);
    const attempts = [];
    for (const resource of candidates) {
      const terminal = resource.capabilities.includes('platform:terminal');
      let result;
      try {
        result = await execute({
          executable: resource.executable,
          args: terminal ? resource.args : [...resource.args, message],
          input: terminal ? `\u0007${message}\n` : undefined,
          root: options.repoRoot,
          cwd: resource.cwd === 'repo-root' ? '.' : options.worktreeRoot,
          envAllowlist: resource.envAllowlist,
          timeoutMs: resource.timeoutMs,
          maxOutputBytes: resource.maxOutputBytes,
        });
      } catch (error) {
        result = { ok: false, status: error.code || 'spawn_error' };
      }
      attempts.push({ resourceId: resource.id, status: result.status });
      if (result.ok) {
        await options.persistEvent({ ...payload, delivery: 'succeeded', resourceId: resource.id, eventId: persisted?.id });
        return { ok: true, resourceId: resource.id, attempts };
      }
    }
    await options.persistEvent({ ...payload, delivery: 'failed', attempts, eventId: persisted?.id });
    return { ok: false, code: 'NOTIFICATION_DELIVERY_FAILED', attempts };
  }

  return { notify };
}

module.exports = { EVENTS, createNotificationService, minimalPayload };
