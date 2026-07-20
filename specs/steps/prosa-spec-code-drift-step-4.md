---
schemaVersion: 2.0.0
changeType: feature
id: spec-prosa-spec-code-drift-step-4
sequence: 4
specId: spec-prosa-spec-code-drift
source: {path: specs/steps/prosa-spec-code-drift-step-4.md, hash: 4dc4bd1682c6f2abcc67f1febc6371685e6eba29c1e9eff0ab0c3c524bf894d1, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
goal: Acrescentar os detectores built-in structured-data e openapi-operation ao domínio dormente.
boundaries: {inScope: [owns=JSON YAML OpenAPI e referências locais, invariant=sem coerção import ou referência remota, allowedDependencies=step 3], outOfScope: [doesNotOwn=worker captura state e wiring], maxLogicalFiles: 5}
dependsOn: [spec-prosa-spec-code-drift-step-3]
predictedFiles: [scripts/workflow/lib/spec-code-drift.cjs, scripts/workflow/test-spec-code-drift.cjs]
allowedAreas: [scripts/workflow/lib, scripts/workflow/test-spec-code-drift.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-spec-code-drift.md, stepPath: specs/steps/prosa-spec-code-drift-step-4.md, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0, implementationNoteIds: [NOTE-01, NOTE-02, NOTE-06]}
acceptanceCriteria:
  - {id: AC-07, evidence: [{id: EVIDENCE-07, kind: automated-test, description: "JSON Pointer e operação OpenAPI local respeitam contratos fechados e recusam referências remotas.", gateId: workflow-tests, resultRef: spec-prosa-spec-code-drift-step-4/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-spec-code-drift.cjs}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 180, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: Documentação consolidada ocorrerá no Step 14.}
testing: {required: true, gateIds: [workflow-tests], rationale: Seletores locais e formatos ambíguos precisam de fixtures adversariais.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 4: Structured data e OpenAPI

## Goal

Acrescentar os detectores built-in `structured-data` e `openapi-operation` ao domínio dormente.

## Assumptions

- A canonicalização e o dispatcher fechado do Step 3 são a única extensão permitida.

## Risks

- Resolver referências externas ou aceitar YAML ambíguo; mitigar com fragmentos locais e parser restrito.

## Edge cases

- Pointer escapado, chave duplicada, alias/tag YAML, multi-documento, `$ref` remoto ou cíclico e response `default`.

## Acceptance Criteria

- JSON/YAML e OpenAPI são comparados localmente, sem coerção ou I/O remoto; ambiguidade resulta `inconclusive`.

## Tarefas

1. Acrescentar `structured-data` com JSON Pointer e expectativas fechadas em `spec-code-drift.cjs`.
2. Acrescentar `openapi-operation` com path, method e fragmentos exclusivamente locais.
3. Cobrir formatos válidos, ambíguos, cíclicos e remotos no teste existente.

## Paths afetados (limite absoluto)

- `scripts/workflow/lib/spec-code-drift.cjs`
- `scripts/workflow/test-spec-code-drift.cjs`

## Fora de Escopo

- Validação OpenAPI completa, `$ref` de arquivo/URL, worker, state e enablement.

## Critério de Pronto

- Os dois detectores passam fixtures locais e nunca classificam entrada ambígua/remota como `aligned`.

## Dependências

- Passo 3.

## Checklist pré-handoff

- [ ] Dois paths previstos, sem arquivo adicional.
- [ ] Dispatcher continua sem plugins ou callbacks autorais.
- [ ] Nenhuma rede ou resolução entre arquivos foi adicionada.
- [ ] EVIDENCE-07 passa.

## Prompt de handoff

```text
Implemente APENAS o Passo 4.
Files: @scripts/workflow/lib/spec-code-drift.cjs @scripts/workflow/test-spec-code-drift.cjs
Out of scope: validação OpenAPI global, refs remotos, worker, state e enablement.
Done criteria: structured-data e openapi-operation locais passam fixtures e ambiguidades ficam inconclusive.
---
@specs/steps/prosa-spec-code-drift-step-4.md
@specs/prosa-spec-code-drift.md
```
