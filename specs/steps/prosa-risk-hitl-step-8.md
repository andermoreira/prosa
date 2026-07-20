---
schemaVersion: 1.0.0
id: spec-prosa-risk-hitl-step-8
sequence: 8
specId: spec-prosa-risk-hitl
source: {path: specs/steps/prosa-risk-hitl-step-8.md, hash: c58608260685f0d13e0b11980e1ede7eb1cb90c3bf16d2841d8e09fea6790336, baseSha: f24be0c353e28b370018b65ea3163908fa72e2cb}
goal: Exigir aprovação pós-review de restricted vinculada ao diff exato.
boundaries: {inScope: [owns=checkpoint pós-review e artifact de diff, invariant=aprovação precede acceptance e commit, allowedDependencies=spec-prosa-risk-hitl-step-7], outOfScope: [doesNotOwn=CLI e produtores de sinais], maxLogicalFiles: 5}
dependsOn: [spec-prosa-risk-hitl-step-7]
predictedFiles: [scripts/workflow/lib/orchestrator.cjs, scripts/workflow/lib/local-adapter.cjs, scripts/workflow/test-adapter.cjs, scripts/workflow/test-e2e.cjs]
allowedAreas: [scripts/workflow/lib, scripts/workflow/test-adapter.cjs, scripts/workflow/test-e2e.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-risk-hitl.md, stepPath: specs/steps/prosa-risk-hitl-step-8.md, baseSha: f24be0c353e28b370018b65ea3163908fa72e2cb, implementationNoteIds: [NOTE-01, NOTE-02, NOTE-03]}
acceptanceCriteria:
  - id: AC-05
    evidence:
      - {id: EVIDENCE-17, kind: automated-test, description: "Todo restricted incluindo v1 pausa após review com binding exato.", gateId: workflow-tests, resultRef: spec-prosa-risk-hitl-step-8/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-e2e.cjs}
  - id: AC-13
    evidence:
      - {id: EVIDENCE-18, kind: automated-test, description: "Artifact contém diff completo sanitizado e omite logs e segredos.", gateId: workflow-tests, resultRef: spec-prosa-risk-hitl-step-8/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-adapter.cjs}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: Fluxo pós-review será documentado no Step 13.}
testing: {required: true, gateIds: [workflow-tests], rationale: Binding byte a byte e sanitização exigem E2E.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 8: Aprovação pós-review

## Goal

Exigir aprovação pós-review de `restricted` vinculada ao diff exato.

## Assumptions

- Este handoff v1 percorre o checkpoint pós-review por classificação conservadora.

## Risks

- Aprovar bytes diferentes; revalidar diff, review, attempt e assessment antes de efeitos.

## Edge cases

- Escalada só no review, diff de um byte, retry com diff igual e v1 sem `changeType`.

## Acceptance Criteria

- Todo `restricted` pausa após review e qualquer binding divergente torna a aprovação stale.

## Tarefas

1. Inserir checkpoint pós-review em `scripts/workflow/lib/orchestrator.cjs`.
2. Produzir contexto com diff completo e bindings em `scripts/workflow/lib/local-adapter.cjs`.
3. Cobrir v1, escalada tardia e staleness em `scripts/workflow/test-adapter.cjs` e `scripts/workflow/test-e2e.cjs`.

## Paths afetados (limite absoluto)

- `scripts/workflow/lib/orchestrator.cjs`
- `scripts/workflow/lib/local-adapter.cjs`
- `scripts/workflow/test-adapter.cjs`
- `scripts/workflow/test-e2e.cjs`

## Fora de Escopo

- CLI, produtores de sinais e final review global.

## Critério de Pronto

- E2E prova aprovação pós-review ligada ao diff/review exatos antes de acceptance.

## Dependências

- Passo 7.

## Prompt de handoff

```text
Implemente APENAS o Passo 8.
Files: @scripts/workflow/lib/orchestrator.cjs @scripts/workflow/lib/local-adapter.cjs @scripts/workflow/test-adapter.cjs @scripts/workflow/test-e2e.cjs
Out of scope: CLI, produtores e final review global.
Done criteria: todo restricted, inclusive v1, exige aprovação pós-review ligada ao diff exato.
---
@specs/steps/prosa-risk-hitl-step-8.md
@specs/prosa-risk-hitl.md
```
