---
schemaVersion: 1.0.0
id: spec-mcp-gates-step-1
sequence: 1
specId: spec-mcp-gates
source:
  path: specs/steps/mcp-gates-step-1.md
  hash: 61df4f72ee3b4b4c0f388e080d25bec7eed349979bef5ad1ab6c06a5bbd9fd4b
  baseSha: 63d73372a5230284d7bfad0e05c11f3585bf5feb
goal: "Estender os schemas de catálogo em catalogs.cjs para aceitar type: mcp em gates e type: mcp-server em resources, validando os novos campos obrigatórios."
boundaries:
  inScope:
    - behaviorType=vertical
    - owns=catalogs.cjs (schema de validação Ajv para gates e resources)
    - invariant=schemas existentes (executable gates, agent resources) seguem inalterados
    - allowedDependencies=nenhum step anterior
  outOfScope:
    - doesNotOwn=mcp.cjs, gates.yaml, resources.yaml, testes
  maxLogicalFiles: 5
dependsOn: []
predictedFiles:
  - scripts/workflow/lib/catalogs.cjs
allowedAreas:
  - scripts/workflow
resources:
  executor: opencode
  reviewer: opencode-reviewer
  diagnostician: opencode-diagnostician
  notifications: []
context:
  specPath: specs/mcp-gates.md
  stepPath: specs/steps/mcp-gates-step-1.md
  baseSha: 63d73372a5230284d7bfad0e05c11f3585bf5feb
  implementationNoteIds: []
acceptanceCriteria:
  - id: AC-01
    evidence:
      - id: EVIDENCE-01
        kind: automated-test
        description: Validação Ajv rejeita gate MCP sem server/tool/args e aceita gate MCP completo.
        gateId: workflow-tests
        resultRef: spec-mcp-gates-step-1/attempt-1/gate-workflow-tests
        testSelector: scripts/workflow/test-catalogs.cjs
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
    - workflow-tests
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
  justification: Schemas são auto-documentados via Ajv; documentação durável será atualizada no Step 6.
testing:
  required: true
  gateIds:
    - workflow-tests
  rationale: Validação de schema exige fixtures YAML inline.
execution:
  adapter: opencode
  isolation: git-worktree
  writable: true
  autoCommit: false
  allowPullRequest: false
  correctionStep: false
---
# Step 1 — Estender schemas de catálogo para MCP

## Goal

Adicionar validação Ajv nos schemas de `workflow/gates.yaml` e `workflow/resources.yaml` para suportar os novos tipos `mcp` (gate) e `mcp-server` (resource), com campos obrigatórios validados.

## O que fazer

Em `scripts/workflow/lib/catalogs.cjs`:

1. No schema de gates (objeto `gates.items`), adicionar suporte a `type: "mcp"` via `oneOf`:
   - **Ramo `mcp`**: campos obrigatórios `id, type, server, tool, args, cwd, timeoutMs, maxOutputBytes, category`
   - `server`: string, pattern de resource ID
   - `tool`: string não-vazia
   - `args`: objeto JSON (não array)
   - **Ramo executável** (existente): mantido inalterado com `required: [..., 'executable', 'args']`

2. No schema de resources (objeto `resources.items`), adicionar `type: "mcp-server"` ao `oneOf`:
   - Campos obrigatórios: `id, type, executable, args, capabilities, envAllowlist, cwd, timeoutMs, maxOutputBytes, readOnly`
   - `capabilities`: deve conter `"mcp:tools"`
   - `readOnly`: deve ser `true` (const)

3. Garantir que `additionalProperties: false` está presente em todos os ramos.

## Done criteria

- Gate com `type: mcp` e campos obrigatórios → validado com sucesso
- Gate com `type: mcp` faltando `server` → rejeitado com `CATALOG_SCHEMA_REQUIRED`
- Resource com `type: mcp-server` → validado com sucesso
- Resource com `type: mcp-server` e `readOnly: false` → rejeitado
- Gates executáveis existentes seguem passando na validação

## Handoff

```text
Step 1: Estender catalogs.cjs para validar gates MCP e resources mcp-server.

Arquivo: scripts/workflow/lib/catalogs.cjs
- Adicionar ramo `type: mcp` no oneOf do schema de gates (server, tool, args como objeto)
- Adicionar ramo `type: mcp-server` no oneOf do schema de resources (readOnly: true obrigatório)
- Manter ramos existentes inalterados
```
