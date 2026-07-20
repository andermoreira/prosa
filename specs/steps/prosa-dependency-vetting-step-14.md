---
schemaVersion: 2.0.0
changeType: architecture
id: spec-prosa-dependency-vetting-step-14
sequence: 14
specId: spec-prosa-dependency-vetting
source: {path: specs/steps/prosa-dependency-vetting-step-14.md, hash: 298ee51b23a0d0274553b67252e7508eb4c29926bc4000c0eaa1f3ec64e7358f, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
goal: Definir state v5, completion autocontido e artifacts remotos minimizados.
boundaries: {inScope: [owns=state dependency records e artifact minimization, invariant=ref e hash são inseparáveis, allowedDependencies=step 13], outOfScope: [doesNotOwn=authorization recovery materialização enablement], maxLogicalFiles: 5}
dependsOn: [spec-prosa-dependency-vetting-step-13]
predictedFiles: [schemas/state.schema.json, scripts/workflow/lib/dependency-vetting.cjs, scripts/workflow/lib/artifacts.cjs, scripts/workflow/test-state.cjs, scripts/workflow/test-artifacts.cjs]
allowedAreas: [schemas, scripts/workflow/lib, scripts/workflow/test-state.cjs, scripts/workflow/test-artifacts.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-dependency-vetting.md, stepPath: specs/steps/prosa-dependency-vetting-step-14.md, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0, implementationNoteIds: [NOTE-03, NOTE-05, NOTE-07, NOTE-08]}
acceptanceCriteria:
  - {id: AC-34, evidence: [{id: EVIDENCE-234, kind: contract-test, description: "State/bindings exigem hashes e estados técnicos completos.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-14/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-state.cjs}]}
  - {id: AC-35, evidence: [{id: EVIDENCE-235, kind: automated-test, description: "Artifacts remotos são restricted, minimizados e nunca entram em prompt.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-14/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-artifacts.cjs}]}
  - {id: AC-54, evidence: [{id: EVIDENCE-254, kind: contract-test, description: "Completion exige operação, proofs, decisions e worktree identity autocontidos.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-14/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-state.cjs}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: State e artifacts serão documentados no Step 20.}
testing: {required: true, gateIds: [workflow-tests], rationale: Evolução incompatível exige schema e corruption tests.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 14: State v5 e completion
## Goal
Representar vetting/materialização e provas sem habilitar seu uso produtivo.
## Assumptions
- Drift/state v4 concluídos; bootstrap exato; state v5 permanece sem orchestrator enablement.
## Risks
- State inflar metadata ou aceitar ref sem hash; schema fechado e artifacts externos minimizados.
## Edge cases
- Artifact órfão, ref corrompida, marker no-approval e completion integrated/local.
## Acceptance Criteria
- AC-34, AC-35 e AC-54 passam em contratos positivos e negativos.
## Tarefas
1. Evoluir state v4 para v5 com resumos e completions próprios.
2. Exigir pares ref/hash e marker explícito mutuamente exclusivo.
3. Minimizar artifacts e bloquear conteúdo remoto em prompts.
## Paths afetados (limite absoluto)
- `schemas/state.schema.json`
- `scripts/workflow/lib/dependency-vetting.cjs`
- `scripts/workflow/lib/artifacts.cjs`
- `scripts/workflow/test-state.cjs`
- `scripts/workflow/test-artifacts.cjs`
## Fora de Escopo
- Authorization, materialização e enablement.
## Critério de Pronto
- State v5 é fechado, autocontido e sem metadata excessiva.
## Dependências
- Passo 13 e os 15 steps de drift.
## Checklist pré-handoff
- [ ] Cinco arquivos? [ ] Ref/hash inseparáveis? [ ] State sem enablement?
## Prompt de handoff
```text
Implemente APENAS o Passo 14.
Files: @schemas/state.schema.json @scripts/workflow/lib/dependency-vetting.cjs @scripts/workflow/lib/artifacts.cjs @scripts/workflow/test-state.cjs @scripts/workflow/test-artifacts.cjs
Out of scope: authorization, materialização e enablement.
Done criteria: state v5/completion/artifacts passam contratos fechados.
---
@specs/steps/prosa-dependency-vetting-step-14.md
@specs/prosa-dependency-vetting.md
```
