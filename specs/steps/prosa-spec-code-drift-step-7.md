---
schemaVersion: 2.0.0
changeType: architecture
id: spec-prosa-spec-code-drift-step-7
sequence: 7
specId: spec-prosa-spec-code-drift
source: {path: specs/steps/prosa-spec-code-drift-step-7.md, hash: 03eeea744a28557617472096c5cdd8e9c32cab484c98aa94c793712f2d29f7bd, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
goal: Evoluir state v4 para registrar driftCheck completo por attempt sem ativar transições de drift.
boundaries: {inScope: [owns=schema state e histórico por attempt, invariant=ausência não recebe aligned e histórico não é sobrescrito, allowedDependencies=step 6], outOfScope: [doesNotOwn=publicação recovery state machine e enablement], maxLogicalFiles: 5}
dependsOn: [spec-prosa-spec-code-drift-step-6]
predictedFiles: [schemas/state.schema.json, scripts/workflow/lib/runtime.cjs, scripts/workflow/test-state.cjs]
allowedAreas: [schemas, scripts/workflow/lib, scripts/workflow/test-state.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-spec-code-drift.md, stepPath: specs/steps/prosa-spec-code-drift-step-7.md, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0, implementationNoteIds: [NOTE-03, NOTE-05, NOTE-06]}
acceptanceCriteria:
  - {id: AC-12, evidence: [{id: EVIDENCE-12, kind: contract-test, description: "State v4 registra driftCheck completo por attempt e preserva histórico sem default aligned.", gateId: workflow-tests, resultRef: spec-prosa-spec-code-drift-step-7/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-state.cjs}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 180, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: State v4 será documentado no Step 14.}
testing: {required: true, gateIds: [workflow-tests], rationale: Evolução incompatível de state exige validação de histórico e ausência.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 7: State v4 por attempt

## Goal

Evoluir state v4 para registrar `driftCheck` completo por attempt sem ativar transições de drift.

## Assumptions

- State v4 pode ser construído e testado por fixtures antes de ser habilitado para runs futuros.

## Risks

- Migração implícita ou histórico sobrescrito; mitigar com versão incompatível explícita e append por attempt.

## Edge cases

- Ausência de driftCheck, artifact ref parcial, attempt repetido e leitura diagnóstica de state v3.

## Acceptance Criteria

- State v4 exige bindings completos por attempt, preserva histórico e nunca infere `aligned`.

## Tarefas

1. Evoluir `schemas/state.schema.json` para v4 e `attempts[].driftCheck`.
2. Adaptar estruturas puras em `runtime.cjs` sem ligar a fase no orchestrator.
3. Cobrir histórico, ausência e versões incompatíveis em `test-state.cjs`.

## Paths afetados (limite absoluto)

- `schemas/state.schema.json`
- `scripts/workflow/lib/runtime.cjs`
- `scripts/workflow/test-state.cjs`

## Fora de Escopo

- Publicação/recovery, transição CHECKING_DRIFT e criação de state v4 em runs reais.

## Critério de Pronto

- Fixtures v4 validam todos os bindings; state antigo é diagnosticável; runtime mutável continua no comportamento vigente.

## Dependências

- Passo 6.

## Checklist pré-handoff

- [ ] Três paths previstos, sem arquivo adicional.
- [ ] Nenhum default converte ausência em aligned.
- [ ] State v4 permanece fixture/shadow.
- [ ] EVIDENCE-12 passa.

## Prompt de handoff

```text
Implemente APENAS o Passo 7.
Files: @schemas/state.schema.json @scripts/workflow/lib/runtime.cjs @scripts/workflow/test-state.cjs
Out of scope: publicação, recovery, state machine e enablement de state v4.
Done criteria: state v4 por attempt validado, sem sobrescrita histórica ou default aligned, ainda dormente.
---
@specs/steps/prosa-spec-code-drift-step-7.md
@specs/prosa-spec-code-drift.md
```
