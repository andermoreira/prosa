---
schemaVersion: 2.0.0
changeType: feature
id: spec-prosa-dependency-vetting-step-13
sequence: 13
specId: spec-prosa-dependency-vetting
source: {path: specs/steps/prosa-dependency-vetting-step-13.md, hash: 5531ef9ddafef3e9a43eb468bf6d0a4243d769f4aa3b125e42bcf3d3d5d2d19a, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
goal: Gerar e revalidar candidate exato com SRI forte no scratch, mantendo enablement desligado.
boundaries: {inScope: [owns=planAndVet candidate generation e final raw validation, invariant=candidate completo antecede fast path HITL e worktree, allowedDependencies=step 12], outOfScope: [doesNotOwn=state materialização e orchestrator], maxLogicalFiles: 5}
dependsOn: [spec-prosa-dependency-vetting-step-12]
predictedFiles: [scripts/workflow/lib/dependency-broker.cjs, scripts/workflow/lib/contracts.cjs, scripts/workflow/test-dependency-broker.cjs, scripts/workflow/test-contracts.cjs]
allowedAreas: [scripts/workflow/lib, scripts/workflow/test-dependency-broker.cjs, scripts/workflow/test-contracts.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-dependency-vetting.md, stepPath: specs/steps/prosa-dependency-vetting-step-13.md, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0, implementationNoteIds: [NOTE-02, NOTE-05, NOTE-08]}
acceptanceCriteria:
  - {id: AC-21, evidence: [{id: EVIDENCE-221, kind: automated-test, description: "planAndVet ordena após lock/parent e antes de HITL/worktree em harness disabled.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-13/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-dependency-broker.cjs}]}
  - {id: AC-25, evidence: [{id: EVIDENCE-225, kind: contract-test, description: "Plan registra somente integrityMetadataConsistent sem fabricar verificação pós-install.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-13/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-contracts.cjs}]}
  - {id: AC-51, evidence: [{id: EVIDENCE-251, kind: automated-test, description: "Fast path só é avaliado após candidate raw completo e hashes derivados.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-13/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-dependency-broker.cjs}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: Ordem operacional será documentada no Step 20.}
testing: {required: true, gateIds: [workflow-tests], rationale: Candidate authority e ordem exigem testes de harness.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 13: Candidate exato
## Goal
Concluir `planAndVet` em scratch sem criar worktree ou liberar processo produtivo.
## Assumptions
- Drift concluído; bootstrap exato; toda integração real permanece disabled.
## Risks
- Fast path antes do graph completo; ordenar explicitamente as fases.
## Edge cases
- Candidate collateral, redirect final, SRI fraca, optional platform e re-resolution.
## Acceptance Criteria
- AC-21, AC-25 e AC-51 passam no harness desabilitado.
## Tarefas
1. Gerar candidate com npm/config pinados em scratch.
2. Revalidar raw manifest/lock/graph/source/SRI integralmente.
3. Produzir hashes e classificação sem criar attempt/worktree.
## Paths afetados (limite absoluto)
- `scripts/workflow/lib/dependency-broker.cjs`
- `scripts/workflow/lib/contracts.cjs`
- `scripts/workflow/test-dependency-broker.cjs`
- `scripts/workflow/test-contracts.cjs`
## Fora de Escopo
- State v5, materialização e enablement.
## Critério de Pronto
- Candidate persistível é exato, validado e não influencia runs reais.
## Dependências
- Passo 12 e drift concluído.
## Checklist pré-handoff
- [ ] Quatro arquivos? [ ] Fast path após hashes? [ ] Zero worktree real?
## Prompt de handoff
```text
Implemente APENAS o Passo 13.
Files: @scripts/workflow/lib/dependency-broker.cjs @scripts/workflow/lib/contracts.cjs @scripts/workflow/test-dependency-broker.cjs @scripts/workflow/test-contracts.cjs
Out of scope: state, materialização e enablement.
Done criteria: candidate exato é gerado/revalidado em scratch sem worktree.
---
@specs/steps/prosa-dependency-vetting-step-13.md
@specs/prosa-dependency-vetting.md
```
