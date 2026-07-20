---
schemaVersion: 1.0.0
id: spec-mcp-gates-step-5
sequence: 5
specId: spec-mcp-gates
source:
  path: specs/steps/mcp-gates-step-5.md
  hash: fc3dc4475f80e860ae2ba28bfcb7faff700c9a4bfe15c5cd21a46ef3bf6ee90d
  baseSha: 63d73372a5230284d7bfad0e05c11f3585bf5feb
goal: Criar testes para o adapter MCP (test-mcp.cjs) cobrindo handshake JSON-RPC, tools/list, tools/call, erros e edge cases com servidor real.
boundaries:
  inScope:
    - behaviorType=vertical
    - owns=scripts/workflow/test-mcp.cjs
    - invariant=testes usam servidor MCP real (stdio) via npx; sem servidor não catalogado mockado
    - allowedDependencies=spec-mcp-gates-step-4
  outOfScope:
    - doesNotOwn=mcp.cjs, local-adapter.cjs, catálogos
  maxLogicalFiles: 5
dependsOn:
  - spec-mcp-gates-step-4
predictedFiles:
  - scripts/workflow/test-mcp.cjs
allowedAreas:
  - scripts/workflow
resources:
  executor: opencode
  reviewer: opencode-reviewer
  diagnostician: opencode-diagnostician
  notifications: []
context:
  specPath: specs/mcp-gates.md
  stepPath: specs/steps/mcp-gates-step-5.md
  baseSha: 63d73372a5230284d7bfad0e05c11f3585bf5feb
  implementationNoteIds: []
acceptanceCriteria:
  - id: AC-06
    evidence:
      - id: EVIDENCE-05
        kind: automated-test
        description: test-mcp.cjs cobre handshake, tools/list, tools/call, erros e edge cases com servidor real.
        gateId: workflow-tests
        resultRef: spec-mcp-gates-step-5/attempt-1/gate-workflow-tests
        testSelector: scripts/workflow/test-mcp.cjs
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
  justification: Testes são auto-documentados; documentação durável será atualizada no Step 6.
testing:
  required: true
  gateIds:
    - workflow-tests
  rationale: MCP via stdio exige servidor real para validação de handshake e tools/list.
execution:
  adapter: opencode
  isolation: git-worktree
  writable: true
  autoCommit: false
  allowPullRequest: false
  correctionStep: false
---
# Step 5 — Criar testes do adapter MCP

## Goal

Criar `scripts/workflow/test-mcp.cjs` com cobertura completa do adapter MCP: handshake JSON-RPC bem-sucedido, tools/list, tools/call, erros e edge cases.

## O que fazer

Criar `test-mcp.cjs` com:

1. **Handshake bem-sucedido**: spawna servidor MCP real via npx, faz `initialize` → resposta válida.

2. **tools/list**: servidor expõe tools conhecidas; valida que os nomes esperados aparecem.

3. **tools/call**: invoca uma tool com args válidos → resposta estruturada com conteúdo.

4. **Tool não encontrada**: invoca tool que não existe no `tools/list` → `MCP_TOOL_NOT_FOUND`.

5. **Resource inválido**: `resource.type !== 'mcp-server'` → `MCP_RESOURCE_INVALID`.

6. **Read-only violado**: `resource.readOnly === false` → `MCP_RESOURCE_NOT_READONLY`.

7. **Args inseguros**: args com null byte → `MCP_ARGS_INVALID`.

8. **Timeout**: servidor com `timeoutMs: 1` → `MCP_TIMEOUT`.

9. **Servidor indisponível**: executável inexistente → `MCP_SERVER_UNAVAILABLE`.

10. **Resposta não-JSON**: stdout com texto puro → `MCP_RESPONSE_INVALID`.

11. **runGate com gate MCP**: teste de integração via `local-adapter.cjs` — gate MCP no catálogo → runGate → artifact coletado.

## Done criteria

- `node --test scripts/workflow/test-mcp.cjs` passa
- Servidor MCP real usado nos testes (npx -y @upstash/context7-mcp ou similar)
- Todos os cenários de erro cobertos
- Teste de integração com runGate cobre o caminho completo

## Handoff

```text
Step 5: Criar scripts/workflow/test-mcp.cjs.

11 cenários de teste: handshake, tools/list, tools/call, tool não encontrada, resource
inválido, readOnly violado, args inseguros, timeout, servidor indisponível, resposta
inválida, integração runGate. Servidor MCP real via stdio.
```
