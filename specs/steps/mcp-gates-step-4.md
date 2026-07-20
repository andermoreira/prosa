---
schemaVersion: 1.0.0
id: spec-mcp-gates-step-4
sequence: 4
specId: spec-mcp-gates
source:
  path: specs/steps/mcp-gates-step-4.md
  hash: 68bb9ce9642cf92057657b267452b3beeda02a88da359d8120c2899ddf63d6fc
  baseSha: 63d73372a5230284d7bfad0e05c11f3585bf5feb
goal: Adicionar 3 servidores MCP ao resources.yaml e 3 gates MCP ao gates.yaml — context7, websearch, gh-grep — com tools, args padrão e budget.
boundaries:
  inScope:
    - behaviorType=vertical
    - owns=workflow/resources.yaml, workflow/gates.yaml
    - "invariant=cada MCP tem tool, args, timeoutMs e category; resources têm readOnly: true"
    - allowedDependencies=spec-mcp-gates-step-3
  outOfScope:
    - doesNotOwn=mcp.cjs, local-adapter.cjs, testes, documentação
  maxLogicalFiles: 5
dependsOn:
  - spec-mcp-gates-step-3
predictedFiles:
  - workflow/resources.yaml
  - workflow/gates.yaml
allowedAreas:
  - workflow
resources:
  executor: opencode
  reviewer: opencode-reviewer
  diagnostician: opencode-diagnostician
  notifications: []
context:
  specPath: specs/mcp-gates.md
  stepPath: specs/steps/mcp-gates-step-4.md
  baseSha: 63d73372a5230284d7bfad0e05c11f3585bf5feb
  implementationNoteIds: []
acceptanceCriteria:
  - id: AC-05
    evidence:
      - id: EVIDENCE-04
        kind: static-check
        description: Catálogos validam com os 3 MCPs — specs-lint passa.
        gateId: specs-lint
        resultRef: spec-mcp-gates-step-4/attempt-1/gate-specs-lint
        testSelector: scripts/lint-specs.cjs
budgets:
  maxAttempts: 3
  maxAgentCalls: 6
  maxReviewCycles: 2
  maxDiagnosisCycles: 2
  maxElapsedMinutes: 120
  maxEstimatedCost: null
  maxTokens: null
verification:
  gateIds:
    - specs-lint
    - revalidation
revalidation:
  triggers:
    - after-lock
    - before-worktree
    - before-agent-call
    - after-agent-call
    - after-diff
    - after-gate
    - before-review
    - after-review
    - before-acceptance
    - on-resume
  driftPolicy: block
documentationImpact:
  kind: none
  justification: Catálogos são auto-documentados; documentação durável será atualizada no Step 6.
testing:
  required: true
  gateIds:
    - specs-lint
  rationale: Novos tipos no catálogo exigem validação de schema.
execution:
  adapter: opencode
  isolation: git-worktree
  writable: true
  autoCommit: false
  allowPullRequest: false
  correctionStep: false
---
# Step 4 — Catalogar 3 MCPs em gates.yaml e resources.yaml

## Goal

Adicionar 3 servidores MCP ao catálogo de resources e 3 gates MCP ao catálogo de gates, com tools e args padrão, prontos para uso em steps.

## O que fazer

### `workflow/resources.yaml` — adicionar após `notifier-terminal`:

```yaml
- id: context7
  type: mcp-server
  executable: npx
  args: [-y, @upstash/context7-mcp]
  capabilities: [mcp:tools]
  envAllowlist: [HOME, PATH, TMPDIR]
  cwd: repo-root
  timeoutMs: 30000
  maxOutputBytes: 262144
  readOnly: true
- id: websearch
  type: mcp-server
  executable: npx
  args: [-y, @anthropic/mcp-server-brave-search]
  capabilities: [mcp:tools]
  envAllowlist: [BRAVE_API_KEY, HOME, PATH, TMPDIR]
  cwd: repo-root
  timeoutMs: 30000
  maxOutputBytes: 262144
  readOnly: true
- id: gh-grep
  type: mcp-server
  executable: npx
  args: [-y, @anthropic/mcp-server-github]
  capabilities: [mcp:tools]
  envAllowlist: [GITHUB_TOKEN, HOME, PATH, TMPDIR]
  cwd: repo-root
  timeoutMs: 30000
  maxOutputBytes: 262144
  readOnly: true
```

### `workflow/gates.yaml` — adicionar ao final:

```yaml
- id: context7-check
  type: mcp
  server: context7
  tool: resolve-library-id
  args:
    libraryName: ""
  cwd: repo-root
  timeoutMs: 30000
  maxOutputBytes: 262144
  category: validation
- id: websearch-verify
  type: mcp
  server: websearch
  tool: search
  args:
    query: ""
  cwd: repo-root
  timeoutMs: 30000
  maxOutputBytes: 262144
  category: validation
- id: gh-grep-audit
  type: mcp
  server: gh-grep
  tool: search_code
  args:
    query: ""
  cwd: repo-root
  timeoutMs: 30000
  maxOutputBytes: 262144
  category: validation
```

## Done criteria

- `specs-lint` passa com os novos MCPs no catálogo
- `context7` resource tem `type: mcp-server`, `readOnly: true`
- `context7-check` gate tem `type: mcp`, `server: context7`, `tool: resolve-library-id`
- Args são objetos JSON válidos (não arrays de strings)

## Handoff

```text
Step 4: Adicionar 3 MCPs a resources.yaml (context7, websearch, gh-grep) e 3 gates MCP a
gates.yaml (context7-check, websearch-verify, gh-grep-audit). Formato type: mcp/mcp-server
conforme schema do Step 1.
```
