---
schemaVersion: 2.0.0
changeType: security
id: spec-prosa-spec-code-drift-step-11
sequence: 11
specId: spec-prosa-spec-code-drift
source: {path: specs/steps/prosa-spec-code-drift-step-11.md, hash: c4c54aa2c2dc4d70368ea8fe3c954cb536b16d99f072695c5327d034ca65b117, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
goal: Restringir a decisão HITL pelo driftCheck íntegro do attempt atual sem criar waiver ou nova pausa.
boundaries: {inScope: [owns=validação contextual e contexto retry replan, invariant=approved não supera drift e histórico não bloqueia attempt aligned, allowedDependencies=step 10], outOfScope: [doesNotOwn=acceptance state machine nova e enablement], maxLogicalFiles: 5}
dependsOn: [spec-prosa-spec-code-drift-step-10]
predictedFiles: [scripts/workflow/lib/hitl-decision.cjs, scripts/workflow/lib/local-adapter.cjs, scripts/workflow/test-hitl-decision.cjs, scripts/workflow/test-adapter.cjs]
allowedAreas: [scripts/workflow/lib, scripts/workflow/test-hitl-decision.cjs, scripts/workflow/test-adapter.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-spec-code-drift.md, stepPath: specs/steps/prosa-spec-code-drift-step-11.md, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0, implementationNoteIds: [NOTE-03, NOTE-04, NOTE-05, NOTE-06]}
acceptanceCriteria:
  - {id: AC-16, evidence: [{id: EVIDENCE-16, kind: automated-test, description: "Approved com drift atual falha sem consumo e somente retry replan ou abort é aceito.", gateId: workflow-tests, resultRef: spec-prosa-spec-code-drift-step-11/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-hitl-decision.cjs scripts/workflow/test-adapter.cjs}]}
  - {id: AC-17, evidence: [{id: EVIDENCE-17, kind: automated-test, description: "Contexto distingue retry de replan e não dispara reconciliação generativa.", gateId: workflow-tests, resultRef: spec-prosa-spec-code-drift-step-11/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-adapter.cjs}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 180, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: Semântica operacional será documentada no Step 14.}
testing: {required: true, gateIds: [workflow-tests], rationale: Decisão single-use e binding por attempt exigem matriz contextual.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 11: Decisão contextual sem waiver

## Goal

Restringir a decisão HITL pelo `driftCheck` íntegro do attempt atual sem criar waiver ou nova pausa.

## Assumptions

- O checkpoint pós-review e o decision file existentes continuam sendo os únicos mecanismos HITL.

## Risks

- Signal histórico bloquear retry alinhado ou approved virar waiver; mitigar consultando somente driftCheck atual íntegro.

## Edge cases

- Approved repetido, request stale, attempt anterior confirmed, atual aligned, artifact corrompido e rejeição contraditória.

## Acceptance Criteria

- Drift atual rejeita `approved` sem consumir request; apenas rejeições explícitas são válidas; attempt atual aligned não herda bloqueio técnico.

## Tarefas

1. Acrescentar validação contextual pura em `hitl-decision.cjs`.
2. Montar contexto sanitizado e binding atual em `local-adapter.cjs` sem nova pausa.
3. Cobrir decisões, staleness e histórico monotônico nos testes previstos.

## Paths afetados (limite absoluto)

- `scripts/workflow/lib/hitl-decision.cjs`
- `scripts/workflow/lib/local-adapter.cjs`
- `scripts/workflow/test-hitl-decision.cjs`
- `scripts/workflow/test-adapter.cjs`

## Fora de Escopo

- Criar waiver, nova state machine, mudar acceptance ou ativar enforcement em runs reais.

## Critério de Pronto

- Matriz contextual passa; decisão inválida não é consumida; retry/replan são explicados sem autoedição.

## Dependências

- Passo 10.

## Checklist pré-handoff

- [ ] Quatro paths previstos, sem arquivo adicional.
- [ ] Somente driftCheck íntegro do attempt atual decide o bloqueio técnico.
- [ ] Checkpoint existente é reutilizado.
- [ ] EVIDENCE-16 e EVIDENCE-17 passam.

## Prompt de handoff

```text
Implemente APENAS o Passo 11.
Files: @scripts/workflow/lib/hitl-decision.cjs @scripts/workflow/lib/local-adapter.cjs @scripts/workflow/test-hitl-decision.cjs @scripts/workflow/test-adapter.cjs
Out of scope: waiver, nova pausa/state machine, acceptance e enablement.
Done criteria: approved não supera drift atual; rejeição exige retry/replan/abort; histórico não bloqueia attempt aligned.
---
@specs/steps/prosa-spec-code-drift-step-11.md
@specs/prosa-spec-code-drift.md
```
