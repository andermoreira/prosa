---
schemaVersion: 1.0.0
id: spec-prosa-risk-hitl-step-4
sequence: 4
specId: spec-prosa-risk-hitl
source: {path: specs/steps/prosa-risk-hitl-step-4.md, hash: 927583cce9dca20f53689b2c01b7e981dc1553add7b0c4b14b2788c947a962c9, baseSha: f24be0c353e28b370018b65ea3163908fa72e2cb}
goal: Derivar commit de changeType em v2 preservando behaviorType somente em v1.
boundaries: {inScope: [owns=mapeamentos de mensagem de commit por versão, invariant=taxonomia de commit não autoriza Git nem reduz risco, allowedDependencies=spec-prosa-risk-hitl-step-3], outOfScope: [doesNotOwn=migração de steps e aprovação HITL], maxLogicalFiles: 5}
dependsOn: [spec-prosa-risk-hitl-step-3]
predictedFiles: [scripts/workflow/lib/local-adapter.cjs, scripts/workflow/lib/git.cjs, scripts/workflow/test-commit.cjs, scripts/workflow/test-adapter.cjs]
allowedAreas: [scripts/workflow/lib, scripts/workflow/test-commit.cjs, scripts/workflow/test-adapter.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-risk-hitl.md, stepPath: specs/steps/prosa-risk-hitl-step-4.md, baseSha: f24be0c353e28b370018b65ea3163908fa72e2cb, implementationNoteIds: [NOTE-02]}
acceptanceCriteria:
  - id: AC-14
    evidence:
      - {id: EVIDENCE-09, kind: automated-test, description: "V1 usa behaviorType só para commit e v2 usa changeType sem autorizar Git.", gateId: workflow-tests, resultRef: spec-prosa-risk-hitl-step-4/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-commit.cjs}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: Compatibilidade de commit será documentada no Step 13.}
testing: {required: true, gateIds: [workflow-tests], rationale: "Versão, mensagem e autorização precisam de matriz independente."}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 4: Commit por versão

## Goal

Derivar commit de `changeType` em v2 preservando `behaviorType` somente em v1.

## Assumptions

- Este handoff v1 conserva seu marcador legado; isso não influencia sua classificação `restricted`.

## Risks

- Usar `behaviorType` como sinal de risco; limitar a leitura à mensagem de commit v1.

## Edge cases

- V1 sem marcador, v2 com marcador residual e Git não autorizado.

## Acceptance Criteria

- V1 e v2 produzem mensagens determinísticas e nenhuma taxonomia concede commit ou PR.

## Tarefas

1. Manter leitura de `behaviorType` somente para v1 em `scripts/workflow/lib/local-adapter.cjs` e `scripts/workflow/lib/git.cjs`.
2. Usar `changeType` somente para mensagem de commit v2.
3. Cobrir matriz de versões e autorizações em `scripts/workflow/test-commit.cjs` e `scripts/workflow/test-adapter.cjs`.

## Paths afetados (limite absoluto)

- `scripts/workflow/lib/local-adapter.cjs`
- `scripts/workflow/lib/git.cjs`
- `scripts/workflow/test-commit.cjs`
- `scripts/workflow/test-adapter.cjs`

## Fora de Escopo

- Remover todos os `behaviorType`, migrar steps ou autorizar Git.

## Critério de Pronto

- Testes provam mapping por versão e independência de risco/commit/PR.

## Dependências

- Passo 3.

## Prompt de handoff

```text
Implemente APENAS o Passo 4.
Files: @scripts/workflow/lib/local-adapter.cjs @scripts/workflow/lib/git.cjs @scripts/workflow/test-commit.cjs @scripts/workflow/test-adapter.cjs
Out of scope: migração, remoção global de behaviorType e autorização Git.
Done criteria: v1 usa behaviorType só para commit; v2 usa changeType; risco e Git ficam independentes.
---
@specs/steps/prosa-risk-hitl-step-4.md
@specs/prosa-risk-hitl.md
```
