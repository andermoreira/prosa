---
schemaVersion: 1.0.0
id: spec-prosa-risk-hitl-step-3
sequence: 3
specId: spec-prosa-risk-hitl
source: {path: specs/steps/prosa-risk-hitl-step-3.md, hash: 61f105fd7d3dc9f16b4c4e029df48f95ed18f1588f2b82680cade15fb98922cb, baseSha: f24be0c353e28b370018b65ea3163908fa72e2cb}
goal: Vincular a trust root ao baseSha e classificar v1 como restricted antes de efeitos.
boundaries: {inScope: [owns=carregamento confiável classificação inicial e sinal legado, invariant=v1 nunca recebe autonomia, allowedDependencies=steps 1 e 2], outOfScope: [doesNotOwn=pausas HITL e persistência de decisões], maxLogicalFiles: 5}
dependsOn: [spec-prosa-risk-hitl-step-1, spec-prosa-risk-hitl-step-2]
predictedFiles: [schemas/step.schema.json, scripts/workflow/lib/orchestrator.cjs, scripts/workflow/lib/local-adapter.cjs, scripts/workflow/test-risk-policy.cjs, scripts/workflow/test-e2e.cjs]
allowedAreas: [schemas, scripts/workflow/lib, scripts/workflow/test-risk-policy.cjs, scripts/workflow/test-e2e.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-risk-hitl.md, stepPath: specs/steps/prosa-risk-hitl-step-3.md, baseSha: f24be0c353e28b370018b65ea3163908fa72e2cb, implementationNoteIds: [NOTE-01, NOTE-02, NOTE-03]}
acceptanceCriteria:
  - id: AC-01
    evidence:
      - {id: EVIDENCE-06, kind: automated-test, description: "Todos os v1 recebem restricted e legacy-step-without-change-type antes de efeitos.", gateId: workflow-tests, resultRef: spec-prosa-risk-hitl-step-3/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-e2e.cjs}
  - id: AC-02
    evidence:
      - {id: EVIDENCE-07, kind: contract-test, description: "Policy é carregada e hasheada exclusivamente do baseSha aprovado.", gateId: workflow-tests, resultRef: spec-prosa-risk-hitl-step-3/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-risk-policy.cjs}
  - id: AC-16
    evidence:
      - {id: EVIDENCE-08, kind: automated-test, description: "Versão desconhecida e policy drift bloqueiam antes de efeitos.", gateId: workflow-tests, resultRef: spec-prosa-risk-hitl-step-3/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-e2e.cjs}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: Trust root e compatibilidade serão documentadas no Step 13.}
testing: {required: true, gateIds: [workflow-tests], rationale: A classificação precisa preceder qualquer efeito e cobrir runs mistos.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 3: Trust root e classificação inicial

## Goal

Vincular a trust root ao `baseSha` e classificar v1 como `restricted` antes de efeitos.

## Assumptions

- Este handoff é v1 e deve provar o próprio caminho conservador sem se autoeditar sob revalidation.

## Risks

- Compatibilidade virar fallback; persistir nível, razão e sinal legado em todo assessment v1.

## Edge cases

- Run só v1, run misto, v2 sem tipo, policy drift e 37 steps ativos legados.

## Acceptance Criteria

- Todos os steps são classificados antes de efeitos; v1 é sempre `restricted` e auditável.

## Tarefas

1. Consolidar discriminação v1/v2 em `schemas/step.schema.json` sem tornar `changeType` opcional em v2.
2. Carregar a policy do `baseSha` em `scripts/workflow/lib/orchestrator.cjs`.
3. Classificar/persistir o conjunto em `scripts/workflow/lib/local-adapter.cjs`, gerando o sinal legado para v1.
4. Cobrir trust root, runs mistos e falhas em `scripts/workflow/test-risk-policy.cjs` e `scripts/workflow/test-e2e.cjs`.

## Paths afetados (limite absoluto)

- `schemas/step.schema.json`
- `scripts/workflow/lib/orchestrator.cjs`
- `scripts/workflow/lib/local-adapter.cjs`
- `scripts/workflow/test-risk-policy.cjs`
- `scripts/workflow/test-e2e.cjs`

## Fora de Escopo

- Migrar steps v1, pausar o run ou consumir decisões.

## Critério de Pronto

- E2E prova v1→`restricted` antes de efeitos e v2 classificado pela policy do base.

## Dependências

- Passos 1 e 2.

## Prompt de handoff

```text
Implemente APENAS o Passo 3.
Files: @schemas/step.schema.json @scripts/workflow/lib/orchestrator.cjs @scripts/workflow/lib/local-adapter.cjs @scripts/workflow/test-risk-policy.cjs @scripts/workflow/test-e2e.cjs
Out of scope: migração em massa, pausas e decisões.
Done criteria: v1 recebe restricted+sinal legado e v2 usa policy do baseSha antes de efeitos.
---
@specs/steps/prosa-risk-hitl-step-3.md
@specs/prosa-risk-hitl.md
```
