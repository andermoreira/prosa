---
schemaVersion: 1.0.0
id: spec-gate-sandboxing-step-2
sequence: 2
specId: spec-gate-sandboxing
source: {path: specs/steps/gate-sandboxing-step-2.md, hash: ff9615136f5edbb059b40adcfe337f6e955a9078da20f2ee3d5665c618b663b1, baseSha: 73d0bbd224043b4f4ff8b33f58d4bf3525b0906c}
goal: Rotear os gates executáveis não-MCP pela porta sandboxada e provar a contenção por teste adversarial real.
boundaries:
  inScope:
    - behaviorType=vertical
    - owns=roteamento de runGate pela porta de gate, prova adversarial macOS e documentação durável
    - invariant=nenhum gate de worktree roda por runProcess direto e gates MCP mantêm seu caminho
    - allowedDependencies=spec-gate-sandboxing-step-1
  outOfScope:
    - doesNotOwn=normalização da policy de gate, validação de catálogo e resources.yaml (Step 1)
  maxLogicalFiles: 5
dependsOn: [spec-gate-sandboxing-step-1]
predictedFiles: [scripts/workflow/lib/local-adapter.cjs, scripts/workflow/test-adapter.cjs, scripts/workflow/test-sandbox-runtime-macos.cjs, docs/workflows/automated-spec-pipeline.md]
allowedAreas: [scripts/workflow, docs/workflows]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/gate-sandboxing.md, stepPath: specs/steps/gate-sandboxing-step-2.md, baseSha: 73d0bbd224043b4f4ff8b33f58d4bf3525b0906c, implementationNoteIds: [NOTE-01, NOTE-02]}
acceptanceCriteria:
  - id: AC-03
    evidence:
      - {id: EVIDENCE-03, kind: automated-test, description: "Gate workflow-tests comprova que gates executáveis não-MCP roteiam pela porta sandboxada, sem runProcess direto.", gateId: workflow-tests, resultRef: spec-gate-sandboxing-step-2/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-adapter.cjs}
  - id: AC-04
    evidence:
      - {id: EVIDENCE-04, kind: automated-test, description: "Gate workflow-tests comprova que gates MCP permanecem fora do sandbox de gate.", gateId: workflow-tests, resultRef: spec-gate-sandboxing-step-2/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-adapter.cjs}
  - id: AC-05
    evidence:
      - {id: EVIDENCE-05, kind: automated-test, description: "Gate workflow-tests comprova que falha de runtime/backend/init/cleanup do gate bloqueia sem fallback.", gateId: workflow-tests, resultRef: spec-gate-sandboxing-step-2/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-adapter.cjs}
  - id: AC-06
    evidence:
      - {id: EVIDENCE-06, kind: automated-test, description: "Gate workflow-tests comprova por teste real macOS que o gate sem rede não exfiltra nem escreve fora do worktree, mas roda os testes.", gateId: workflow-tests, resultRef: spec-gate-sandboxing-step-2/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-sandbox-runtime-macos.cjs}
  - id: AC-07
    evidence:
      - {id: EVIDENCE-07, kind: documentation, description: "Documentação durável registra a policy assimétrica, o gatilho de reabertura e a fronteira com gates MCP.", resultRef: docs/workflows/automated-spec-pipeline.md#gate-sandbox}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation:
  triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, on-resume]
  driftPolicy: block
documentationImpact: {kind: paths, paths: [docs/workflows/automated-spec-pipeline.md]}
testing: {required: true, gateIds: [workflow-tests], rationale: "Roteamento sandboxado, preservação dos gates MCP, zero fallback e contenção real precisam de prova automatizada."}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 2: Roteamento sandboxado dos gates e prova de contenção

## Goal

Rotear os gates executáveis não-MCP pela porta sandboxada e provar a contenção por teste adversarial
real.

## Assumptions

- A policy de gate e sua validação já existem (Step 1); este step apenas consome o contrato.
- A prova adversarial roda sob o backend real `sandbox-exec` com `skip: !MACOS`, no padrão existente.
- `verify.sh` e os testes de workflow não requerem rede real; um gate que precise dela é smell.

## Risks

- Roteamento parcial deixar algum caminho (gate global, version check de gate) por `runProcess`
  direto; toda execução de gate executável não-MCP deve passar pela porta.

## Edge cases

- Gate `type: mcp`: roteado por `runMcpGate`, sem sandbox de gate.
- Gate global sobre o worktree integrado: mesma policy de gate.
- Runtime do SRT ausente: bloqueia todos os gates de worktree, zero fallback.
- Teste hostil que abre socket de saída ou escreve fora do worktree: negado pelo backend.

## Acceptance Criteria

- Gates executáveis não-MCP executam pela porta sandboxada; nenhum caminho roda gate de worktree por
  `runProcess` direto.
- Gates `type: mcp` permanecem fora do sandbox de gate.
- Falha de runtime, backend, init ou cleanup do gate bloqueia com código estável e zero fallback.
- Um teste real macOS prova que o gate sem rede não abre conexão de saída e não escreve fora do
  worktree, e ainda executa os testes do worktree com sucesso.

## Tarefas

1. Em `scripts/workflow/lib/local-adapter.cjs`, rotear `runGate` de gates executáveis não-MCP pela
   porta sandboxada com a policy de gate resolvida do catálogo, preservando `runMcpGate` para gates MCP.
2. Cobrir em `scripts/workflow/test-adapter.cjs` o roteamento, a preservação dos gates MCP e o zero
   fallback sob falha do runtime.
3. Adicionar em `scripts/workflow/test-sandbox-runtime-macos.cjs` a prova adversarial real: rede e
   escrita externa negadas, execução dos testes do worktree bem-sucedida.
4. Documentar em `docs/workflows/automated-spec-pipeline.md` a policy assimétrica, o gatilho de
   reabertura para CI/máquina compartilhada e a fronteira com gates MCP.

## Paths afetados (limite absoluto)

- `scripts/workflow/lib/local-adapter.cjs`
- `scripts/workflow/test-adapter.cjs`
- `scripts/workflow/test-sandbox-runtime-macos.cjs`
- `docs/workflows/automated-spec-pipeline.md`

## Fora de Escopo

- Normalização da policy de gate, validação de catálogo e `resources.yaml` (Step 1).

## Critério de Pronto

- Testes provam roteamento sandboxado, preservação dos gates MCP, zero fallback e contenção real; a
  documentação durável registra a decisão.

## Dependências

- Passo 1.

## Checklist pré-handoff

- [ ] Quatro arquivos afetados?
- [ ] Nenhum gate de worktree roda por `runProcess` direto?
- [ ] Gates MCP mantêm `runMcpGate`?
- [ ] Prova adversarial falha caso rede ou escrita externa seja possível?

## Prompt de handoff

```text
Implemente APENAS o Passo 2.
Files: @scripts/workflow/lib/local-adapter.cjs @scripts/workflow/test-adapter.cjs @scripts/workflow/test-sandbox-runtime-macos.cjs @docs/workflows/automated-spec-pipeline.md
Out of scope: normalização da policy de gate, validação de catálogo e resources.yaml (Step 1).
Done criteria: gates executáveis não-MCP roteiam pela porta sandboxada, MCP mantém runMcpGate, zero fallback, e prova real macOS mostra rede/escrita externa negadas com testes ainda passando; doc durável atualizada.
Siga as convenções do repositório.
---
@specs/steps/gate-sandboxing-step-2.md
@specs/gate-sandboxing.md
```
