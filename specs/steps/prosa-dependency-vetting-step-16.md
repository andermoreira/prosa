---
schemaVersion: 2.0.0
changeType: feature
id: spec-prosa-dependency-vetting-step-16
sequence: 16
specId: spec-prosa-dependency-vetting
source: {path: specs/steps/prosa-dependency-vetting-step-16.md, hash: b6216d2bcd9702037b27ee6ddb2cd9a284890c05ef5623e5ea4f5fdec6dca68c, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
goal: Materializar, selar e descartar operações incompletas com adapters produtivos desabilitados.
boundaries: {inScope: [owns=npm ci integrity signatures seal completion e discard, invariant=sem completion descarta attempt inteiro, allowedDependencies=step 15], outOfScope: [doesNotOwn=lifecycle classification signals e enablement], maxLogicalFiles: 5}
dependsOn: [spec-prosa-dependency-vetting-step-15]
predictedFiles: [scripts/workflow/lib/dependency-broker.cjs, scripts/workflow/lib/local-adapter.cjs, scripts/workflow/lib/runtime.cjs, scripts/workflow/test-dependency-broker.cjs, scripts/workflow/test-adapter.cjs]
allowedAreas: [scripts/workflow/lib, scripts/workflow/test-dependency-broker.cjs, scripts/workflow/test-adapter.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-dependency-vetting.md, stepPath: specs/steps/prosa-dependency-vetting-step-16.md, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0, implementationNoteIds: [NOTE-01, NOTE-02, NOTE-07, NOTE-08]}
acceptanceCriteria:
  - {id: AC-32, evidence: [{id: EVIDENCE-232, kind: automated-test, description: "Completion sucede npm ci, checks e seal; ausência descarta attempt.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-16/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-dependency-broker.cjs}]}
  - {id: AC-33, evidence: [{id: EVIDENCE-233, kind: automated-test, description: "Crash pós-npm-ci pré-state descarta worktree/node_modules integralmente.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-16/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-adapter.cjs}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: Materialização e recovery serão documentados no Step 20.}
testing: {required: true, gateIds: [workflow-tests], rationale: Efeitos parciais exigem fault injection e descarte completo.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 16: Materialização disabled
## Goal
Provar instalação, checks, seal e descarte sem liberar agentes ou gates.
## Assumptions
- Drift concluído; bootstrap exato; adapters permanecem disabled em todos os caminhos.
## Risks
- Árvore parcial parecer completa; autoridade exclusiva do completion record.
## Edge cases
- Crash no primeiro byte, durante npm ci, após npm ci e seal incompleto.
## Acceptance Criteria
- AC-32 e AC-33 passam sem hash-tree inference.
## Tarefas
1. Materializar bytes exatos e executar npm ci sem scripts.
2. Verificar integrity/signatures e aplicar seal antes do completion.
3. Descartar operation incompleta e impedir local-adapter de liberar processos.
## Paths afetados (limite absoluto)
- `scripts/workflow/lib/dependency-broker.cjs`
- `scripts/workflow/lib/local-adapter.cjs`
- `scripts/workflow/lib/runtime.cjs`
- `scripts/workflow/test-dependency-broker.cjs`
- `scripts/workflow/test-adapter.cjs`
## Fora de Escopo
- Lifecycle, signals, shadow enablement e produção.
## Critério de Pronto
- Completion é única prova e todo parcial é descartado.
## Dependências
- Passo 15 e drift concluído.
## Checklist pré-handoff
- [ ] Cinco arquivos? [ ] Adapters disabled? [ ] Crash pós-ci coberto?
## Prompt de handoff
```text
Implemente APENAS o Passo 16.
Files: @scripts/workflow/lib/dependency-broker.cjs @scripts/workflow/lib/local-adapter.cjs @scripts/workflow/lib/runtime.cjs @scripts/workflow/test-dependency-broker.cjs @scripts/workflow/test-adapter.cjs
Out of scope: lifecycle, signals e enablement.
Done criteria: materialização/selagem/descarte provados com adapters disabled.
---
@specs/steps/prosa-dependency-vetting-step-16.md
@specs/prosa-dependency-vetting.md
```
