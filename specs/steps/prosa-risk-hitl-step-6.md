---
schemaVersion: 1.0.0
id: spec-prosa-risk-hitl-step-6
sequence: 6
specId: spec-prosa-risk-hitl
source: {path: specs/steps/prosa-risk-hitl-step-6.md, hash: 8ce31a5a129054eb2b228468ba4078cceff5599adf416bc3a41b69b79a13ac2d, baseSha: f24be0c353e28b370018b65ea3163908fa72e2cb}
goal: Adicionar estados HITL reais e precondições de transição.
boundaries: {inScope: [owns=estados de espera e transições HITL, invariant=espera não é falha genérica, allowedDependencies=spec-prosa-risk-hitl-step-5], outOfScope: [doesNotOwn=checkpoints e parsing de decisão], maxLogicalFiles: 5}
dependsOn: [spec-prosa-risk-hitl-step-5]
predictedFiles: [schemas/state.schema.json, scripts/workflow/lib/state-machine.cjs, scripts/workflow/test-state.cjs]
allowedAreas: [schemas/state.schema.json, scripts/workflow/lib, scripts/workflow/test-state.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-risk-hitl.md, stepPath: specs/steps/prosa-risk-hitl-step-6.md, baseSha: f24be0c353e28b370018b65ea3163908fa72e2cb, implementationNoteIds: [NOTE-01, NOTE-02]}
acceptanceCriteria:
  - id: AC-09
    evidence:
      - {id: EVIDENCE-13, kind: contract-test, description: "State machine persiste estados AWAITING e suas precondições.", gateId: workflow-tests, resultRef: spec-prosa-risk-hitl-step-6/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-state.cjs}
  - id: AC-12
    evidence:
      - {id: EVIDENCE-14, kind: automated-test, description: "Rejeição transita somente para retry replan ou abort válidos.", gateId: workflow-tests, resultRef: spec-prosa-risk-hitl-step-6/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-state.cjs}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: Estados serão documentados no Step 13.}
testing: {required: true, gateIds: [workflow-tests], rationale: Toda transição precisa de precondição e teste negativo.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 6: Estados HITL

## Goal

Adicionar estados HITL reais e precondições de transição.

## Assumptions

- Este handoff v1 entra como `restricted` pelo bootstrap conservador, sem autoedição.

## Risks

- Tratar espera como `BLOCKED`; manter projeção `AWAITING_APPROVAL` distinta.

## Edge cases

- Rejeição sem ação, retry sem budget e request stale durante espera.

## Acceptance Criteria

- Esperas pré-exec e pós-review têm transições próprias e fechadas.

## Tarefas

1. Atualizar `schemas/state.schema.json` com estados e projeções HITL.
2. Implementar transições/precondições em `scripts/workflow/lib/state-machine.cjs`.
3. Cobrir caminhos válidos, stale e rejeição em `scripts/workflow/test-state.cjs`.

## Paths afetados (limite absoluto)

- `schemas/state.schema.json`
- `scripts/workflow/lib/state-machine.cjs`
- `scripts/workflow/test-state.cjs`

## Fora de Escopo

- Integrar orchestrator, artifacts ou CLI.

## Critério de Pronto

- A máquina representa ambas as esperas e rejeições sem aliases permissivos.

## Dependências

- Passo 5.

## Prompt de handoff

```text
Implemente APENAS o Passo 6.
Files: @schemas/state.schema.json @scripts/workflow/lib/state-machine.cjs @scripts/workflow/test-state.cjs
Out of scope: orchestrator, artifacts e CLI.
Done criteria: estados HITL e rejeições têm transições reais e fail-closed.
---
@specs/steps/prosa-risk-hitl-step-6.md
@specs/prosa-risk-hitl.md
```
