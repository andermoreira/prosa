---
schemaVersion: 2.0.0
changeType: architecture
id: spec-prosa-spec-code-drift-step-8
sequence: 8
specId: spec-prosa-spec-code-drift
source: {path: specs/steps/prosa-spec-code-drift-step-8.md, hash: 7ff5e1cf5801fbe3983d2341d60b90e530e7f90524a6714c50be554b980dda00, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
goal: Implementar publicação atômica, recovery exato e detectorBundleHash em modo de fixture.
boundaries: {inScope: [owns=operação idempotente publicação e reconciliação, invariant=nada é reutilizado entre attempts, allowedDependencies=step 7], outOfScope: [doesNotOwn=state machine signals HITL acceptance e enablement], maxLogicalFiles: 5}
dependsOn: [spec-prosa-spec-code-drift-step-7]
predictedFiles: [scripts/workflow/lib/spec-code-drift.cjs, scripts/workflow/lib/local-adapter.cjs, scripts/workflow/lib/runtime.cjs, scripts/workflow/test-adapter.cjs, scripts/workflow/test-state.cjs]
allowedAreas: [scripts/workflow/lib, scripts/workflow/test-adapter.cjs, scripts/workflow/test-state.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-spec-code-drift.md, stepPath: specs/steps/prosa-spec-code-drift-step-8.md, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0, implementationNoteIds: [NOTE-03, NOTE-04, NOTE-05, NOTE-06]}
acceptanceCriteria:
  - {id: AC-18, evidence: [{id: EVIDENCE-18, kind: automated-test, description: "Recovery reutiliza somente bindings íntegros e trata órfãos corrupção e signal ausente conforme contrato.", gateId: workflow-tests, resultRef: spec-prosa-spec-code-drift-step-8/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-adapter.cjs scripts/workflow/test-state.cjs}]}
  - {id: AC-19, evidence: [{id: EVIDENCE-19, kind: automated-test, description: "Operation ID e bindings impedem reuso de resultado entre attempts.", gateId: workflow-tests, resultRef: spec-prosa-spec-code-drift-step-8/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-state.cjs}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 180, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: Recovery será documentado no Step 14.}
testing: {required: true, gateIds: [workflow-tests], rationale: Crash windows e bindings exigem testes de reconciliação determinística.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 8: Publicação e recovery

## Goal

Implementar publicação atômica, recovery exato e `detectorBundleHash` em modo de fixture.

## Assumptions

- Captura, artifact e state v4 dos passos anteriores estão disponíveis por seams de teste, sem execução real.

## Risks

- Artifact órfão adquirir autoridade ou tentativa anterior contaminar retry; mitigar com state autoritativo e attempt no ID.

## Edge cases

- Crash antes/depois do rename, artifact sem state, state com artifact ausente, signal ausente e diff idêntico em novo attempt.

## Acceptance Criteria

- Recovery só reutiliza conjunto íntegro e exatamente vinculado; corrupção bloqueia e attempts nunca compartilham resultado.

## Tarefas

1. Derivar operation ID e bundle hash em `spec-code-drift.cjs`.
2. Implementar publicação em duas fases e reconciliação em `local-adapter.cjs` e `runtime.cjs`.
3. Cobrir janelas de crash, órfãos, corrupção e attempts distintos nos testes previstos.

## Paths afetados (limite absoluto)

- `scripts/workflow/lib/spec-code-drift.cjs`
- `scripts/workflow/lib/local-adapter.cjs`
- `scripts/workflow/lib/runtime.cjs`
- `scripts/workflow/test-adapter.cjs`
- `scripts/workflow/test-state.cjs`

## Fora de Escopo

- Inserir a fase, emitir signal, restringir decisão, acceptance ou enablement.

## Critério de Pronto

- Testes cobrem todas as regras de recovery e provam isolamento por attempt; APIs seguem dormentes.

## Dependências

- Passo 7.

## Checklist pré-handoff

- [ ] Cinco paths previstos, sem arquivo adicional.
- [ ] Artifact órfão nunca recebe autoridade.
- [ ] Nenhum wiring de run real foi adicionado.
- [ ] EVIDENCE-18 e EVIDENCE-19 passam.

## Prompt de handoff

```text
Implemente APENAS o Passo 8.
Files: @scripts/workflow/lib/spec-code-drift.cjs @scripts/workflow/lib/local-adapter.cjs @scripts/workflow/lib/runtime.cjs @scripts/workflow/test-adapter.cjs @scripts/workflow/test-state.cjs
Out of scope: state machine, signals, HITL, acceptance e enablement.
Done criteria: publicação/recovery idempotentes e exatamente vinculados, sem reuso entre attempts e ainda dormentes.
---
@specs/steps/prosa-spec-code-drift-step-8.md
@specs/prosa-spec-code-drift.md
```
