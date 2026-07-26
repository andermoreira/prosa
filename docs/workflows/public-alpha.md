# Public alpha guide

## Purpose

This guide is the shortest reproducible path for evaluating Prosa without access to its source
configuration pack, an agent subscription, credentials or paid infrastructure.

## Prerequisites

- Node.js 22.5 or newer;
- npm 10 or newer;
- Git for cloning the repository.

macOS is required only for the current coercive sandbox capability tests. The deterministic demo
and hermetic suite run without an agent binary.

## Install and verify

```bash
git clone https://github.com/andersonmalves/prosa.git
cd prosa
npm ci --ignore-scripts
npm run verify
npm audit --audit-level=high
```

`npm run verify` checks the installed dependency resolution, validates active specifications and
runs the hermetic workflow suite. Capability tests are intentionally separate:

```bash
npm run test:capabilities
```

They may require macOS sandbox support or a real MCP server. Unsupported prerequisites must appear
as a documented skip or stable fail-closed error, never as a hidden success.

## Run the public demo

```bash
node scripts/workflow/demo-public-alpha.cjs
```

Expected stage order:

```text
validation → confined-execution → gate → review → human-decision → report
```

The final JSON has `outcome: "approved"` and `externalCalls: 0`. The test repeats the run,
compares both reports and executes the script with an empty `PATH`:

```bash
node --test scripts/workflow/test-demo-public-alpha.cjs
```

## Trust boundary

The demo reads two fictitious contracts under `examples/public-alpha/`, validates them with the
real schema implementation and emits a report to standard output. It does not:

- spawn OpenCode, Cursor or another agent;
- read credentials or the caller's home directory;
- mutate Git state, create a worktree, commit or push;
- access a network or external service;
- claim to exercise the production OS sandbox.

Production workflow runs have a wider boundary: they use isolated attempts, persisted evidence,
closed review snapshots and explicit authorization for commit or pull-request effects. See
[`automated-spec-pipeline-runbook.md`](automated-spec-pipeline-runbook.md).

## Capability status

| Capability | Alpha status | Limit |
|---|---|---|
| Contracts, DAG, state, budgets and risk/HITL | Implemented | APIs may still change. |
| Worktree isolation, locking and sanitized artifacts | Implemented | Requires a compatible local Git repository. |
| OpenCode and Cursor adapters | Experimental | External binaries and supported versions are required. |
| Coercive agent sandbox | Experimental on macOS | Linux and Windows are not supported in this alpha. |
| MCP integration | Experimental | Real-server checks are outside the hermetic suite. |
| Dependency vetting | Planned | Specification only; no runtime enforcement yet. |
| Spec-code drift | Planned | Specification only; no runtime enforcement yet. |

## Cleanup

The deterministic demo writes no repository artifact. Production runs own their runtime directory
and must use the documented resume or cleanup path; do not delete an active worktree manually.
