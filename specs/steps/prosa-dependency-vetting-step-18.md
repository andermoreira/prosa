---
schemaVersion: 2.0.0
changeType: feature
id: spec-prosa-dependency-vetting-step-18
sequence: 18
specId: spec-prosa-dependency-vetting
source: {path: specs/steps/prosa-dependency-vetting-step-18.md, hash: 1ae10b443321da75aae7e39b6d176417fa609cf57c92f4e61b993edd2244a23f, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
goal: Emitir sinais de vetting e remoção pelo agregador HITL existente, sem nova pausa.
boundaries: {inScope: [owns=vetting outcomes para RiskSignal e max classification, invariant=technical block nunca é approval, allowedDependencies=step 17], outOfScope: [doesNotOwn=decision file state machine shadow e enablement], maxLogicalFiles: 5}
dependsOn: [spec-prosa-dependency-vetting-step-17]
predictedFiles: [scripts/workflow/lib/dependency-vetting.cjs, scripts/workflow/lib/risk-signals.cjs, scripts/workflow/test-dependency-vetting.cjs, scripts/workflow/test-risk-signals.cjs]
allowedAreas: [scripts/workflow/lib, scripts/workflow/test-dependency-vetting.cjs, scripts/workflow/test-risk-signals.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-dependency-vetting.md, stepPath: specs/steps/prosa-dependency-vetting-step-18.md, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0, implementationNoteIds: [NOTE-03, NOTE-04, NOTE-08]}
acceptanceCriteria:
  - {id: AC-36, evidence: [{id: EVIDENCE-236, kind: automated-test, description: "Unlisted e heurísticas emitem sinais proporcionais e blocks não são sobrescritos.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-18/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-dependency-vetting.cjs}]}
  - {id: AC-37, evidence: [{id: EVIDENCE-237, kind: automated-test, description: "Vetting usa recordRiskSignals e HITL existente sem nova máquina ou waiver.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-18/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-risk-signals.cjs}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: Relação com HITL será documentada no Step 20.}
testing: {required: true, gateIds: [workflow-tests], rationale: Matriz deve separar sinais de predicados técnicos.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 18: Signals sem nova pausa
## Goal
Projetar resultados revisáveis no HITL existente mantendo blocks técnicos inegociáveis.
## Assumptions
- Drift concluído; bootstrap exato; orchestrator produtivo ainda não consome vetting.
## Risks
- Approval liberar block técnico; separar tipos e precondições.
## Edge cases
- Remove preapproved, downloads unavailable, multiple roots e provenance absent/invalid.
## Acceptance Criteria
- AC-36 e AC-37 passam e restricted mantém post-review existente.
## Tarefas
1. Mapear outcomes para `RiskSignal` existente.
2. Emitir approval mínimo para remove e máximo global.
3. Provar ausência de pausa/state machine/waiver paralelos.
## Paths afetados (limite absoluto)
- `scripts/workflow/lib/dependency-vetting.cjs`
- `scripts/workflow/lib/risk-signals.cjs`
- `scripts/workflow/test-dependency-vetting.cjs`
- `scripts/workflow/test-risk-signals.cjs`
## Fora de Escopo
- Decision file, shadow e enablement.
## Critério de Pronto
- Sinais são monotônicos e technical blocks permanecem absolutos.
## Dependências
- Passo 17 e drift concluído.
## Checklist pré-handoff
- [ ] Quatro arquivos? [ ] Sem HITL paralelo? [ ] Orchestrator disabled?
## Prompt de handoff
```text
Implemente APENAS o Passo 18.
Files: @scripts/workflow/lib/dependency-vetting.cjs @scripts/workflow/lib/risk-signals.cjs @scripts/workflow/test-dependency-vetting.cjs @scripts/workflow/test-risk-signals.cjs
Out of scope: decision file, shadow e enablement.
Done criteria: vetting/removal usam RiskSignal existente sem sobrescrever blocks.
---
@specs/steps/prosa-dependency-vetting-step-18.md
@specs/prosa-dependency-vetting.md
```
