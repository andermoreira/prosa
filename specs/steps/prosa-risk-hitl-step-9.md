---
schemaVersion: 1.0.0
id: spec-prosa-risk-hitl-step-9
sequence: 9
specId: spec-prosa-risk-hitl
source: {path: specs/steps/prosa-risk-hitl-step-9.md, hash: 8d19b78d7da7961f9ebc1a35a8a2869925f07a8f61e26e7880537da009ef3b0c, baseSha: f24be0c353e28b370018b65ea3163908fa72e2cb}
goal: Receber decision file no resume e aplicar ações explícitas de rejeição.
boundaries: {inScope: [owns=parsing seguro e retomada atômica, invariant=decisão revalidada sob lock, allowedDependencies=steps 6 7 e 8], outOfScope: [doesNotOwn=UI interativa e autorização Git], maxLogicalFiles: 5}
dependsOn: [spec-prosa-risk-hitl-step-6, spec-prosa-risk-hitl-step-7, spec-prosa-risk-hitl-step-8]
predictedFiles: [scripts/workflow/lib/cli.cjs, scripts/workflow/lib/orchestrator.cjs, scripts/workflow/lib/local-adapter.cjs, scripts/workflow/test-cli.cjs, scripts/workflow/test-e2e.cjs]
allowedAreas: [scripts/workflow/lib, scripts/workflow/test-cli.cjs, scripts/workflow/test-e2e.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-risk-hitl.md, stepPath: specs/steps/prosa-risk-hitl-step-9.md, baseSha: f24be0c353e28b370018b65ea3163908fa72e2cb, implementationNoteIds: [NOTE-01, NOTE-02, NOTE-03]}
acceptanceCriteria:
  - id: AC-10
    evidence:
      - {id: EVIDENCE-19, kind: automated-test, description: "Resume lê arquivo ou stdin e registra decisão após lock e revalidation.", gateId: workflow-tests, resultRef: spec-prosa-risk-hitl-step-9/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-cli.cjs}
  - id: AC-11
    evidence:
      - {id: EVIDENCE-20, kind: automated-test, description: "Decision file stale ou de outro checkpoint falha fechado.", gateId: workflow-tests, resultRef: spec-prosa-risk-hitl-step-9/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-e2e.cjs}
  - id: AC-12
    evidence:
      - {id: EVIDENCE-21, kind: automated-test, description: "Rejeição exige retry replan ou abort sem correction.", gateId: workflow-tests, resultRef: spec-prosa-risk-hitl-step-9/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-e2e.cjs}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: Command e runbook serão atualizados nos Steps 12 e 13.}
testing: {required: true, gateIds: [workflow-tests], rationale: Entrada local e resume precisam de casos adversariais.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 9: Decision file

## Goal

Receber decision file no resume e aplicar ações explícitas de rejeição.

## Assumptions

- Este handoff v1 permanece `restricted`; a CLI continua one-shot e não interativa.

## Risks

- Expor justificativa em argv ou aceitar symlink; usar arquivo regular/stdin e sanitização.

## Edge cases

- Stdin vazio, JSON inválido, arquivo permissivo, replay e retry sem budget.

## Acceptance Criteria

- Resume consome decisão sob lock; rejeição exige ação explícita e nunca cria correction.

## Tarefas

1. Adicionar `--decision-file <path|->` em `scripts/workflow/lib/cli.cjs`.
2. Integrar lock, revalidation e consumo em `scripts/workflow/lib/orchestrator.cjs` e `scripts/workflow/lib/local-adapter.cjs`.
3. Cobrir arquivos adversariais, stale e rejeições em `scripts/workflow/test-cli.cjs` e `scripts/workflow/test-e2e.cjs`.

## Paths afetados (limite absoluto)

- `scripts/workflow/lib/cli.cjs`
- `scripts/workflow/lib/orchestrator.cjs`
- `scripts/workflow/lib/local-adapter.cjs`
- `scripts/workflow/test-cli.cjs`
- `scripts/workflow/test-e2e.cjs`

## Fora de Escopo

- Prompt interativo, serviço externo, RBAC ou autorização Git.

## Critério de Pronto

- Arquivo/stdin válido retoma uma vez; entrada stale/insegura bloqueia.

## Dependências

- Passos 6, 7 e 8.

## Prompt de handoff

```text
Implemente APENAS o Passo 9.
Files: @scripts/workflow/lib/cli.cjs @scripts/workflow/lib/orchestrator.cjs @scripts/workflow/lib/local-adapter.cjs @scripts/workflow/test-cli.cjs @scripts/workflow/test-e2e.cjs
Out of scope: UI, serviço externo, RBAC e autorização Git.
Done criteria: resume consome decision file/stdin sob lock e rejeição exige ação explícita.
---
@specs/steps/prosa-risk-hitl-step-9.md
@specs/prosa-risk-hitl.md
```
