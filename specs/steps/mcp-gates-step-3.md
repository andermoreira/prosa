---
schemaVersion: 1.0.0
id: spec-mcp-gates-step-3
sequence: 3
specId: spec-mcp-gates
source:
  path: specs/steps/mcp-gates-step-3.md
  hash: a2a9ea451d374e23f94a437bb12f7cf11acc319b3dedddd3a4a74a00e1d2e15c
  baseSha: 63d73372a5230284d7bfad0e05c11f3585bf5feb
goal: Integrar mcp.cjs no runGate do local-adapter.cjs — roteamento por gate.type, mesmo contrato de sandbox e artifact dos gates executáveis.
boundaries:
  inScope:
    - behaviorType=vertical
    - owns=local-adapter.cjs (runGate), mcp.cjs (runMcpGate)
    - invariant=gate.type ausente ou 'executable' segue o caminho atual; 'mcp' roteia para mcp.cjs
    - allowedDependencies=spec-mcp-gates-step-2
  outOfScope:
    - doesNotOwn=gates.yaml, resources.yaml, testes
  maxLogicalFiles: 5
dependsOn:
  - spec-mcp-gates-step-2
predictedFiles:
  - scripts/workflow/lib/local-adapter.cjs
allowedAreas:
  - scripts/workflow
resources:
  executor: opencode
  reviewer: opencode-reviewer
  diagnostician: opencode-diagnostician
  notifications: []
context:
  specPath: specs/mcp-gates.md
  stepPath: specs/steps/mcp-gates-step-3.md
  baseSha: 63d73372a5230284d7bfad0e05c11f3585bf5feb
  implementationNoteIds: []
acceptanceCriteria:
  - id: AC-03
    evidence:
      - id: EVIDENCE-03
        kind: automated-test
        description: runGate roteia gate MCP para mcp.cjs, respeita budget e isola sandbox.
        gateId: workflow-tests
        resultRef: spec-mcp-gates-step-3/attempt-1/gate-workflow-tests
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
  justification: Integração é interna; documentação durável será atualizada no Step 6.
testing:
  required: true
  gateIds:
    - workflow-tests
  rationale: Roteamento gate.type exige fixture com gate MCP real.
execution:
  adapter: opencode
  isolation: git-worktree
  writable: true
  autoCommit: false
  allowPullRequest: false
  correctionStep: false
---
# Step 3 — Integrar mcp.cjs no runGate

## Goal

Modificar `runGate` em `local-adapter.cjs` para rotear gates do tipo `mcp` para o adapter `mcp.cjs`, preservando o contrato de sandbox, artifact, budget e revalidation dos gates executáveis.

## O que fazer

Em `scripts/workflow/lib/local-adapter.cjs`:

1. Adicionar `mcp: ['runMcpGate']` à whitelist de módulos (`MODULE_WHITELIST`).

2. No `runGate`, após resolver o gate via `resolveGate`:
   - Se `gate.type === 'mcp'`: resolver o `server` via `resolveResource(gate.server)`, chamar `modules.mcp.runMcpGate({ server, tool: gate.tool, args: gate.args, worktree: binding.path, timeoutMs: gate.timeoutMs, maxOutputBytes: gate.maxOutputBytes })`
   - Se `gate.type` ausente ou `'executable'`: seguir o caminho atual

3. Criar o artifact do gate MCP com o mesmo formato de provenance dos gates executáveis:
   - `kind: gate-<id>`, `mediaType: application/json`
   - `content: { id, server, tool, args, process, passed, content }`
   - `provenance: { runId, stepId, gateId, ... }`

4. MCP gate também usa `createGateEnvironment` se necessário (sandbox de HOME/TMPDIR).

## Done criteria

- Gate com `type: mcp` → roteado para `runMcpGate` → resultado coletado como artifact
- Gate sem `type` (executável) → roteado para caminho atual → sem regressão
- Gate MCP com servidor não catalogado → erro `MCP_RESOURCE_INVALID`
- Artifact do gate MCP tem mesma estrutura de provenance do gate executável

## Handoff

```text
Step 3: Integrar mcp.cjs no runGate de local-adapter.cjs.

- Adicionar 'mcp' ao MODULE_WHITELIST
- Em runGate: if gate.type === 'mcp' → modules.mcp.runMcpGate(...)
- Artifact com mesmo contrato de provenance dos gates executáveis
- Caminho executável existente inalterado
```
