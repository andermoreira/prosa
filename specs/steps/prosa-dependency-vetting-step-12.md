---
schemaVersion: 2.0.0
changeType: security
id: spec-prosa-dependency-vetting-step-12
sequence: 12
specId: spec-prosa-dependency-vetting
source: {path: specs/steps/prosa-dependency-vetting-step-12.md, hash: ded9da655d545eb2340fcf05c2dec2ab49c4692c35d0a843872960474d6bfeed, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
goal: Validar audit, signatures, attestations e provenance com npm e trust pinados.
boundaries: {inScope: [owns=report validators e trust verification, invariant=report inválido é inconclusive ou blocked nunca success, allowedDependencies=step 11], outOfScope: [doesNotOwn=candidate generation state e enablement], maxLogicalFiles: 5}
dependsOn: [spec-prosa-dependency-vetting-step-11]
predictedFiles: [scripts/workflow/lib/dependency-reports.cjs, scripts/workflow/lib/dependency-broker.cjs, scripts/workflow/test-dependency-reports.cjs, scripts/workflow/test-dependency-broker.cjs]
allowedAreas: [scripts/workflow/lib, scripts/workflow/test-dependency-reports.cjs, scripts/workflow/test-dependency-broker.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-dependency-vetting.md, stepPath: specs/steps/prosa-dependency-vetting-step-12.md, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0, implementationNoteIds: [NOTE-03, NOTE-04, NOTE-08]}
acceptanceCriteria:
  - {id: AC-27, evidence: [{id: EVIDENCE-227, kind: automated-test, description: "Signature e provenance possuem estados e efeitos separados e fail-closed.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-12/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-dependency-reports.cjs}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: Reports e trust serão documentados no Step 20.}
testing: {required: true, gateIds: [workflow-tests], rationale: Validators e trust exigem fixtures adversariais pinadas.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 12: Reports e trust offline
## Goal
Interpretar reports pinados e verificar trust sem alegar garantias inexistentes.
## Assumptions
- Drift concluído; bootstrap exato; broker produtivo permanece desligado.
## Risks
- JSON sintático mascarar erro; validar payload local, counts, exit e digest.
## Edge cases
- Error JSON, truncamento, missing/invalid, attestation sem coverage e trust stale.
## Acceptance Criteria
- AC-27 passa; contratos prototipados de AC-22/26/28/53 não sofrem regressão.
## Tarefas
1. Implementar validators presos à distribuição npm.
2. Separar signature, provenance e attestations por package/location.
3. Cobrir trust offline e host extra como blocker.
## Paths afetados (limite absoluto)
- `scripts/workflow/lib/dependency-reports.cjs`
- `scripts/workflow/lib/dependency-broker.cjs`
- `scripts/workflow/test-dependency-reports.cjs`
- `scripts/workflow/test-dependency-broker.cjs`
## Fora de Escopo
- State, materialização e enablement.
## Critério de Pronto
- Reports incompletos nunca viram sucesso e trust permanece offline/pinado.
## Dependências
- Passo 11 e drift concluído.
## Checklist pré-handoff
- [ ] Quatro arquivos? [ ] Validators pinados? [ ] Broker produtivo disabled?
## Prompt de handoff
```text
Implemente APENAS o Passo 12.
Files: @scripts/workflow/lib/dependency-reports.cjs @scripts/workflow/lib/dependency-broker.cjs @scripts/workflow/test-dependency-reports.cjs @scripts/workflow/test-dependency-broker.cjs
Out of scope: state, materialização e enablement.
Done criteria: reports/trust falham fechado com semântica aprovada.
---
@specs/steps/prosa-dependency-vetting-step-12.md
@specs/prosa-dependency-vetting.md
```
