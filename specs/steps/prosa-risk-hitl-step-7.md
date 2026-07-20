---
schemaVersion: 1.0.0
id: spec-prosa-risk-hitl-step-7
sequence: 7
specId: spec-prosa-risk-hitl
source: {path: specs/steps/prosa-risk-hitl-step-7.md, hash: d5f9ebfcf04e8495fe468da535208a24390da6388bdbf640bd3fecfd8f9bf8d4, baseSha: f24be0c353e28b370018b65ea3163908fa72e2cb}
goal: Pausar antes da execução quando o nível efetivo exigir aprovação.
boundaries: {inScope: [owns=checkpoint pré-exec e contexto sanitizado, invariant=pausa precede attempt worktree e agente, allowedDependencies=steps 3 5 e 6], outOfScope: [doesNotOwn=pós-review e CLI decision-file], maxLogicalFiles: 5}
dependsOn: [spec-prosa-risk-hitl-step-3, spec-prosa-risk-hitl-step-5, spec-prosa-risk-hitl-step-6]
predictedFiles: [scripts/workflow/lib/orchestrator.cjs, scripts/workflow/lib/local-adapter.cjs, scripts/workflow/test-adapter.cjs, scripts/workflow/test-e2e.cjs]
allowedAreas: [scripts/workflow/lib, scripts/workflow/test-adapter.cjs, scripts/workflow/test-e2e.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-risk-hitl.md, stepPath: specs/steps/prosa-risk-hitl-step-7.md, baseSha: f24be0c353e28b370018b65ea3163908fa72e2cb, implementationNoteIds: [NOTE-01, NOTE-02, NOTE-03]}
acceptanceCriteria:
  - id: AC-03
    evidence:
      - {id: EVIDENCE-15, kind: automated-test, description: "Somente v2 autonomous prossegue sem pausa de risco ou mudança em Git.", gateId: workflow-tests, resultRef: spec-prosa-risk-hitl-step-7/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-e2e.cjs}
  - id: AC-04
    evidence:
      - {id: EVIDENCE-16, kind: automated-test, description: "Approval required e todo v1 pausam antes de worktree attempt ou agente.", gateId: workflow-tests, resultRef: spec-prosa-risk-hitl-step-7/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-adapter.cjs}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: Operação da pausa será documentada no Step 13.}
testing: {required: true, gateIds: [workflow-tests], rationale: Posição do checkpoint e ausência de efeitos exigem E2E.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 7: Checkpoint pré-execução

## Goal

Pausar antes da execução quando o nível efetivo exigir aprovação.

## Assumptions

- Este handoff v1 é um caso `restricted` deliberado do bootstrap conservador.

## Risks

- Criar worktree antes da pausa; persistir request e sair antes de qualquer efeito.

## Edge cases

- V1 legado, v2 autônomo, escalada precoce, resume repetido e contexto sensível.

## Acceptance Criteria

- V1 e níveis aprováveis pausam antes de efeitos; somente v2 autônomo válido prossegue.

## Tarefas

1. Integrar checkpoint pré-execução em `scripts/workflow/lib/orchestrator.cjs`.
2. Persistir request e artifact sanitizado em `scripts/workflow/lib/local-adapter.cjs`.
3. Cobrir v1, v2 autônomo e ausência de efeitos em `scripts/workflow/test-adapter.cjs` e `scripts/workflow/test-e2e.cjs`.

## Paths afetados (limite absoluto)

- `scripts/workflow/lib/orchestrator.cjs`
- `scripts/workflow/lib/local-adapter.cjs`
- `scripts/workflow/test-adapter.cjs`
- `scripts/workflow/test-e2e.cjs`

## Fora de Escopo

- Aprovação pós-review, decision file e produtores tardios.

## Critério de Pronto

- Testes provam pausa antes de efeitos e caminho v2 autônomo sem pausa adicional.

## Dependências

- Passos 3, 5 e 6.

## Prompt de handoff

```text
Implemente APENAS o Passo 7.
Files: @scripts/workflow/lib/orchestrator.cjs @scripts/workflow/lib/local-adapter.cjs @scripts/workflow/test-adapter.cjs @scripts/workflow/test-e2e.cjs
Out of scope: pós-review, decision file e produtores tardios.
Done criteria: v1 e níveis aprováveis pausam antes de efeitos; v2 autonomous prossegue.
---
@specs/steps/prosa-risk-hitl-step-7.md
@specs/prosa-risk-hitl.md
```
