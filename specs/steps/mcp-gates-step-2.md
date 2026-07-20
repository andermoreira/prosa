---
schemaVersion: 1.0.0
id: spec-mcp-gates-step-2
sequence: 2
specId: spec-mcp-gates
source:
  path: specs/steps/mcp-gates-step-2.md
  hash: 98b613b36e94c467b7fdce2b456d508418972194f011969d7c0de4c04efcccce
  baseSha: 63d73372a5230284d7bfad0e05c11f3585bf5feb
goal: Criar scripts/workflow/lib/mcp.cjs — adapter que spawna servidor MCP via stdio, faz handshake JSON-RPC 2.0, descobre tools e invoca uma tool específica com args validados.
boundaries:
  inScope:
    - behaviorType=vertical
    - owns=mcp.cjs (spawn, JSON-RPC, tools/list, tools/call, parse de resposta)
    - invariant=readOnly obrigatório; servidor não catalogado rejeitado; args inseguros rejeitados
    - allowedDependencies=spec-mcp-gates-step-1
  outOfScope:
    - doesNotOwn=integração com runGate, gates.yaml, resources.yaml, testes
  maxLogicalFiles: 5
dependsOn:
  - spec-mcp-gates-step-1
predictedFiles:
  - scripts/workflow/lib/mcp.cjs
allowedAreas:
  - scripts/workflow
resources:
  executor: opencode
  reviewer: opencode-reviewer
  diagnostician: opencode-diagnostician
  notifications: []
context:
  specPath: specs/mcp-gates.md
  stepPath: specs/steps/mcp-gates-step-2.md
  baseSha: 63d73372a5230284d7bfad0e05c11f3585bf5feb
  implementationNoteIds: []
acceptanceCriteria:
  - id: AC-02
    evidence:
      - id: EVIDENCE-02
        kind: automated-test
        description: mcp.cjs faz handshake JSON-RPC, tools/list e tools/call com servidor real via stdio.
        gateId: workflow-tests
        resultRef: spec-mcp-gates-step-2/attempt-1/gate-workflow-tests
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
  justification: Adapter é auto-documentado; documentação durável será atualizada no Step 6.
testing:
  required: true
  gateIds:
    - workflow-tests
  rationale: Handshake JSON-RPC e tools/list exigem servidor MCP real (npx -y).
execution:
  adapter: opencode
  isolation: git-worktree
  writable: true
  autoCommit: false
  allowPullRequest: false
  correctionStep: false
---
# Step 2 — Criar adapter MCP (mcp.cjs)

## Goal

Criar `scripts/workflow/lib/mcp.cjs` — adapter que spawna um servidor MCP como subprocesso stdio, executa o handshake JSON-RPC 2.0, descobre tools via `tools/list` e invoca uma tool específica via `tools/call`.

## O que fazer

Criar `mcp.cjs` com:

1. **`runMcpGate(input)`** — função principal:
   - Recebe `{ server: resource, tool: string, args: object, worktree: string, timeoutMs, maxOutputBytes }`
   - Spawna `resource.executable resource.args` via `runProcess` com cwd no worktree
   - Envia JSON-RPC `initialize` → aguarda resposta
   - Envia `tools/list` → aguarda resposta → valida que `tool` existe
   - Envia `tools/call` com `{ name: tool, arguments: args }` → aguarda resposta
   - Retorna `{ ok, passed, resultRef, content }`

2. **Protocolo JSON-RPC 2.0**:
   - Cada request tem `{ jsonrpc: "2.0", id, method, params }`
   - Respostas são parseadas como JSON lines (NDJSON via stdout)
   - Erros de parse → `MCP_RESPONSE_INVALID`

3. **Validações**:
   - `resource.type !== 'mcp-server'` → `MCP_RESOURCE_INVALID`
   - `resource.readOnly !== true` → `MCP_RESOURCE_NOT_READONLY`
   - Tool não encontrada em `tools/list` → `MCP_TOOL_NOT_FOUND`
   - Args com null bytes ou controle → `MCP_ARGS_INVALID`
   - Timeout → `MCP_TIMEOUT`
   - Processo crash → `MCP_SERVER_UNAVAILABLE`

4. **Sanitização**: conteúdo da resposta é sanitizado via `sanitize.cjs` antes de retornar.

## Done criteria

- Servidor MCP real (ex: `npx -y @anthropic/mcp-server-brave-search`) → `tools/list` retorna tools conhecidas
- `tools/call` com tool e args válidos → resposta estruturada coletada
- Servidor não catalogado → `MCP_RESOURCE_INVALID`
- Tool não existe → `MCP_TOOL_NOT_FOUND`
- Resposta não-JSON → `MCP_RESPONSE_INVALID`
- Timeout → `MCP_TIMEOUT`

## Handoff

```text
Step 2: Criar scripts/workflow/lib/mcp.cjs.

Função principal: runMcpGate(input) — spawna servidor MCP via stdio, faz initialize →
tools/list → tools/call, retorna resultado estruturado. Protocolo JSON-RPC 2.0. Validações:
readOnly obrigatório, tool existe, args seguros. Sanitização de resposta.
```
