---
schemaVersion: 2.0.0
changeType: security
id: spec-prosa-spec-code-drift-step-6
sequence: 6
specId: spec-prosa-spec-code-drift
source: {path: specs/steps/prosa-spec-code-drift-step-6.md, hash: 2abb7bfa7bf6d293036faf91e0ff34d777fe716dea3c3ec1a303c69af4b3b5f6, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
goal: Capturar snapshot seguro de paths exatos e produzir artifact de drift sem valores brutos.
boundaries: {inScope: [owns=captura confinada e artifact sanitizado, invariant=até cinco paths sem symlink TOCTOU ou valores brutos, allowedDependencies=step 5], outOfScope: [doesNotOwn=state recovery phase e enablement], maxLogicalFiles: 5}
dependsOn: [spec-prosa-spec-code-drift-step-5]
predictedFiles: [scripts/workflow/lib/local-adapter.cjs, scripts/workflow/lib/artifacts.cjs, scripts/workflow/test-adapter.cjs, scripts/workflow/test-artifacts.cjs]
allowedAreas: [scripts/workflow/lib, scripts/workflow/test-adapter.cjs, scripts/workflow/test-artifacts.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-spec-code-drift.md, stepPath: specs/steps/prosa-spec-code-drift-step-6.md, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0, implementationNoteIds: [NOTE-02, NOTE-05, NOTE-06]}
acceptanceCriteria:
  - {id: AC-09, evidence: [{id: EVIDENCE-09, kind: automated-test, description: "Captura limita paths exatos rejeita symlink e troca concorrente e vincula bytes por hash.", gateId: workflow-tests, resultRef: spec-prosa-spec-code-drift-step-6/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-adapter.cjs scripts/workflow/test-artifacts.cjs}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 180, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: Captura e minimização serão documentadas no Step 14.}
testing: {required: true, gateIds: [workflow-tests], rationale: Confinamento e sanitização exigem fixtures adversariais de filesystem e artifact.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 6: Snapshot seguro e artifact sanitizado

## Goal

Capturar snapshot seguro de paths exatos e produzir artifact de drift sem valores brutos.

## Assumptions

- A primitive factual existente pode ser estendida sem colocar o detector no caminho mutável.

## Risks

- TOCTOU ou vazamento de segredo; mitigar com descritor seguro, hashes, checagem antes/depois e minimização.

## Edge cases

- Symlink no arquivo/ancestral, rename, sexto path, arquivo ausente, troca concorrente e valor de baixa entropia.

## Acceptance Criteria

- Captura fica confinada aos paths previstos e artifacts contêm somente metadados sanitizados e hashes apropriados.

## Tarefas

1. Acrescentar captura segura e read-only em `local-adapter.cjs` com identidade factual antes/depois.
2. Definir artifact restricted e minimizado em `artifacts.cjs`.
3. Cobrir traversal, symlink, troca concorrente, sexto arquivo e ausência de valor bruto nos testes previstos.

## Paths afetados (limite absoluto)

- `scripts/workflow/lib/local-adapter.cjs`
- `scripts/workflow/lib/artifacts.cjs`
- `scripts/workflow/test-adapter.cjs`
- `scripts/workflow/test-artifacts.cjs`

## Fora de Escopo

- Persistir driftCheck no state, recovery, signal, state machine ou enablement.

## Critério de Pronto

- Captura adversarial falha fechado e artifact íntegro não expõe fonte, AST ou valor observado bruto.

## Dependências

- Passo 5.

## Checklist pré-handoff

- [ ] Quatro paths previstos, sem arquivo adicional.
- [ ] Até cinco arquivos lógicos são capturados por path exato.
- [ ] APIs novas continuam dormentes no run real.
- [ ] EVIDENCE-09 passa.

## Prompt de handoff

```text
Implemente APENAS o Passo 6.
Files: @scripts/workflow/lib/local-adapter.cjs @scripts/workflow/lib/artifacts.cjs @scripts/workflow/test-adapter.cjs @scripts/workflow/test-artifacts.cjs
Out of scope: state, recovery, signals, state machine e enablement.
Done criteria: captura confinada e resistente a TOCTOU; artifact restricted sem valores brutos.
---
@specs/steps/prosa-spec-code-drift-step-6.md
@specs/prosa-spec-code-drift.md
```
