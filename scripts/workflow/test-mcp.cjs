'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { runMcpGate } = require('./lib/mcp.cjs');

const CONTEXT7_SERVER = {
  id: 'context7',
  type: 'mcp-server',
  executable: 'npx',
  args: ['-y', '@upstash/context7-mcp'],
  capabilities: ['mcp:tools'],
  envAllowlist: ['HOME', 'PATH', 'TMPDIR'],
  readOnly: true,
  timeoutMs: 30000,
  maxOutputBytes: 262144,
};

const NOT_READONLY_SERVER = { ...CONTEXT7_SERVER, readOnly: false };
const NOT_MCP_SERVER = { ...CONTEXT7_SERVER, type: 'agent' };

test('handshake and tools/list with real MCP server', async () => {
  const result = await runMcpGate({
    server: CONTEXT7_SERVER,
    tool: 'resolve-library-id',
    args: { libraryName: 'react' },
  });
  assert.equal(result.ok, true);
  assert.equal(result.passed, true);
  assert.equal(result.server, 'context7');
  assert.equal(result.tool, 'resolve-library-id');
  assert.ok(result.content);
  assert.equal(result.process.exitCode, 0);
});

test('tools/call returns structured content for valid library', async () => {
  const result = await runMcpGate({
    server: CONTEXT7_SERVER,
    tool: 'resolve-library-id',
    args: { libraryName: 'react-router' },
  });
  assert.equal(result.ok, true);
  assert.ok(result.content);
  assert.equal(typeof result.process.durationMs, 'number');
  assert.ok(result.process.durationMs > 0);
});

test('rejects non-mcp-server resource type', async () => {
  await assert.rejects(
    () => runMcpGate({ server: NOT_MCP_SERVER, tool: 'any', args: {} }),
    { code: 'MCP_RESOURCE_INVALID' },
  );
});

test('rejects non-readonly MCP server', async () => {
  await assert.rejects(
    () => runMcpGate({ server: NOT_READONLY_SERVER, tool: 'any', args: {} }),
    { code: 'MCP_RESOURCE_NOT_READONLY' },
  );
});

test('rejects tool not found in server capabilities', async () => {
  await assert.rejects(
    () => runMcpGate({
      server: CONTEXT7_SERVER,
      tool: 'non-existent-tool-xyz',
      args: {},
    }),
    { code: 'MCP_TOOL_NOT_FOUND' },
  );
});

test('rejects empty tool name', async () => {
  await assert.rejects(
    () => runMcpGate({ server: CONTEXT7_SERVER, tool: '', args: {} }),
    { code: 'MCP_TOOL_INVALID' },
  );
  await assert.rejects(
    () => runMcpGate({ server: CONTEXT7_SERVER, tool: '  ', args: {} }),
    { code: 'MCP_TOOL_INVALID' },
  );
});

test('rejects args with NUL bytes', async () => {
  await assert.rejects(
    () => runMcpGate({ server: CONTEXT7_SERVER, tool: 'any', args: { bad: 'x\0y' } }),
    { code: 'MCP_ARGS_INVALID' },
  );
});

test('rejects non-object args', async () => {
  await assert.rejects(
    () => runMcpGate({ server: CONTEXT7_SERVER, tool: 'any', args: 'string' }),
    { code: 'MCP_ARGS_INVALID' },
  );
  await assert.rejects(
    () => runMcpGate({ server: CONTEXT7_SERVER, tool: 'any', args: ['array'] }),
    { code: 'MCP_ARGS_INVALID' },
  );
});

test('fails with unavailable server', async () => {
  await assert.rejects(
    () => runMcpGate({
      server: { ...CONTEXT7_SERVER, executable: 'non-existent-binary-xyz' },
      tool: 'any',
      args: {},
    }),
    { code: 'MCP_SERVER_UNAVAILABLE' },
  );
});
