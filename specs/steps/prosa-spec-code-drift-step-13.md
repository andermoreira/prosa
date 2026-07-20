---
schemaVersion: 2.0.0
changeType: test
id: spec-prosa-spec-code-drift-step-13
sequence: 13
specId: spec-prosa-spec-code-drift
source: {path: specs/steps/prosa-spec-code-drift-step-13.md, hash: c6ea6070c963cac4e1d4528abd77a34c932d9b7aca6f70fcf1a5ebc597ca40ab, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
goal: Cobrir em e2e shadow compatibilidade, rename, inconclusive, retry alinhado, crash e entradas adversariais.
boundaries: {inScope: [owns=cobertura e2e e adversarial integrada, invariant=testes não habilitam enforcement real, allowedDependencies=step 12], outOfScope: [doesNotOwn=correções de arquitetura docs e enablement], maxLogicalFiles: 5}
dependsOn: [spec-prosa-spec-code-drift-step-12]
predictedFiles: [scripts/workflow/test-e2e.cjs, scripts/workflow/test-adapter.cjs]
allowedAreas: [scripts/workflow/test-e2e.cjs, scripts/workflow/test-adapter.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-spec-code-drift.md, stepPath: specs/steps/prosa-spec-code-drift-step-13.md, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0, implementationNoteIds: [NOTE-02, NOTE-03, NOTE-04, NOTE-05, NOTE-06]}
acceptanceCriteria:
  - {id: AC-20, evidence: [{id: EVIDENCE-20, kind: automated-test, description: "E2E adversarial cobre confinamento bombs timeout troca concorrente refs YAML e parser com fail-closed.", gateId: workflow-tests, resultRef: spec-prosa-spec-code-drift-step-13/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-e2e.cjs scripts/workflow/test-adapter.cjs}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 180, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: Este step altera somente testes; docs vêm no Step 14.}
testing: {required: true, gateIds: [workflow-tests], rationale: O objetivo do step é fechar a matriz e2e e adversarial antes do rollout.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 13: Cobertura e2e e adversarial

## Goal

Cobrir em e2e shadow compatibilidade, rename, inconclusive, retry alinhado, crash e entradas adversariais.

## Assumptions

- Todos os componentes existem por seams de teste e continuam dormentes em runs reais.

## Risks

- Testes validarem apenas módulos isolados; mitigar com cenários completos e bindings factuais.

## Edge cases

- Traversal, symlink, sexto arquivo, bombs, timeout, TOCTOU, `$ref` remoto/cíclico, YAML ambíguo e parser malformado.

## Acceptance Criteria

- A matriz e2e cobre caminhos positivos, negativos, recovery e ataques, sempre com fail-closed e sem valores brutos.

## Tarefas

1. Cobrir v1/v2 diagnóstico e v3 shadow em `test-e2e.cjs`.
2. Cobrir rename, inconclusive, retry alinhado e janelas de crash.
3. Completar casos adversariais de captura/artifact em `test-adapter.cjs`.

## Paths afetados (limite absoluto)

- `scripts/workflow/test-e2e.cjs`
- `scripts/workflow/test-adapter.cjs`

## Fora de Escopo

- Alterar módulos de produção, documentação, switch de rollout ou exceção bootstrap.

## Critério de Pronto

- Todos os cenários passam no gate e provam que o enforcement ainda está desligado fora do harness shadow.

## Dependências

- Passo 12.

## Checklist pré-handoff

- [ ] Dois paths de teste previstos, sem arquivo adicional.
- [ ] Cenários usam bindings por attempt e artifacts sanitizados.
- [ ] Nenhum teste depende de rede ou timing não controlado.
- [ ] EVIDENCE-20 passa.

## Prompt de handoff

```text
Implemente APENAS o Passo 13.
Files: @scripts/workflow/test-e2e.cjs @scripts/workflow/test-adapter.cjs
Out of scope: módulos de produção, docs, enablement e mudança da exceção bootstrap.
Done criteria: matriz e2e/adversarial completa passa em shadow e confirma fail-closed sem ativação real.
---
@specs/steps/prosa-spec-code-drift-step-13.md
@specs/prosa-spec-code-drift.md
```
