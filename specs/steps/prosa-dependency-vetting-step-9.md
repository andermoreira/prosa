---
schemaVersion: 2.0.0
changeType: security
id: spec-prosa-dependency-vetting-step-9
sequence: 9
specId: spec-prosa-dependency-vetting
source: {path: specs/steps/prosa-dependency-vetting-step-9.md, hash: a413017cf0d19ae73d381876fc68cbf85459737562573a0671cdff6007273ae7, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
goal: Validar raw parent, baseline e requests de forma symlink/TOCTOU-safe antes de qualquer npm.
boundaries: {inScope: [owns=source preflight e semantic authority, invariant=nenhuma invocação npm precede validação, allowedDependencies=step 8], outOfScope: [doesNotOwn=graph metadata reports e materialização], maxLogicalFiles: 5}
dependsOn: [spec-prosa-dependency-vetting-step-8]
predictedFiles: [scripts/workflow/lib/dependency-broker.cjs, scripts/workflow/lib/contracts.cjs, scripts/workflow/test-dependency-broker.cjs, scripts/workflow/test-contracts.cjs]
allowedAreas: [scripts/workflow/lib, scripts/workflow/test-dependency-broker.cjs, scripts/workflow/test-contracts.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-dependency-vetting.md, stepPath: specs/steps/prosa-dependency-vetting-step-9.md, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0, implementationNoteIds: [NOTE-01, NOTE-05, NOTE-08]}
acceptanceCriteria:
  - {id: AC-03, evidence: [{id: EVIDENCE-203, kind: automated-test, description: "Semantic authority bloqueia manifest e lock collateral.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-9/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-contracts.cjs}]}
  - {id: AC-50, evidence: [{id: EVIDENCE-250, kind: automated-test, description: "Preflight raw bloqueia source, config, path e TOCTOU antes de npm.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-9/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-dependency-broker.cjs}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: Erros de preflight serão documentados no Step 20.}
testing: {required: true, gateIds: [workflow-tests], rationale: Preflight é barreira anterior ao package manager.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 9: Source preflight
## Goal
Recusar inputs inseguros antes da primeira invocação npm, inclusive no baseline.
## Assumptions
- Drift concluído; bootstrap exato; broker produtivo continua desligado.
## Risks
- npm normalizar input malicioso antes da inspeção; ler raw por handles estáveis.
## Edge cases
- Symlink/inode swap, redirect, Git/file URL, `.npmrc`, workspace, link e bundled.
## Acceptance Criteria
- AC-03 e AC-50 bloqueiam antes de npm com códigos estáveis.
## Tarefas
1. Implementar preflight raw e semantic authority.
2. Proteger identidade dos arquivos contra symlink/TOCTOU.
3. Cobrir baseline e requests sem chamar npm nos casos negativos.
## Paths afetados (limite absoluto)
- `scripts/workflow/lib/dependency-broker.cjs`
- `scripts/workflow/lib/contracts.cjs`
- `scripts/workflow/test-dependency-broker.cjs`
- `scripts/workflow/test-contracts.cjs`
## Fora de Escopo
- Graph, metadata, reports, materialização e enablement.
## Critério de Pronto
- Nenhum input proibido alcança npm.
## Dependências
- Passo 8 e drift concluído.
## Checklist pré-handoff
- [ ] Quatro arquivos? [ ] Casos negativos provam zero npm? [ ] Broker disabled?
## Prompt de handoff
```text
Implemente APENAS o Passo 9.
Files: @scripts/workflow/lib/dependency-broker.cjs @scripts/workflow/lib/contracts.cjs @scripts/workflow/test-dependency-broker.cjs @scripts/workflow/test-contracts.cjs
Out of scope: graph, reports, materialização e enablement.
Done criteria: preflight raw/TOCTOU-safe antecede qualquer npm.
---
@specs/steps/prosa-dependency-vetting-step-9.md
@specs/prosa-dependency-vetting.md
```
