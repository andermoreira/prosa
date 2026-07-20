---
schemaVersion: 2.0.0
changeType: feature
id: spec-prosa-spec-code-drift-step-10
sequence: 10
specId: spec-prosa-spec-code-drift
source: {path: specs/steps/prosa-spec-code-drift-step-10.md, hash: 1caff7053fedf87a5c0f79318d780986f25001a49c2223a281b6d9b78fe0721c, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
goal: Produzir RiskSignal restricted idempotente para drift negativo sem alterar o agregador.
boundaries: {inScope: [owns=produtor e wiring shadow do signal, invariant=fingerprint idempotente e agregador inalterado, allowedDependencies=step 9], outOfScope: [doesNotOwn=decisão acceptance e enablement], maxLogicalFiles: 5}
dependsOn: [spec-prosa-spec-code-drift-step-9]
predictedFiles: [scripts/workflow/lib/risk-signals.cjs, scripts/workflow/lib/orchestrator.cjs, scripts/workflow/test-risk-signals.cjs, scripts/workflow/test-e2e.cjs]
allowedAreas: [scripts/workflow/lib, scripts/workflow/test-risk-signals.cjs, scripts/workflow/test-e2e.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-spec-code-drift.md, stepPath: specs/steps/prosa-spec-code-drift-step-10.md, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0, implementationNoteIds: [NOTE-03, NOTE-04, NOTE-05, NOTE-06]}
acceptanceCriteria:
  - {id: AC-14, evidence: [{id: EVIDENCE-14, kind: automated-test, description: "Confirmed e inconclusive produzem signal restricted idempotente pelo contrato genérico sem mudar agregação.", gateId: workflow-tests, resultRef: spec-prosa-spec-code-drift-step-10/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-risk-signals.cjs scripts/workflow/test-e2e.cjs}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 180, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: Signal e contexto serão documentados no Step 14.}
testing: {required: true, gateIds: [workflow-tests], rationale: Fingerprint e reconciliação precisam provar idempotência sem regressão no agregador.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 10: Signal restricted idempotente

## Goal

Produzir `RiskSignal` restricted idempotente para drift negativo sem alterar o agregador.

## Assumptions

- `recordRiskSignals` e o agregador monotônico existentes são reutilizados sem mudança de contrato.

## Risks

- Signal duplicado ou usado como predicado técnico; mitigar com fingerprint e separação explícita de acceptance.

## Edge cases

- Reexecução após crash, signal ausente, resultado aligned, attempts diferentes e assessment já restricted.

## Acceptance Criteria

- `confirmed` e `inconclusive` geram signal restricted idempotente; `aligned` não gera; agregador permanece intacto.

## Tarefas

1. Implementar o produtor em `risk-signals.cjs` usando o envelope existente.
2. Conectar a reconciliação shadow em `orchestrator.cjs` sem habilitar bloqueio.
3. Cobrir fingerprints, duplicates e attempts nos testes previstos.

## Paths afetados (limite absoluto)

- `scripts/workflow/lib/risk-signals.cjs`
- `scripts/workflow/lib/orchestrator.cjs`
- `scripts/workflow/test-risk-signals.cjs`
- `scripts/workflow/test-e2e.cjs`

## Fora de Escopo

- Alterar risk policy/agregador, restringir approved, mudar acceptance ou habilitar fail-closed.

## Critério de Pronto

- Testes provam signal genérico idempotente e ausência de mudança no agregador ou enforcement real.

## Dependências

- Passo 9.

## Checklist pré-handoff

- [ ] Quatro paths previstos, sem arquivo adicional.
- [ ] Agregador e policy permanecem inalterados.
- [ ] Signal shadow não bloqueia o bootstrap.
- [ ] EVIDENCE-14 passa.

## Prompt de handoff

```text
Implemente APENAS o Passo 10.
Files: @scripts/workflow/lib/risk-signals.cjs @scripts/workflow/lib/orchestrator.cjs @scripts/workflow/test-risk-signals.cjs @scripts/workflow/test-e2e.cjs
Out of scope: risk policy/agregador, decisão, acceptance e enablement.
Done criteria: drift negativo produz signal restricted idempotente em shadow sem mudar agregação.
---
@specs/steps/prosa-spec-code-drift-step-10.md
@specs/prosa-spec-code-drift.md
```
