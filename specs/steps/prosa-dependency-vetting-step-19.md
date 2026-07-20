---
schemaVersion: 2.0.0
changeType: test
id: spec-prosa-dependency-vetting-step-19
sequence: 19
specId: spec-prosa-dependency-vetting
source: {path: specs/steps/prosa-dependency-vetting-step-19.md, hash: 9f470d9253604d3ff8f27d67a4c53d5b302341ad90f4ccb7c82660257dea03b2, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
goal: Executar materialização shadow local e integrada sem liberar processo não-broker.
boundaries: {inScope: [owns=shadow baseline change local integrated e e2e disabled, invariant=nenhum agent gate ou materialização produtiva é liberado, allowedDependencies=steps 1 a 18], outOfScope: [doesNotOwn=documentação evidência manual e enablement], maxLogicalFiles: 5}
dependsOn: [spec-prosa-dependency-vetting-step-18]
predictedFiles: [scripts/workflow/lib/dependency-broker.cjs, scripts/workflow/lib/runtime.cjs, scripts/workflow/lib/local-adapter.cjs, scripts/workflow/test-dependency-broker.cjs, scripts/workflow/test-e2e.cjs]
allowedAreas: [scripts/workflow/lib, scripts/workflow/test-dependency-broker.cjs, scripts/workflow/test-e2e.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-dependency-vetting.md, stepPath: specs/steps/prosa-dependency-vetting-step-19.md, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0, implementationNoteIds: [NOTE-01, NOTE-02, NOTE-07, NOTE-08]}
acceptanceCriteria:
  - {id: AC-05, evidence: [{id: EVIDENCE-205, kind: automated-test, description: "Shadow prova ownership e deny-write de manifest lock e node_modules.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-19/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-dependency-broker.cjs}]}
  - {id: AC-41, evidence: [{id: EVIDENCE-241, kind: automated-test, description: "Baseline local shadow cria completion próprio e advisory bloqueia sem signal de mudança.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-19/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-e2e.cjs}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: Resultados shadow serão registrados no Step 21.}
testing: {required: true, gateIds: [workflow-tests], rationale: Shadow e e2e provam integração sem exposição produtiva.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 19: Shadow materialization
## Goal
Exercitar o fluxo completo em shadow sem liberar agentes, gates ou enablement produtivo.
## Assumptions
- Drift concluído; bootstrap exato; feature flags/capabilities mantêm todos os consumidores disabled.
## Risks
- Shadow acidentalmente liberar processo; assertions negativas antes/depois de cada fase.
## Edge cases
- Baseline v3/v4, changed, integrated tree, advisory e completion local reutilizado.
## Acceptance Criteria
- AC-05 e AC-41 passam; AC-42 é revalidado no cenário integrado.
## Tarefas
1. Wirear somente shadow local/integrated no runtime e adapter disabled.
2. Executar baseline/change, completion e ownership sem agente/gate.
3. Cobrir e2e de bloqueio e ausência de side effect produtivo.
## Paths afetados (limite absoluto)
- `scripts/workflow/lib/dependency-broker.cjs`
- `scripts/workflow/lib/runtime.cjs`
- `scripts/workflow/lib/local-adapter.cjs`
- `scripts/workflow/test-dependency-broker.cjs`
- `scripts/workflow/test-e2e.cjs`
## Fora de Escopo
- Documentação, evidência manual e enablement.
## Critério de Pronto
- Shadow prova o fluxo e nenhum processo não-broker é liberado.
## Dependências
- Passos 1 a 18 e drift concluído.
## Checklist pré-handoff
- [ ] Cinco arquivos? [ ] Negative assertions de enablement? [ ] Local/integrated cobertos?
## Prompt de handoff
```text
Implemente APENAS o Passo 19.
Files: @scripts/workflow/lib/dependency-broker.cjs @scripts/workflow/lib/runtime.cjs @scripts/workflow/lib/local-adapter.cjs @scripts/workflow/test-dependency-broker.cjs @scripts/workflow/test-e2e.cjs
Out of scope: docs, evidência manual e enablement.
Done criteria: shadow local/integrated passa sem liberar processos.
---
@specs/steps/prosa-dependency-vetting-step-19.md
@specs/prosa-dependency-vetting.md
```
