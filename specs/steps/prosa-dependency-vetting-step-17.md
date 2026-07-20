---
schemaVersion: 2.0.0
changeType: security
id: spec-prosa-dependency-vetting-step-17
sequence: 17
specId: spec-prosa-dependency-vetting
source: {path: specs/steps/prosa-dependency-vetting-step-17.md, hash: 543fb3b21e4205220f3e6dfbb0fe85c60d2c7006842dbdeed618116ed0e529f3, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
goal: Validar lifecycle de nodes new/changed e baseline sem executar hooks.
boundaries: {inScope: [owns=lifecycle metadata versus installed artifact, invariant=nenhum lifecycle executa, allowedDependencies=step 16], outOfScope: [doesNotOwn=signals remove shadow e enablement], maxLogicalFiles: 5}
dependsOn: [spec-prosa-dependency-vetting-step-16]
predictedFiles: [scripts/workflow/lib/dependency-broker.cjs, scripts/workflow/lib/dependency-vetting.cjs, scripts/workflow/test-dependency-broker.cjs, scripts/workflow/test-dependency-vetting.cjs]
allowedAreas: [scripts/workflow/lib, scripts/workflow/test-dependency-broker.cjs, scripts/workflow/test-dependency-vetting.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-dependency-vetting.md, stepPath: specs/steps/prosa-dependency-vetting-step-17.md, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0, implementationNoteIds: [NOTE-01, NOTE-03, NOTE-08]}
acceptanceCriteria:
  - {id: AC-29, evidence: [{id: EVIDENCE-229, kind: automated-test, description: "Lifecycle nunca executa e divergence/new hook descarta antes do seal.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-17/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-dependency-broker.cjs}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: Lifecycle será documentado no Step 20.}
testing: {required: true, gateIds: [workflow-tests], rationale: Canário comprova que hook não executa em nenhuma fase.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 17: Lifecycle sem execução
## Goal
Comparar metadata e artifact instalado e bloquear hooks novos/alterados sem executá-los.
## Assumptions
- Drift concluído; bootstrap exato; agentes/gates produtivos continuam disabled.
## Risks
- Inspeção disparar package code; ler somente JSON como dado.
## Edge cases
- Hook grandfathered idêntico, hook novo, metadata divergente e baseline completo.
## Acceptance Criteria
- AC-29 passa com canário que detectaria qualquer execução.
## Tarefas
1. Inspecionar lifecycle de new/changed e todos os nodes baseline.
2. Comparar registry, lock, installed artifact e policy.
3. Bloquear divergence/new hook e provar zero execução.
## Paths afetados (limite absoluto)
- `scripts/workflow/lib/dependency-broker.cjs`
- `scripts/workflow/lib/dependency-vetting.cjs`
- `scripts/workflow/test-dependency-broker.cjs`
- `scripts/workflow/test-dependency-vetting.cjs`
## Fora de Escopo
- Signals, remoção, shadow e enablement.
## Critério de Pronto
- Lifecycle é somente inspecionado e divergência descarta operation.
## Dependências
- Passo 16 e drift concluído.
## Checklist pré-handoff
- [ ] Quatro arquivos? [ ] Canário não executa? [ ] Processos disabled?
## Prompt de handoff
```text
Implemente APENAS o Passo 17.
Files: @scripts/workflow/lib/dependency-broker.cjs @scripts/workflow/lib/dependency-vetting.cjs @scripts/workflow/test-dependency-broker.cjs @scripts/workflow/test-dependency-vetting.cjs
Out of scope: signals, shadow e enablement.
Done criteria: lifecycle validado sem execução e divergência bloqueia.
---
@specs/steps/prosa-dependency-vetting-step-17.md
@specs/prosa-dependency-vetting.md
```
