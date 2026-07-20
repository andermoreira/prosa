---
schemaVersion: 2.0.0
changeType: permissions
id: spec-prosa-dependency-vetting-step-5
sequence: 5
specId: spec-prosa-dependency-vetting
source: {path: specs/steps/prosa-dependency-vetting-step-5.md, hash: f538ff72812210c2478eda2d0be508b47551d0d133d645df7f3700c54c5ba8e8, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
goal: Remover registry e configuração npm dos executores e reservar os dois hosts ao broker ainda desabilitado.
boundaries: {inScope: [owns=resources capabilities e regressão de egress, invariant=executor nunca alcança npm, allowedDependencies=step 4], outOfScope: [doesNotOwn=vetting materialização e enablement], maxLogicalFiles: 5}
dependsOn: [spec-prosa-dependency-vetting-step-4]
predictedFiles: [workflow/resources.yaml, scripts/workflow/lib/catalogs.cjs, scripts/workflow/lib/sandbox.cjs, scripts/workflow/test-catalogs.cjs, scripts/workflow/test-sandbox.cjs]
allowedAreas: [workflow, scripts/workflow/lib, scripts/workflow/test-catalogs.cjs, scripts/workflow/test-sandbox.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-dependency-vetting.md, stepPath: specs/steps/prosa-dependency-vetting-step-5.md, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0, implementationNoteIds: [NOTE-01, NOTE-06, NOTE-08]}
acceptanceCriteria:
  - {id: AC-19, evidence: [{id: EVIDENCE-219, kind: automated-test, description: "Executores não herdam npm config, proxy, CA, HOME, cache ou TMP reais.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-5/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-sandbox.cjs}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: Resources e troubleshooting serão documentados no Step 20.}
testing: {required: true, gateIds: [workflow-tests], rationale: Remoção de capacidade exige regressão de catálogo e sandbox.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 5: Remoção de registry dos executores

## Goal
Garantir que apenas o broker dedicado, ainda desabilitado, possa receber os hosts npm aprovados.

## Assumptions
- Drift concluído e bootstrap restrito ao hash/baseSha/IDs desta feature.
- A remoção antecede qualquer enablement de vetting ou materialização.

## Risks
- Resource indireto manter egress npm; validar catálogo normalizado completo.

## Edge cases
- Proxy/CA env, wildcard, host por redirect, config herdada e cache offline.

## Acceptance Criteria
- AC-19 e matriz de recursos provam ambiente fechado e ausência de npm nos executores.

## Tarefas
1. Remover hosts/config npm dos resources de executor.
2. Reservar hosts exatos ao resource broker sem ativá-lo no orchestrator.
3. Testar catálogo, redirects, env e sandbox sem fallback.

## Paths afetados (limite absoluto)
- `workflow/resources.yaml`
- `scripts/workflow/lib/catalogs.cjs`
- `scripts/workflow/lib/sandbox.cjs`
- `scripts/workflow/test-catalogs.cjs`
- `scripts/workflow/test-sandbox.cjs`

## Fora de Escopo
- Executar broker, npm, agente, gate ou materialização produtiva.

## Critério de Pronto
- Nenhum executor alcança npm ou herda configuração capaz de alterar resolução.

## Dependências
- Passo 4 e drift concluído.

## Checklist pré-handoff
- [ ] Cinco arquivos totais?
- [ ] Dois hosts exatos apenas no broker?
- [ ] Nenhum enablement produtivo?

## Prompt de handoff
```text
Implemente APENAS o Passo 5.
Files: @workflow/resources.yaml @scripts/workflow/lib/catalogs.cjs @scripts/workflow/lib/sandbox.cjs @scripts/workflow/test-catalogs.cjs @scripts/workflow/test-sandbox.cjs
Out of scope: executar broker, npm, materialização, agente ou gate produtivo.
Done criteria: registry/config npm removidos de todos os executores, broker ainda disabled.
---
@specs/steps/prosa-dependency-vetting-step-5.md
@specs/prosa-dependency-vetting.md
```
