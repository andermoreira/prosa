---
schemaVersion: 1.0.0
id: spec-prosa-risk-hitl-step-10
sequence: 10
specId: spec-prosa-risk-hitl
source: {path: specs/steps/prosa-risk-hitl-step-10.md, hash: 07025a368ba789410225f6976d5e6ef37bbae37080648771f06ee2be77cbe3b0, baseSha: f24be0c353e28b370018b65ea3163908fa72e2cb}
goal: Integrar produtores de sinais de reviewer, retry, escopo e sandbox.
boundaries: {inScope: [owns=produtores e ingestão do envelope, invariant=produtor só eleva e não aprova, allowedDependencies=steps 2 7 8 e 9], outOfScope: [doesNotOwn=drift spec-código e vetting], maxLogicalFiles: 5}
dependsOn: [spec-prosa-risk-hitl-step-2, spec-prosa-risk-hitl-step-7, spec-prosa-risk-hitl-step-8, spec-prosa-risk-hitl-step-9]
predictedFiles: [scripts/workflow/lib/risk-signals.cjs, scripts/workflow/test-risk-signals.cjs, scripts/workflow/lib/orchestrator.cjs, scripts/workflow/lib/local-adapter.cjs, scripts/workflow/test-e2e.cjs]
allowedAreas: [scripts/workflow/lib, scripts/workflow/test-risk-signals.cjs, scripts/workflow/test-e2e.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-risk-hitl.md, stepPath: specs/steps/prosa-risk-hitl-step-10.md, baseSha: f24be0c353e28b370018b65ea3163908fa72e2cb, implementationNoteIds: [NOTE-01, NOTE-03]}
acceptanceCriteria:
  - id: AC-06
    evidence:
      - {id: EVIDENCE-22, kind: automated-test, description: "Finding high eleva v2 autonomous para restricted sem liberar acceptance.", gateId: workflow-tests, resultRef: spec-prosa-risk-hitl-step-10/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-e2e.cjs}
  - id: AC-07
    evidence:
      - {id: EVIDENCE-23, kind: automated-test, description: "Retry e path não previsto elevam sem reduzir o maior nível.", gateId: workflow-tests, resultRef: spec-prosa-risk-hitl-step-10/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-risk-signals.cjs}
  - id: AC-08
    evidence:
      - {id: EVIDENCE-24, kind: automated-test, description: "Produtor fictício entra pelo envelope sem mudar checkpoints.", gateId: workflow-tests, resultRef: spec-prosa-risk-hitl-step-10/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-risk-signals.cjs}
  - id: AC-16
    evidence:
      - {id: EVIDENCE-25, kind: automated-test, description: "Sinal inválido ou adulterado bloqueia com diagnóstico.", gateId: workflow-tests, resultRef: spec-prosa-risk-hitl-step-10/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-risk-signals.cjs}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: Sinais serão documentados no Step 13.}
testing: {required: true, gateIds: [workflow-tests], rationale: Cada produtor e o envelope extensível precisam de regressão.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 10: Produtores de sinais

## Goal

Integrar produtores de sinais de reviewer, retry, escopo e sandbox.

## Assumptions

- Este handoff v1 já nasce `restricted`; o sinal legado permanece separado dos produtores dinâmicos.

## Risks

- Finding high virar override humano; preservar o bloqueio técnico.

## Edge cases

- Sinal duplicado, rank máximo, path permitido não previsto e sandbox coercitivo.

## Acceptance Criteria

- Produtores elevam monotonicamente e uma fonte fictícia não exige mudança central.

## Tarefas

1. Criar `scripts/workflow/lib/risk-signals.cjs` com produtores de review, retry, escopo e sandbox.
2. Criar `scripts/workflow/test-risk-signals.cjs` com fingerprints, duplicatas e produtor fictício.
3. Integrar coleta em `scripts/workflow/lib/orchestrator.cjs`, persistência em `scripts/workflow/lib/local-adapter.cjs` e E2E.

## Paths afetados (limite absoluto)

- `scripts/workflow/lib/risk-signals.cjs`
- `scripts/workflow/test-risk-signals.cjs`
- `scripts/workflow/lib/orchestrator.cjs`
- `scripts/workflow/lib/local-adapter.cjs`
- `scripts/workflow/test-e2e.cjs`

## Fora de Escopo

- Drift spec-código, vetting ou plugins.

## Critério de Pronto

- Testes provam produtores monotônicos e falha fechada para sinal inválido.

## Dependências

- Passos 2, 7, 8 e 9.

## Prompt de handoff

```text
Implemente APENAS o Passo 10.
Files: @scripts/workflow/lib/risk-signals.cjs @scripts/workflow/test-risk-signals.cjs @scripts/workflow/lib/orchestrator.cjs @scripts/workflow/lib/local-adapter.cjs @scripts/workflow/test-e2e.cjs
Out of scope: drift spec-código, vetting e plugins.
Done criteria: produtores elevam pelo envelope e finding high mantém bloqueio técnico.
---
@specs/steps/prosa-risk-hitl-step-10.md
@specs/prosa-risk-hitl.md
```
