---
schemaVersion: 1.0.0
id: spec-prosa-risk-hitl-step-2
sequence: 2
specId: spec-prosa-risk-hitl
source: {path: specs/steps/prosa-risk-hitl-step-2.md, hash: e0f3197ce19332dfcb948cc66b84a6b89843d354486284ee65bebc4a6aa0583b, baseSha: f24be0c353e28b370018b65ea3163908fa72e2cb}
goal: Implementar policy confiável e agregação monotônica de risco.
boundaries: {inScope: [owns=policy e avaliação pura de risco, invariant=nível efetivo só aumenta, allowedDependencies=spec-prosa-risk-hitl-step-1], outOfScope: [doesNotOwn=trust root persistência estados e CLI], maxLogicalFiles: 5}
dependsOn: [spec-prosa-risk-hitl-step-1]
predictedFiles: [workflow/risk-policy.yaml, scripts/workflow/lib/risk-policy.cjs, scripts/workflow/test-risk-policy.cjs]
allowedAreas: [workflow, scripts/workflow/lib, scripts/workflow/test-risk-policy.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-risk-hitl.md, stepPath: specs/steps/prosa-risk-hitl-step-2.md, baseSha: f24be0c353e28b370018b65ea3163908fa72e2cb, implementationNoteIds: [NOTE-01, NOTE-03]}
acceptanceCriteria:
  - id: AC-02
    evidence:
      - {id: EVIDENCE-03, kind: contract-test, description: "Policy legível valida tipos v2 áreas níveis e limites sem fallback.", gateId: workflow-tests, resultRef: spec-prosa-risk-hitl-step-2/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-risk-policy.cjs}
  - id: AC-07
    evidence:
      - {id: EVIDENCE-04, kind: automated-test, description: "Agregação conserva o maior nível observado e retry eleva o mínimo.", gateId: workflow-tests, resultRef: spec-prosa-risk-hitl-step-2/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-risk-policy.cjs}
  - id: AC-08
    evidence:
      - {id: EVIDENCE-05, kind: automated-test, description: "Produtor fictício usa o envelope sem alterar o agregador.", gateId: workflow-tests, resultRef: spec-prosa-risk-hitl-step-2/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-risk-policy.cjs}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: Policy será documentada no Step 13.}
testing: {required: true, gateIds: [workflow-tests], rationale: Classificação e monotonicidade são invariantes determinísticas.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 2: Policy e agregação

## Goal

Implementar policy confiável e agregação monotônica de risco.

## Assumptions

- Este handoff v1 será `restricted` pelo bootstrap conservador; a policy de tipos autorais aplica-se a v2.

## Risks

- Regras de área ambíguas; ordenar regras e calcular sempre pelo maior rank.

## Edge cases

- Policy ausente, tipo v2 desconhecido, sinais duplicados e nível já máximo.

## Acceptance Criteria

- Mesmas entradas geram o mesmo assessment e nenhum sinal reduz risco.

## Tarefas

1. Criar `workflow/risk-policy.yaml` com escala, tipos v2, regras de área, versão e limites.
2. Criar `scripts/workflow/lib/risk-policy.cjs` para validar, normalizar sinais e calcular assessment/hash.
3. Criar `scripts/workflow/test-risk-policy.cjs` com policy inválida, monotonicidade, retry e produtor fictício.

## Paths afetados (limite absoluto)

- `workflow/risk-policy.yaml`
- `scripts/workflow/lib/risk-policy.cjs`
- `scripts/workflow/test-risk-policy.cjs`

## Fora de Escopo

- Carregar do `baseSha`, persistir ou criar checkpoints.

## Critério de Pronto

- Policy e avaliação passam testes determinísticos e fail-closed.

## Dependências

- Passo 1.

## Prompt de handoff

```text
Implemente APENAS o Passo 2.
Files: @workflow/risk-policy.yaml @scripts/workflow/lib/risk-policy.cjs @scripts/workflow/test-risk-policy.cjs
Out of scope: trust root, persistência e checkpoints.
Done criteria: policy validada produz assessments monotônicos sem fallback.
---
@specs/steps/prosa-risk-hitl-step-2.md
@specs/prosa-risk-hitl.md
```
