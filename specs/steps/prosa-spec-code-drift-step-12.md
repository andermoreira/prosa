---
schemaVersion: 2.0.0
changeType: security
id: spec-prosa-spec-code-drift-step-12
sequence: 12
specId: spec-prosa-spec-code-drift
source: {path: specs/steps/prosa-spec-code-drift-step-12.md, hash: 9ff30469fe30bc616175c11c3d319586cd885a61bbfb30e3b163b5c778a93bf6, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
goal: Tornar aligned o único predicado de acceptance em fixtures, mantendo o enforcement dormente até o Step 15.
boundaries: {inScope: [owns=predicado técnico puro e integração testável, invariant=ausência confirmed inconclusive nunca passam, allowedDependencies=step 11], outOfScope: [doesNotOwn=enablement rollout e documentação], maxLogicalFiles: 5}
dependsOn: [spec-prosa-spec-code-drift-step-11]
predictedFiles: [scripts/workflow/lib/acceptance.cjs, scripts/workflow/lib/local-adapter.cjs, scripts/workflow/test-acceptance.cjs, scripts/workflow/test-adapter.cjs]
allowedAreas: [scripts/workflow/lib, scripts/workflow/test-acceptance.cjs, scripts/workflow/test-adapter.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-spec-code-drift.md, stepPath: specs/steps/prosa-spec-code-drift-step-12.md, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0, implementationNoteIds: [NOTE-03, NOTE-04, NOTE-05, NOTE-06]}
acceptanceCriteria:
  - {id: AC-13, evidence: [{id: EVIDENCE-13, kind: automated-test, description: "Acceptance aceita somente aligned íntegro e rejeita ausência confirmed e inconclusive.", gateId: workflow-tests, resultRef: spec-prosa-spec-code-drift-step-12/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-acceptance.cjs scripts/workflow/test-adapter.cjs}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 180, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: Predicado e troubleshooting serão documentados no Step 14.}
testing: {required: true, gateIds: [workflow-tests], rationale: O predicado técnico precisa de matriz fail-closed antes da ativação.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 12: Predicado aligned de acceptance

## Goal

Tornar `aligned` o único predicado de acceptance em fixtures, mantendo o enforcement dormente até o Step 15.

## Assumptions

- O adapter pode expor o predicado novo sob seam de teste sem mudar a acceptance dos handoffs bootstrap.

## Risks

- Ligar o predicado cedo e bloquear o próprio rollout; mitigar separando implementação de ativação.

## Edge cases

- driftCheck ausente, artifact inválido, status desconhecido, confirmed/inconclusive e attempt anterior diferente.

## Acceptance Criteria

- O predicado puro aceita somente `aligned` íntegro; seu uso bloqueante em runs reais continua desligado.

## Tarefas

1. Implementar o predicado em `acceptance.cjs`.
2. Integrar seam dormente em `local-adapter.cjs`.
3. Cobrir matriz fail-closed em `test-acceptance.cjs` e `test-adapter.cjs`.

## Paths afetados (limite absoluto)

- `scripts/workflow/lib/acceptance.cjs`
- `scripts/workflow/lib/local-adapter.cjs`
- `scripts/workflow/test-acceptance.cjs`
- `scripts/workflow/test-adapter.cjs`

## Fora de Escopo

- Habilitar o predicado para runs reais, alterar rollout ou documentação.

## Critério de Pronto

- Testes provam fail-closed do predicado e também que o bootstrap v2 ainda não o invoca como bloqueio.

## Dependências

- Passo 11.

## Checklist pré-handoff

- [ ] Quatro paths previstos, sem arquivo adicional.
- [ ] Ausência nunca equivale a aligned.
- [ ] Enforcement permanece dormente.
- [ ] EVIDENCE-13 passa.

## Prompt de handoff

```text
Implemente APENAS o Passo 12.
Files: @scripts/workflow/lib/acceptance.cjs @scripts/workflow/lib/local-adapter.cjs @scripts/workflow/test-acceptance.cjs @scripts/workflow/test-adapter.cjs
Out of scope: enablement, rollout e documentação.
Done criteria: somente aligned íntegro satisfaz o predicado em testes, sem bloquear o bootstrap v2.
---
@specs/steps/prosa-spec-code-drift-step-12.md
@specs/prosa-spec-code-drift.md
```
