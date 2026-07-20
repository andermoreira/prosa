---
schemaVersion: 2.0.0
changeType: feature
id: spec-prosa-spec-code-drift-step-3
sequence: 3
specId: spec-prosa-spec-code-drift
source: {path: specs/steps/prosa-spec-code-drift-step-3.md, hash: b84046ad6a25c85265b4afeec9e38ac095931932a38aae32a93dca688be027fe, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
goal: Implementar representação canônica própria e o detector built-in node-symbol em modo dormente.
boundaries: {inScope: [owns=domínio canônico e node-symbol, invariant=sem execução resolução ou persistência de AST, allowedDependencies=step 2], outOfScope: [doesNotOwn=structured data OpenAPI worker e wiring], maxLogicalFiles: 5}
dependsOn: [spec-prosa-spec-code-drift-step-2]
predictedFiles: [scripts/workflow/lib/spec-code-drift.cjs, scripts/workflow/test-spec-code-drift.cjs]
allowedAreas: [scripts/workflow/lib, scripts/workflow/test-spec-code-drift.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-spec-code-drift.md, stepPath: specs/steps/prosa-spec-code-drift-step-3.md, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0, implementationNoteIds: [NOTE-01, NOTE-02, NOTE-06]}
acceptanceCriteria:
  - {id: AC-04, evidence: [{id: EVIDENCE-04, kind: automated-test, description: "Dispatcher fechado aceita somente assertions built-in autorizadas.", gateId: workflow-tests, resultRef: spec-prosa-spec-code-drift-step-3/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-spec-code-drift.cjs}]}
  - {id: AC-08, evidence: [{id: EVIDENCE-08, kind: automated-test, description: "Saída canônica não contém AST nem fonte integral.", gateId: workflow-tests, resultRef: spec-prosa-spec-code-drift-step-3/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-spec-code-drift.cjs}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 180, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: Matriz e detectores serão documentados nos Steps 1 e 14.}
testing: {required: true, gateIds: [workflow-tests], rationale: Canonicalização e dispatch fechado exigem fixtures determinísticas.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 3: Representação canônica e node-symbol

## Goal

Implementar representação canônica própria e o detector built-in `node-symbol` em modo dormente.

## Assumptions

- A matriz e os limites aprováveis vêm do Step 1; o módulo não será chamado pelo orchestrator.

## Risks

- Transformar o domínio em AST persistida; mitigar expondo somente fatos normalizados e limitados.

## Edge cases

- Export default anônimo, reexport local, overload, destructuring, alias e `module.exports` calculado.

## Acceptance Criteria

- O dispatcher é fechado e `node-symbol` retorna fatos canônicos ou `inconclusive`, sem executar código.

## Tarefas

1. Criar `scripts/workflow/lib/spec-code-drift.cjs` com canonicalização e dispatch built-in fechado.
2. Implementar `node-symbol` no subconjunto aprovado pelo protótipo.
3. Cobrir casos positivos, negativos e inconclusivos em `scripts/workflow/test-spec-code-drift.cjs`.

## Paths afetados (limite absoluto)

- `scripts/workflow/lib/spec-code-drift.cjs`
- `scripts/workflow/test-spec-code-drift.cjs`

## Fora de Escopo

- Structured data, OpenAPI, worker, captura, state e integração com runs reais.

## Critério de Pronto

- Testes provam dispatch fechado, saída canônica mínima e ausência de import, execução e resolução global.

## Dependências

- Passo 2.

## Checklist pré-handoff

- [ ] Dois paths previstos, sem arquivo adicional.
- [ ] Nenhuma AST ou fonte integral é persistida.
- [ ] Módulo permanece sem wiring mutável.
- [ ] EVIDENCE-04 e EVIDENCE-08 passam.

## Prompt de handoff

```text
Implemente APENAS o Passo 3.
Files: @scripts/workflow/lib/spec-code-drift.cjs @scripts/workflow/test-spec-code-drift.cjs
Out of scope: structured-data, OpenAPI, worker, captura, state e wiring.
Done criteria: node-symbol e representação canônica testados, sem AST persistida ou execução de input.
---
@specs/steps/prosa-spec-code-drift-step-3.md
@specs/prosa-spec-code-drift.md
```
