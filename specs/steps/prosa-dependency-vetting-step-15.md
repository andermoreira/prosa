---
schemaVersion: 2.0.0
changeType: architecture
id: spec-prosa-dependency-vetting-step-15
sequence: 15
specId: spec-prosa-dependency-vetting
source: {path: specs/steps/prosa-dependency-vetting-step-15.md, hash: a609c6791fe0c3d54f0086ccd4738f97fb96b493356a59c8eb1c0ce01741e100, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
goal: Persistir authorization de materialização atômica e limitar replay à mesma operation fresh.
boundaries: {inScope: [owns=decision binding authorization transition e recovery, invariant=decisão nunca amplia operation, allowedDependencies=step 14], outOfScope: [doesNotOwn=instalação seal e orchestrator enablement], maxLogicalFiles: 5}
dependsOn: [spec-prosa-dependency-vetting-step-14]
predictedFiles: [scripts/workflow/lib/hitl-decision.cjs, scripts/workflow/lib/runtime.cjs, scripts/workflow/lib/artifacts.cjs, scripts/workflow/test-hitl-decision.cjs, scripts/workflow/test-state.cjs]
allowedAreas: [scripts/workflow/lib, scripts/workflow/test-hitl-decision.cjs, scripts/workflow/test-state.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-dependency-vetting.md, stepPath: specs/steps/prosa-dependency-vetting-step-15.md, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0, implementationNoteIds: [NOTE-02, NOTE-03, NOTE-07, NOTE-08]}
acceptanceCriteria:
  - {id: AC-30, evidence: [{id: EVIDENCE-230, kind: automated-test, description: "Authorization é atômica sob lock após revalidation e ligada à decisão/operation.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-15/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-hitl-decision.cjs}]}
  - {id: AC-31, evidence: [{id: EVIDENCE-231, kind: automated-test, description: "Crash reutiliza decisão somente para a mesma operation fresh.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-15/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-state.cjs}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: Recovery será documentado no Step 20.}
testing: {required: true, gateIds: [workflow-tests], rationale: Consumo e replay exigem fault injection.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 15: Authorization e recovery
## Goal
Consumir decisão e autorizar materialização de modo atômico e estritamente scoped.
## Assumptions
- Drift concluído; bootstrap exato; materialização e adapters produtivos continuam disabled.
## Risks
- Crash duplicar approval ou ampliar decisão; usar operationId e binding factual.
## Edge cases
- Crash pré/pós-consumo, TTL expirado, parent/candidate/worktree novo e replay idêntico.
## Acceptance Criteria
- AC-30 e AC-31 passam com fault injection.
## Tarefas
1. Revalidar freshness/bindings sob lock.
2. Persistir authorization ligada a decision e operation.
3. Reconciliar crash sem autorizar outra operação.
## Paths afetados (limite absoluto)
- `scripts/workflow/lib/hitl-decision.cjs`
- `scripts/workflow/lib/runtime.cjs`
- `scripts/workflow/lib/artifacts.cjs`
- `scripts/workflow/test-hitl-decision.cjs`
- `scripts/workflow/test-state.cjs`
## Fora de Escopo
- Instalar, selar, liberar adapter ou habilitar orchestrator.
## Critério de Pronto
- Replay é idempotente somente para a mesma operation fresh.
## Dependências
- Passo 14 e drift concluído.
## Checklist pré-handoff
- [ ] Cinco arquivos? [ ] Fault injection cobre boundaries? [ ] Materialização disabled?
## Prompt de handoff
```text
Implemente APENAS o Passo 15.
Files: @scripts/workflow/lib/hitl-decision.cjs @scripts/workflow/lib/runtime.cjs @scripts/workflow/lib/artifacts.cjs @scripts/workflow/test-hitl-decision.cjs @scripts/workflow/test-state.cjs
Out of scope: instalação, seal e enablement.
Done criteria: authorization/recovery atômicos e operation-scoped.
---
@specs/steps/prosa-dependency-vetting-step-15.md
@specs/prosa-dependency-vetting.md
```
