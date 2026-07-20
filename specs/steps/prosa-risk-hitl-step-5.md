---
schemaVersion: 1.0.0
id: spec-prosa-risk-hitl-step-5
sequence: 5
specId: spec-prosa-risk-hitl
source: {path: specs/steps/prosa-risk-hitl-step-5.md, hash: 18d567500b46428cc1dca3b809f02c873fcca9c6f9c77857aabb396384395f29, baseSha: f24be0c353e28b370018b65ea3163908fa72e2cb}
goal: Persistir assessments, requests, decisions e bindings single-use.
boundaries: {inScope: [owns=modelo persistido e lógica pura de decisão, invariant=decisão single-use e stale falha fechado, allowedDependencies=steps 1 2 e 3], outOfScope: [doesNotOwn=transições HITL e CLI], maxLogicalFiles: 5}
dependsOn: [spec-prosa-risk-hitl-step-1, spec-prosa-risk-hitl-step-2, spec-prosa-risk-hitl-step-3]
predictedFiles: [schemas/state.schema.json, scripts/workflow/lib/runtime.cjs, scripts/workflow/test-state.cjs, scripts/workflow/lib/hitl-decision.cjs, scripts/workflow/test-hitl-decision.cjs]
allowedAreas: [schemas, scripts/workflow/lib, scripts/workflow/test-state.cjs, scripts/workflow/test-hitl-decision.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-risk-hitl.md, stepPath: specs/steps/prosa-risk-hitl-step-5.md, baseSha: f24be0c353e28b370018b65ea3163908fa72e2cb, implementationNoteIds: [NOTE-01, NOTE-02, NOTE-03]}
acceptanceCriteria:
  - id: AC-09
    evidence:
      - {id: EVIDENCE-10, kind: contract-test, description: "State valida assessment versionado requests decisões timestamps bindings e consumo.", gateId: workflow-tests, resultRef: spec-prosa-risk-hitl-step-5/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-state.cjs}
  - id: AC-11
    evidence:
      - {id: EVIDENCE-11, kind: automated-test, description: "Binding divergente classifica decisão como stale sem consumo.", gateId: workflow-tests, resultRef: spec-prosa-risk-hitl-step-5/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-hitl-decision.cjs}
  - id: AC-15
    evidence:
      - {id: EVIDENCE-12, kind: automated-test, description: "Transition ID reconcilia consumo idempotente após crash.", gateId: workflow-tests, resultRef: spec-prosa-risk-hitl-step-5/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-hitl-decision.cjs}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: Modelo persistido será documentado no Step 13.}
testing: {required: true, gateIds: [workflow-tests], rationale: Estado incompatível e single-use exigem testes contratuais.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 5: Estado e bindings

## Goal

Persistir assessments, requests, decisions e bindings single-use.

## Assumptions

- Este handoff v1 será `restricted`; o assessment registra também a versão e o sinal legado.

## Risks

- State permissivo aceitar decisão incompleta; evoluir de modo incompatível e fechado.

## Edge cases

- Replay idêntico, decisão contraditória, request de outro step e crash no consumo.

## Acceptance Criteria

- State registra versão, risco e trilha HITL; lógica distingue `satisfied`, `stale` e `rejected`.

## Tarefas

1. Evoluir `schemas/state.schema.json` com assessment versionado, requests e decisions.
2. Atualizar `scripts/workflow/lib/runtime.cjs` e `scripts/workflow/test-state.cjs` para persistência atômica.
3. Criar `scripts/workflow/lib/hitl-decision.cjs` e `scripts/workflow/test-hitl-decision.cjs` para bindings e consumo single-use.

## Paths afetados (limite absoluto)

- `schemas/state.schema.json`
- `scripts/workflow/lib/runtime.cjs`
- `scripts/workflow/test-state.cjs`
- `scripts/workflow/lib/hitl-decision.cjs`
- `scripts/workflow/test-hitl-decision.cjs`

## Fora de Escopo

- Alterar state machine, checkpoints ou CLI.

## Critério de Pronto

- Schema e testes provam bindings completos, stale e replay idempotente.

## Dependências

- Passos 1, 2 e 3.

## Prompt de handoff

```text
Implemente APENAS o Passo 5.
Files: @schemas/state.schema.json @scripts/workflow/lib/runtime.cjs @scripts/workflow/test-state.cjs @scripts/workflow/lib/hitl-decision.cjs @scripts/workflow/test-hitl-decision.cjs
Out of scope: state machine, checkpoints e CLI.
Done criteria: state versionado suporta bindings single-use, stale e replay idempotente.
---
@specs/steps/prosa-risk-hitl-step-5.md
@specs/prosa-risk-hitl.md
```
