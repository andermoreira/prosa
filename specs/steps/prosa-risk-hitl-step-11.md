---
schemaVersion: 1.0.0
id: spec-prosa-risk-hitl-step-11
sequence: 11
specId: spec-prosa-risk-hitl
source: {path: specs/steps/prosa-risk-hitl-step-11.md, hash: 90b46ef397a99a079d0561eeefac9d233e32043e280342d4c0c7c922affab6bb, baseSha: f24be0c353e28b370018b65ea3163908fa72e2cb}
goal: Consolidar hardening de compatibilidade v1, replay, crash, staleness e autorizações.
boundaries: {inScope: [owns=testes adversariais cross-module, invariant=v1 nunca é autonomous e nenhum teste relaxa fail-closed, allowedDependencies=steps 4 a 10], outOfScope: [doesNotOwn=mudanças em código de produção ou requisitos novos], maxLogicalFiles: 5}
dependsOn: [spec-prosa-risk-hitl-step-4, spec-prosa-risk-hitl-step-5, spec-prosa-risk-hitl-step-6, spec-prosa-risk-hitl-step-7, spec-prosa-risk-hitl-step-8, spec-prosa-risk-hitl-step-9, spec-prosa-risk-hitl-step-10]
predictedFiles: [scripts/workflow/test-state.cjs, scripts/workflow/test-adapter.cjs, scripts/workflow/test-e2e.cjs, scripts/workflow/test-cli.cjs, scripts/workflow/test-commit.cjs]
allowedAreas: [scripts/workflow]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-risk-hitl.md, stepPath: specs/steps/prosa-risk-hitl-step-11.md, baseSha: f24be0c353e28b370018b65ea3163908fa72e2cb, implementationNoteIds: [NOTE-01, NOTE-02, NOTE-03]}
acceptanceCriteria:
  - id: AC-01
    evidence:
      - {id: EVIDENCE-26, kind: automated-test, description: "Matriz prova v1 aceito mas sempre restricted com sinal legado.", gateId: workflow-tests, resultRef: spec-prosa-risk-hitl-step-11/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-e2e.cjs}
  - id: AC-14
    evidence:
      - {id: EVIDENCE-27, kind: automated-test, description: "Matriz separa aprovação de risco commit e PR em v1 e v2.", gateId: workflow-tests, resultRef: spec-prosa-risk-hitl-step-11/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-commit.cjs}
  - id: AC-15
    evidence:
      - {id: EVIDENCE-28, kind: automated-test, description: "Crash retoma sem repetir agente review decisão ou Git.", gateId: workflow-tests, resultRef: spec-prosa-risk-hitl-step-11/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-e2e.cjs}
  - id: AC-16
    evidence:
      - {id: EVIDENCE-29, kind: automated-test, description: "State incompatível drift e adulteração bloqueiam com diagnóstico.", gateId: workflow-tests, resultRef: spec-prosa-risk-hitl-step-11/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-state.cjs}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: Este step altera somente testes; resultados serão documentados nos Steps 13 e 14.}
testing: {required: true, gateIds: [workflow-tests], rationale: É um step exclusivo de hardening e regressão.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 11: Hardening e regressões

## Goal

Consolidar hardening de compatibilidade v1, replay, crash, staleness e autorizações.

## Assumptions

- Este handoff v1 deve permanecer `restricted`; a suíte precisa detectar qualquer regressão para autonomia.

## Risks

- Cobertura duplicada sem fronteiras; organizar a matriz por versão, checkpoint e efeito.

## Edge cases

- V1 com/sem `behaviorType`, v2 sem tipo, crash, replay contraditório e combinações Git.

## Acceptance Criteria

- A suíte prova v1 conservador, exactly-once, fail-closed e independência Git.

## Tarefas

1. Completar regressões de schema/transição em `scripts/workflow/test-state.cjs`.
2. Cobrir artifacts e v1/v2 em `scripts/workflow/test-adapter.cjs` e `scripts/workflow/test-e2e.cjs`.
3. Cobrir decision file em `scripts/workflow/test-cli.cjs` e mapping/autorização em `scripts/workflow/test-commit.cjs`.

## Paths afetados (limite absoluto)

- `scripts/workflow/test-state.cjs`
- `scripts/workflow/test-adapter.cjs`
- `scripts/workflow/test-e2e.cjs`
- `scripts/workflow/test-cli.cjs`
- `scripts/workflow/test-commit.cjs`

## Fora de Escopo

- Alterar código de produção, migrar steps ou criar correction automática.

## Critério de Pronto

- A matriz falha se v1 ficar autônomo ou se replay, stale, exactly-once ou autorização forem relaxados.

## Dependências

- Passos 4 a 10.

## Prompt de handoff

```text
Implemente APENAS o Passo 11.
Files: @scripts/workflow/test-state.cjs @scripts/workflow/test-adapter.cjs @scripts/workflow/test-e2e.cjs @scripts/workflow/test-cli.cjs @scripts/workflow/test-commit.cjs
Out of scope: código de produção, migração e correction automática.
Done criteria: matriz prova v1 restricted, v2 estrito, replay, crash, stale e autorizações independentes.
---
@specs/steps/prosa-risk-hitl-step-11.md
@specs/prosa-risk-hitl.md
```
