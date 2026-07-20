---
schemaVersion: 1.0.0
id: spec-prosa-risk-hitl-step-1
sequence: 1
specId: spec-prosa-risk-hitl
source: {path: specs/steps/prosa-risk-hitl-step-1.md, hash: 8b890e9b212f4991d5a9eb02c9d09806dd7c483f4f3f104919026daeb1d12594, baseSha: f24be0c353e28b370018b65ea3163908fa72e2cb}
goal: Definir contratos versionados de step v1/v2 e schemas fechados de sinais e decisões.
boundaries: {inScope: [owns=contratos step v1 v2 sinal e decisão, invariant=v1 permanece contrato válido e v2 exige changeType, allowedDependencies=nenhum step anterior], outOfScope: [doesNotOwn=policy classificação persistência e migração de steps], maxLogicalFiles: 5}
dependsOn: []
predictedFiles: [schemas/step.schema.json, schemas/risk-signal.schema.json, schemas/approval-decision.schema.json, scripts/workflow/lib/contracts.cjs, scripts/workflow/test-contracts.cjs]
allowedAreas: [schemas, scripts/workflow/lib, scripts/workflow/test-contracts.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-risk-hitl.md, stepPath: specs/steps/prosa-risk-hitl-step-1.md, baseSha: f24be0c353e28b370018b65ea3163908fa72e2cb, implementationNoteIds: [NOTE-01, NOTE-02, NOTE-03]}
acceptanceCriteria:
  - id: AC-01
    evidence:
      - {id: EVIDENCE-01, kind: contract-test, description: "Schema aceita v1 fechado e exige changeType estruturado em v2.", gateId: workflow-tests, resultRef: spec-prosa-risk-hitl-step-1/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-contracts.cjs}
  - id: AC-16
    evidence:
      - {id: EVIDENCE-02, kind: contract-test, description: "Versão desconhecida e payload inválido de sinal ou decisão falham fechado.", gateId: workflow-tests, resultRef: spec-prosa-risk-hitl-step-1/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-contracts.cjs}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: Contratos executáveis serão explicados no Step 13.}
testing: {required: true, gateIds: [workflow-tests], rationale: Discriminação v1/v2 e schemas fechados exigem fixtures positivas e negativas.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 1: Contratos versionados

## Goal

Definir contratos versionados de step v1/v2 e schemas fechados de sinais e decisões.

## Assumptions

- Este handoff permanece schema v1 no base atual: é bootstrap conservador deliberado e será `restricted` após o rollout, não ausência silenciosa de `changeType`.

## Risks

- Modelar v2 como v1 com campo opcional; mitigar com contratos discriminados por versão.

## Edge cases

- V1 com `behaviorType`, v2 sem `changeType`, versão desconhecida e campos extras.

## Acceptance Criteria

- V1 permanece válido; v2 exige `changeType`; sinais e decisões são fechados e limitados.

## Tarefas

1. Evoluir `schemas/step.schema.json` para aceitar o contrato v1 existente e um contrato v2 que exige `changeType`.
2. Criar `schemas/risk-signal.schema.json` e `schemas/approval-decision.schema.json`.
3. Integrar versões em `scripts/workflow/lib/contracts.cjs` e cobrir casos válidos/inválidos em `scripts/workflow/test-contracts.cjs`.

## Paths afetados (limite absoluto)

- `schemas/step.schema.json`
- `schemas/risk-signal.schema.json`
- `schemas/approval-decision.schema.json`
- `scripts/workflow/lib/contracts.cjs`
- `scripts/workflow/test-contracts.cjs`

## Fora de Escopo

- Classificar v1, implementar policy ou migrar documentos ativos.

## Critério de Pronto

- Contratos compilam; v1 continua aceito e v2 sem `changeType` falha fechado.

## Dependências

- Nenhuma.

## Prompt de handoff

```text
Implemente APENAS o Passo 1.
Files: @schemas/step.schema.json @schemas/risk-signal.schema.json @schemas/approval-decision.schema.json @scripts/workflow/lib/contracts.cjs @scripts/workflow/test-contracts.cjs
Out of scope: classificação, policy e migração de steps.
Done criteria: v1 permanece válido, v2 exige changeType e os três contratos passam testes negativos.
---
@specs/steps/prosa-risk-hitl-step-1.md
@specs/prosa-risk-hitl.md
```
