'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const Ajv2020 = require('ajv/dist/2020');
const { parseYaml } = require('./contracts.cjs');
const { runProcess } = require('./process.cjs');

const CATALOG_PATHS = Object.freeze({ gates: 'workflow/gates.yaml', resources: 'workflow/resources.yaml' });
const ID_PATTERN = '^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$';
const commandProperties = {
  executable: { type: 'string', minLength: 1, maxLength: 1024, pattern: '^[^\\u0000]+$' },
  args: { type: 'array', maxItems: 64, items: { type: 'string', maxLength: 8192, pattern: '^[^\\u0000]*$' } },
  cwd: { enum: ['repo-root', 'worktree-root'] },
  timeoutMs: { type: 'integer', minimum: 1, maximum: 3600000 },
  maxOutputBytes: { type: 'integer', minimum: 1, maximum: 16777216 },
};
const sandboxPolicySchema = {
  type: 'object', additionalProperties: false,
  required: ['required', 'engine', 'version', 'networkDomains', 'denySensitiveFiles', 'allowUnixSockets', 'allowLocalBinding'],
  properties: {
    required: { const: true },
    engine: { const: '@anthropic-ai/sandbox-runtime' },
    version: { const: '0.0.66' },
    networkDomains: {
      type: 'array', uniqueItems: true, maxItems: 32,
      items: { type: 'string', pattern: '^(?!.*\\*)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$' },
    },
    denySensitiveFiles: { const: true },
    allowUnixSockets: { const: false },
    allowLocalBinding: { const: false },
  },
};
// Gate sandbox policy (ADR 028): asymmetric to the agent policy. No networkDomains (empty, enforced
// by maxItems: 0) and no denySensitiveFiles — a gate gets broad read because its containment is
// output (network + confined write), not input secrecy.
const gateSandboxPolicySchema = {
  type: 'object', additionalProperties: false,
  required: ['required', 'engine', 'version', 'networkDomains', 'allowUnixSockets', 'allowLocalBinding'],
  properties: {
    required: { const: true },
    engine: { const: '@anthropic-ai/sandbox-runtime' },
    version: { const: '0.0.66' },
    networkDomains: { type: 'array', maxItems: 0 },
    allowUnixSockets: { const: false },
    allowLocalBinding: { const: false },
  },
};

const catalogSchemas = {
  gates: {
    type: 'object', additionalProperties: false, required: ['version', 'gates'],
    properties: {
      version: { const: 1 },
      gates: {
        type: 'array', minItems: 1, maxItems: 128, items: {
          oneOf: [
            { $ref: '#/$defs/executableGate' },
            { $ref: '#/$defs/mcpGate' },
          ],
        },
      },
    },
    $defs: {
      executableGate: {
        type: 'object', additionalProperties: false,
        required: ['id', 'resourceId', ...Object.keys(commandProperties), 'category'],
        properties: {
          id: { type: 'string', pattern: ID_PATTERN },
          resourceId: { type: 'string', pattern: ID_PATTERN },
          ...commandProperties,
          category: { enum: ['validation', 'test', 'pack', 'generated-artifact', 'revalidation'] },
        },
      },
      mcpGate: {
        type: 'object', additionalProperties: false,
        required: ['id', 'type', 'server', 'tool', 'args', 'cwd', 'timeoutMs', 'maxOutputBytes', 'category'],
        properties: {
          id: { type: 'string', pattern: ID_PATTERN },
          type: { const: 'mcp' },
          server: { type: 'string', pattern: ID_PATTERN },
          tool: { type: 'string', minLength: 1, maxLength: 256, pattern: '^[^\\u0000]+$' },
          args: { type: 'object' },
          cwd: { enum: ['repo-root'] },
          timeoutMs: { type: 'integer', minimum: 1, maximum: 3600000 },
          maxOutputBytes: { type: 'integer', minimum: 1, maximum: 16777216 },
          category: { enum: ['validation', 'test', 'pack', 'generated-artifact', 'revalidation'] },
        },
      },
    },
  },
  resources: {
    type: 'object', additionalProperties: false, required: ['version', 'resources'],
    properties: {
      version: { const: 1 },
      resources: {
        type: 'array', minItems: 1, maxItems: 128, items: {
          type: 'object', additionalProperties: false,
          required: ['id', 'type', ...Object.keys(commandProperties), 'capabilities', 'envAllowlist', 'readOnly'],
          properties: {
            id: { type: 'string', pattern: ID_PATTERN },
            type: { enum: ['agent', 'tool', 'notifier', 'mcp-server'] },
            role: { enum: ['executor', 'reviewer', 'diagnostician'] },
            // Optional here because tools and notifiers have no model; the OpenCode adapter requires
            // it for every agent, so an agent without one fails closed instead of running on a
            // default nobody declared.
            model: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*(?:/[A-Za-z0-9][A-Za-z0-9._-]*)+$|^[a-z][a-z0-9-]*(?:\\.[a-z0-9-]+)*(?:-[a-z0-9]+)*$' },
            ...commandProperties,
            capabilities: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string', pattern: '^[a-z][a-z0-9]*(?::[a-z0-9]+(?:-[a-z0-9]+)*)+$' } },
            envAllowlist: { type: 'array', uniqueItems: true, items: { type: 'string', pattern: '^[A-Z][A-Z0-9_]*$' } },
            readOnly: { type: 'boolean' },
            sandbox: sandboxPolicySchema,
            gateSandbox: gateSandboxPolicySchema,
          },
        },
      },
    },
  },
};

const ajv = new Ajv2020({ allErrors: true, strict: true });
const validators = Object.fromEntries(Object.entries(catalogSchemas).map(([name, schema]) => [name, ajv.compile(schema)]));

function catalogError(code, pathValue, message) {
  return { code, path: pathValue || '/', message };
}

function failure(code, pathValue, message) {
  return { ok: false, errors: [catalogError(code, pathValue, message)] };
}

function schemaErrors(errors = []) {
  return errors.map((error) => catalogError(
    `CATALOG_SCHEMA_${error.keyword.toUpperCase()}`,
    error.instancePath || '/',
    error.message || 'Catalog schema validation failed',
  ));
}

function duplicateId(items) {
  const seen = new Set();
  return items.find((item) => seen.has(item.id) || !seen.add(item.id))?.id;
}

function semanticErrors(gates, resources) {
  const errors = [];
  const duplicateGate = duplicateId(gates.gates);
  const duplicateResource = duplicateId(resources.resources);
  if (duplicateGate) errors.push(catalogError('DUPLICATE_GATE_ID', '/gates', `Duplicate gate ID: ${duplicateGate}`));
  if (duplicateResource) errors.push(catalogError('DUPLICATE_RESOURCE_ID', '/resources', `Duplicate resource ID: ${duplicateResource}`));
  if (errors.length > 0) return errors;

  const resourceById = new Map(resources.resources.map((resource) => [resource.id, resource]));
  for (const gate of gates.gates) {
    if (gate.type === 'mcp') {
      const server = resourceById.get(gate.server);
      if (!server) errors.push(catalogError('UNKNOWN_RESOURCE_ID', `/gates/${gate.id}/server`, `Unknown MCP server: ${gate.server}`));
      else if (server.type !== 'mcp-server') errors.push(catalogError('MCP_SERVER_TYPE_INVALID', `/gates/${gate.id}/server`, `Resource ${gate.server} is not an MCP server`));
      else if (server.readOnly !== true) errors.push(catalogError('MCP_SERVER_NOT_READONLY', `/resources/${server.id}`, 'MCP server must be read-only'));
      continue;
    }
    const resource = resourceById.get(gate.resourceId);
    if (!resource) errors.push(catalogError('UNKNOWN_RESOURCE_ID', `/gates/${gate.id}/resourceId`, `Unknown resource ID: ${gate.resourceId}`));
    else if (resource.executable !== gate.executable) errors.push(catalogError('EXECUTABLE_MISMATCH', `/gates/${gate.id}/executable`, 'Gate executable must match its resource'));
  }
  for (const resource of resources.resources) {
    if (resource.type === 'mcp-server') {
      if (!resource.capabilities.includes('mcp:tools')) {
        errors.push(catalogError('MCP_CAPABILITY_REQUIRED', `/resources/${resource.id}/capabilities`, 'MCP server must declare mcp:tools'));
      }
      if (resource.readOnly !== true) {
        errors.push(catalogError('MCP_SERVER_NOT_READONLY', `/resources/${resource.id}`, 'MCP server must be read-only'));
      }
      continue;
    }
    if (resource.type === 'agent' && !resource.role) {
      errors.push(catalogError('AGENT_ROLE_REQUIRED', `/resources/${resource.id}/role`, 'Agent must declare a role'));
    }
    if (resource.type === 'agent' && !resource.sandbox) {
      errors.push(catalogError('AGENT_SANDBOX_REQUIRED', `/resources/${resource.id}/sandbox`, 'Agent must declare a sandbox policy'));
    }
    if (resource.type !== 'agent' && resource.sandbox) {
      errors.push(catalogError('SANDBOX_NOT_ALLOWED', `/resources/${resource.id}/sandbox`, 'Only agents may declare a sandbox policy'));
    }
    // The gate sandbox belongs to the tools that gates run under (ADR 028); agents carry the agent
    // sandbox instead, and mixing them would let an agent inherit the broad-read gate profile.
    if (resource.type !== 'tool' && resource.gateSandbox) {
      errors.push(catalogError('GATE_SANDBOX_RESOURCE_INVALID', `/resources/${resource.id}/gateSandbox`, 'Only tools may declare a gate sandbox policy'));
    }
    if (resource.type !== 'agent' && resource.role) {
      errors.push(catalogError('ROLE_NOT_ALLOWED', `/resources/${resource.id}/role`, 'Only agents may declare a role'));
    }
    if (['reviewer', 'diagnostician'].includes(resource.role) && (!resource.readOnly || resource.capabilities.includes('filesystem:write'))) {
      errors.push(catalogError('READ_ONLY_ROLE_REQUIRED', `/resources/${resource.id}`, `${resource.role} must be read-only`));
    }
    if (resource.type === 'agent') {
      const domains = resource.sandbox?.networkDomains || [];
      const executorOnly = new Set(['api.github.com', 'github.com', 'objects.githubusercontent.com', 'raw.githubusercontent.com', 'registry.npmjs.org']);
      if (resource.role !== 'executor' && domains.some((domain) => executorOnly.has(domain))) {
        errors.push(catalogError('READ_ONLY_NETWORK_TOO_BROAD', `/resources/${resource.id}/sandbox/networkDomains`, `${resource.role} may only access provider endpoints`));
      }
    }
    if (resource.type === 'notifier' && !resource.capabilities.includes('notification:send')) {
      errors.push(catalogError('NOTIFIER_CAPABILITY_REQUIRED', `/resources/${resource.id}/capabilities`, 'Notifier must declare notification:send'));
    }
  }
  return errors;
}

function validateCatalogSources(sources, origin) {
  const parsed = {};
  for (const name of Object.keys(CATALOG_PATHS)) {
    const result = parseYaml(sources[name]);
    if (!result.ok) return { ok: false, errors: result.errors.map((error) => ({ ...error, path: `/${name}${error.path}` })) };
    if (!validators[name](result.value)) return { ok: false, errors: schemaErrors(validators[name].errors) };
    parsed[name] = result.value;
  }
  const errors = semanticErrors(parsed.gates, parsed.resources);
  if (errors.length > 0) return { ok: false, errors };

  const hashes = Object.fromEntries(Object.entries(sources).map(([name, source]) => [name, crypto.createHash('sha256').update(source).digest('hex')]));
  hashes.combined = crypto.createHash('sha256').update(`${hashes.gates}:${hashes.resources}`).digest('hex');
  return { ok: true, value: { ...parsed, hashes, origin }, errors: [] };
}

function readCatalogFile(repoRoot, relativePath) {
  const absolutePath = path.join(fs.realpathSync(repoRoot), relativePath);
  const stat = fs.lstatSync(absolutePath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Catalog must be a regular file, not a symlink');
  if (stat.size > 1024 * 1024) throw new Error('Catalog exceeds 1048576 bytes');
  return fs.readFileSync(absolutePath, 'utf8');
}

function loadCatalogsFromFilesystem(repoRoot) {
  try {
    const sources = Object.fromEntries(Object.entries(CATALOG_PATHS).map(([name, relativePath]) => [name, readCatalogFile(repoRoot, relativePath)]));
    return validateCatalogSources(sources, { type: 'filesystem', repoRoot: fs.realpathSync(repoRoot) });
  } catch (error) {
    return failure('CATALOG_READ_ERROR', '/', error.message);
  }
}

async function loadCatalogsFromGit(repoRoot, baseSha) {
  if (typeof baseSha !== 'string' || !/^[0-9a-f]{40,64}$/i.test(baseSha)) return failure('INVALID_BASE_SHA', '/baseSha', 'Base SHA must be a full hexadecimal object ID');
  const entries = await Promise.all(Object.entries(CATALOG_PATHS).map(async ([name, relativePath]) => {
    const result = await runProcess({
      executable: 'git', args: ['show', `${baseSha}:${relativePath}`], root: repoRoot, cwd: '.',
      envAllowlist: ['HOME', 'PATH', 'TMPDIR'], timeoutMs: 30000, maxOutputBytes: 1024 * 1024,
    });
    return [name, result];
  }));
  const failed = entries.find(([, result]) => !result.ok);
  if (failed) return failure('GIT_CATALOG_READ_ERROR', `/${failed[0]}`, `Unable to read ${CATALOG_PATHS[failed[0]]} from approved base`);
  return validateCatalogSources(Object.fromEntries(entries.map(([name, result]) => [name, result.stdout.text])), { type: 'git', baseSha: baseSha.toLowerCase() });
}

function resolveById(catalogResult, kind, id) {
  if (!catalogResult?.ok) return failure('INVALID_CATALOG', '/', 'Catalog must be valid before resolving IDs');
  const collection = kind === 'gate' ? catalogResult.value.gates.gates : catalogResult.value.resources.resources;
  const value = collection.find((entry) => entry.id === id);
  return value ? { ok: true, value, errors: [] } : failure(`UNKNOWN_${kind.toUpperCase()}_ID`, `/${kind}Id`, `Unknown ${kind} ID: ${id}`);
}

module.exports = {
  CATALOG_PATHS,
  loadCatalogsFromFilesystem,
  loadCatalogsFromGit,
  resolveGate: (catalog, id) => resolveById(catalog, 'gate', id),
  resolveResource: (catalog, id) => resolveById(catalog, 'resource', id),
  validateCatalogSources,
};
