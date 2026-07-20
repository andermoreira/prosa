---
schemaVersion: 2.0.0
changeType: architecture
id: spec-prosa-spec-code-drift-step-9
sequence: 9
specId: spec-prosa-spec-code-drift
source: {path: specs/steps/prosa-spec-code-drift-step-9.md, hash: 2405baf0961e78167633061b93b852bcc1c8f5ce4e6c17d2866defdf3619b08c, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
goal: Inserir CHECKING_DRIFT e preservar reviewer em um caminho shadow não bloqueante para runs reais.
boundaries: {inScope: [owns=estado e ordem da fase em fixtures shadow, invariant=reviewer roda nos três resultados e enforcement segue desligado, allowedDependencies=step 8], outOfScope: [doesNotOwn=signals decisão acceptance e enablement], maxLogicalFiles: 5}
dependsOn: [spec-prosa-spec-code-drift-step-8]
predictedFiles: [scripts/workflow/lib/state-machine.cjs, scripts/workflow/lib/orchestrator.cjs, scripts/workflow/lib/local-adapter.cjs, scripts/workflow/test-state.cjs, scripts/workflow/test-e2e.cjs]
allowedAreas: [scripts/workflow/lib, scripts/workflow/test-state.cjs, scripts/workflow/test-e2e.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-spec-code-drift.md, stepPath: specs/steps/prosa-spec-code-drift-step-9.md, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0, implementationNoteIds: [NOTE-03, NOTE-05, NOTE-06]}
acceptanceCriteria:
  - {id: AC-11, evidence: [{id: EVIDENCE-11, kind: automated-test, description: "Fixtures provam GATING para CHECKING_DRIFT para REVALIDATING para REVIEWING.", gateId: workflow-tests, resultRef: spec-prosa-spec-code-drift-step-9/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-state.cjs scripts/workflow/test-e2e.cjs}]}
  - {id: AC-15, evidence: [{id: EVIDENCE-15, kind: automated-test, description: "Reviewer roda em aligned confirmed e inconclusive e reutiliza somente HITL existente.", gateId: workflow-tests, resultRef: spec-prosa-spec-code-drift-step-9/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-e2e.cjs}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 180, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: Ordem e operação serão documentadas no Step 14.}
testing: {required: true, gateIds: [workflow-tests], rationale: Nova fase precisa provar ordem e preservação do reviewer antes do enablement.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 9: Fase CHECKING_DRIFT em shadow

## Goal

Inserir `CHECKING_DRIFT` e preservar reviewer em um caminho shadow não bloqueante para runs reais.

## Assumptions

- A fase pode ser exercitada por fixtures e observação shadow sem alterar acceptance ou bloquear estes handoffs v2.

## Risks

- Ativar enforcement por acidente; mitigar com separação explícita entre wiring shadow e switch final do Step 15.

## Edge cases

- Aligned, confirmed, inconclusive, crash na fase e revalidation que detecta identidade alterada.

## Acceptance Criteria

- A ordem inclui `CHECKING_DRIFT`, sempre alcança reviewer e não muda o resultado de runs reais antes do Step 15.

## Tarefas

1. Acrescentar transições da fase em `state-machine.cjs` sob o caminho shadow.
2. Integrar chamada read-only em `orchestrator.cjs` e `local-adapter.cjs` sem enforcement mutável.
3. Cobrir ordem, recovery e reviewer nos testes de state e e2e.

## Paths afetados (limite absoluto)

- `scripts/workflow/lib/state-machine.cjs`
- `scripts/workflow/lib/orchestrator.cjs`
- `scripts/workflow/lib/local-adapter.cjs`
- `scripts/workflow/test-state.cjs`
- `scripts/workflow/test-e2e.cjs`

## Fora de Escopo

- Emitir signals, restringir decision file, bloquear acceptance ou encerrar a exceção bootstrap.

## Critério de Pronto

- Fixtures comprovam a ordem e reviewer; handoffs v2 do bootstrap continuam executáveis sob a exceção exata.

## Dependências

- Passo 8.

## Checklist pré-handoff

- [ ] Cinco paths previstos, sem arquivo adicional.
- [ ] Nenhum resultado de drift bloqueia run real ainda.
- [ ] Reviewer é preservado em todos os status.
- [ ] EVIDENCE-11 e EVIDENCE-15 passam.

## Prompt de handoff

```text
Implemente APENAS o Passo 9.
Files: @scripts/workflow/lib/state-machine.cjs @scripts/workflow/lib/orchestrator.cjs @scripts/workflow/lib/local-adapter.cjs @scripts/workflow/test-state.cjs @scripts/workflow/test-e2e.cjs
Out of scope: signals, decisão contextual, acceptance e enablement.
Done criteria: CHECKING_DRIFT e reviewer testados em shadow, sem bloquear o bootstrap v2.
---
@specs/steps/prosa-spec-code-drift-step-9.md
@specs/prosa-spec-code-drift.md
```
