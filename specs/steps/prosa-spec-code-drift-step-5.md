---
schemaVersion: 2.0.0
changeType: security
id: spec-prosa-spec-code-drift-step-5
sequence: 5
specId: spec-prosa-spec-code-drift
source: {path: specs/steps/prosa-spec-code-drift-step-5.md, hash: 6c5583f529e7e3c0a713758db991051c8053a504278169ede7d04d8357412d99, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
goal: Isolar parsing em worker terminável com limites coercitivos derivados do baseline.
boundaries: {inScope: [owns=worker deadlines e limites, invariant=excesso produz inconclusive sem truncamento alinhado, allowedDependencies=step 4], outOfScope: [doesNotOwn=captura artifacts state e wiring], maxLogicalFiles: 5}
dependsOn: [spec-prosa-spec-code-drift-step-4]
predictedFiles: [scripts/workflow/lib/spec-code-drift-worker.cjs, scripts/workflow/lib/spec-code-drift.cjs, scripts/workflow/test-spec-code-drift.cjs]
allowedAreas: [scripts/workflow/lib, scripts/workflow/test-spec-code-drift.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-spec-code-drift.md, stepPath: specs/steps/prosa-spec-code-drift-step-5.md, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0, implementationNoteIds: [NOTE-02, NOTE-05, NOTE-06]}
acceptanceCriteria:
  - {id: AC-10, evidence: [{id: EVIDENCE-10, kind: automated-test, description: "Worker aplica limites coercitivos de bytes nós profundidade e tempo e retorna inconclusive em excesso.", gateId: workflow-tests, resultRef: spec-prosa-spec-code-drift-step-5/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-spec-code-drift.cjs}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 180, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: Limites serão consolidados na documentação durável do Step 14.}
testing: {required: true, gateIds: [workflow-tests], rationale: Contenção exige testes de deadline e término coercitivo.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 5: Worker e limites coercitivos

## Goal

Isolar parsing em worker terminável com limites coercitivos derivados do baseline.

## Assumptions

- Os números e a matriz usados vêm do relatório aprovado do Step 1 e não são configuráveis pelo step.

## Risks

- Worker não terminar ou truncamento virar sucesso; mitigar com deadline externo, terminate e resultado conservador.

## Edge cases

- Limite antes do parse, heap/stack, nós/profundidade, timeout, worker crash e resposta parcial.

## Acceptance Criteria

- Todo excesso ou término anormal produz `inconclusive`; somente avaliação completa pode produzir `aligned`.

## Tarefas

1. Criar `spec-code-drift-worker.cjs` com protocolo fechado e sem I/O de rede/import do alvo.
2. Integrar limites centrais e deadline coercitivo em `spec-code-drift.cjs`.
3. Cobrir término, bombas e respostas parciais em `test-spec-code-drift.cjs`.

## Paths afetados (limite absoluto)

- `scripts/workflow/lib/spec-code-drift-worker.cjs`
- `scripts/workflow/lib/spec-code-drift.cjs`
- `scripts/workflow/test-spec-code-drift.cjs`

## Fora de Escopo

- Capturar arquivos do worktree, persistir artifact/state ou ligar a fase no orchestrator.

## Critério de Pronto

- Limites do baseline são centrais e testados; worker é terminável; falha nunca é convertida em alinhamento.

## Dependências

- Passo 4.

## Checklist pré-handoff

- [ ] Três paths previstos, sem arquivo adicional.
- [ ] Limites não são controlados pelo handoff analisado.
- [ ] Worker permanece dormente fora dos testes.
- [ ] EVIDENCE-10 passa.

## Prompt de handoff

```text
Implemente APENAS o Passo 5.
Files: @scripts/workflow/lib/spec-code-drift-worker.cjs @scripts/workflow/lib/spec-code-drift.cjs @scripts/workflow/test-spec-code-drift.cjs
Out of scope: captura, artifacts, state, orchestrator e enablement.
Done criteria: worker terminável aplica limites do baseline e todo excesso/falha retorna inconclusive.
---
@specs/steps/prosa-spec-code-drift-step-5.md
@specs/prosa-spec-code-drift.md
```
