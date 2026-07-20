---
schemaVersion: 2.0.0
changeType: architecture
id: spec-prosa-spec-code-drift-step-2
sequence: 2
specId: spec-prosa-spec-code-drift
source: {path: specs/steps/prosa-spec-code-drift-step-2.md, hash: 50619d6aaae0292875bbe0767bd3d212b628b77731a031a0f69d994f86743efb, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
goal: Evoluir o contrato de step v3 com implementationContract fechado e coverage bijetiva.
boundaries: {inScope: [owns=schema v3 e validação estrutural, invariant=v1 v2 seguem legíveis e v3 permanece dormant, allowedDependencies=step 1], outOfScope: [doesNotOwn=detectores state e enforcement], maxLogicalFiles: 5}
dependsOn: [spec-prosa-spec-code-drift-step-1]
predictedFiles: [schemas/step.schema.json, scripts/workflow/lib/contracts.cjs, scripts/workflow/test-contracts.cjs]
allowedAreas: [schemas, scripts/workflow/lib, scripts/workflow/test-contracts.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-spec-code-drift.md, stepPath: specs/steps/prosa-spec-code-drift-step-2.md, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0, implementationNoteIds: [NOTE-01, NOTE-05, NOTE-06]}
acceptanceCriteria:
  - {id: AC-01, evidence: [{id: EVIDENCE-01, kind: contract-test, description: "Schema v3 fechado exige implementationContract e rejeita referências e campos inválidos.", gateId: workflow-tests, resultRef: spec-prosa-spec-code-drift-step-2/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-contracts.cjs}]}
  - {id: AC-02, evidence: [{id: EVIDENCE-02, kind: contract-test, description: "Coverage exige exatamente uma entrada válida por AC.", gateId: workflow-tests, resultRef: spec-prosa-spec-code-drift-step-2/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-contracts.cjs}]}
  - {id: AC-03, evidence: [{id: EVIDENCE-03, kind: contract-test, description: "Leitura diagnostica v1/v2 e mantém enforcement v3 dormente nesta etapa.", gateId: workflow-tests, resultRef: spec-prosa-spec-code-drift-step-2/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-contracts.cjs}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 180, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: A documentação durável será atualizada no Step 14.}
testing: {required: true, gateIds: [workflow-tests], rationale: Contratos versionados e coverage exigem fixtures positivas e negativas.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 2: Step v3 e coverage

## Goal

Evoluir o contrato de step v3 com `implementationContract` fechado e coverage bijetiva.

## Assumptions

- O runtime atual já lê este handoff v2; v3 será apenas reconhecido e validado, não exigido ainda.

## Risks

- Bloquear os handoffs bootstrap; mitigar separando reconhecimento de v3 do enablement mutável do Step 15.

## Edge cases

- AC ausente ou duplicada, assertion órfã, evidence inexistente, path não previsto e versão desconhecida.

## Acceptance Criteria

- V3 é fechado e coverage é total; v1/v2 continuam diagnosticáveis sem ativar fail-closed.

## Tarefas

1. Evoluir `schemas/step.schema.json` com união discriminada v3 e `implementationContract` fechado.
2. Validar invariantes bijetivos em `scripts/workflow/lib/contracts.cjs`.
3. Cobrir versões e referências válidas/inválidas em `scripts/workflow/test-contracts.cjs`.

## Paths afetados (limite absoluto)

- `schemas/step.schema.json`
- `scripts/workflow/lib/contracts.cjs`
- `scripts/workflow/test-contracts.cjs`

## Fora de Escopo

- Implementar assertions, state v4 ou impedir execução v1/v2.

## Critério de Pronto

- Contratos compilam; v3 inválido falha antes de efeitos; v1/v2 continuam legíveis; enforcement permanece dormente.

## Dependências

- Passo 1.

## Checklist pré-handoff

- [ ] Três paths previstos, sem arquivo adicional.
- [ ] Schema do próprio handoff permanece 2.0.0.
- [ ] Nenhuma condição de rollout foi ligada.
- [ ] EVIDENCE-01 a EVIDENCE-03 passam no gate declarado.

## Prompt de handoff

```text
Implemente APENAS o Passo 2.
Files: @schemas/step.schema.json @scripts/workflow/lib/contracts.cjs @scripts/workflow/test-contracts.cjs
Out of scope: detectores, state, orchestrator e enablement v3.
Done criteria: v3 fechado e coverage bijetiva validados, com v1/v2 ainda diagnosticáveis e sem enforcement.
---
@specs/steps/prosa-spec-code-drift-step-2.md
@specs/prosa-spec-code-drift.md
```
