# Prosa

[![Prosa social preview](assets/social-preview.png)](examples/public-alpha/README.md)

Prosa is an alpha orchestration engine that turns approved specifications into bounded,
reviewable agent workflows. It combines contract validation, isolated Git worktrees, risk policy,
human checkpoints and evidence-backed acceptance without granting the agent authority to publish.

> **Alpha:** the repository is ready for evaluation and experimentation, not production use.
> Distribution is source-only; the npm package remains private.

## Try the deterministic demo

Prerequisites: Node.js 22 and npm.

```bash
git clone https://github.com/andersonmalves/prosa.git
cd prosa
npm ci --ignore-scripts
npm run verify
node scripts/workflow/demo-public-alpha.cjs
```

The demo takes less than a minute and makes no agent, credential, paid-service or network call. It
validates real Prosa contracts and walks through confined execution, a gate, read-only review,
explicit human decision and a sanitized report. See the
[public alpha guide](docs/workflows/public-alpha.md) for the trust boundary and expected output.

## What is implemented

- versioned spec and atomic-step contracts with semantic validation;
- explicit DAG, state machine, budgets, retries and crash-safe resume;
- per-attempt Git worktrees and repository-level locking;
- risk classification and binding-specific human approval checkpoints;
- read-only review snapshots, structured findings and evidence-backed acceptance;
- sanitized, hashed artifacts and final reports;
- opt-in commit and pull-request operations, independent from execution authority;
- macOS OS-level sandbox policies for supported agent and gate paths.

## Experimental and planned

The OpenCode, Cursor, MCP and macOS sandbox integrations are experimental and fail closed when a
required capability is unavailable. Linux and Windows do not yet have a supported coercive agent
sandbox. Dependency vetting and spec-code drift currently exist as approved design specifications,
not shipped runtime behavior.

## Repository map

```text
scripts/workflow/   orchestrator, adapters, sandbox and tests
schemas/            JSON Schema contracts
workflow/           gate, resource and risk-policy catalogs
specs/              active specifications and atomic steps
adr/                accepted architectural decisions
docs/workflows/     operating guides
docs/audits/        dated verification records
commands/           source command definitions; not a packaged CLI
```

The ADR numbers preserve references from the private configuration pack where Prosa originated;
that repository is not required to install, test or evaluate this project.

## Security and support

Only the current `main` branch is supported during the alpha. Read
[SECURITY.md](SECURITY.md) before reporting a vulnerability. General feature requests and
contribution support are not promised in this first public cycle.

Licensed under the [MIT License](LICENSE). Third-party attribution is recorded in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
