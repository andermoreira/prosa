---
schemaVersion: 1.0.0
id: spec-prosa-risk-hitl-step-12
sequence: 12
specId: spec-prosa-risk-hitl
source: {path: specs/steps/prosa-risk-hitl-step-12.md, hash: 248be50c5a38f1c754c0ec15de3b59975281e1470ca32e99ebae46659f8bdf7c, baseSha: f24be0c353e28b370018b65ea3163908fa72e2cb}
goal: Atualizar o command canônico de resume e validar geração multi-adapter.
boundaries: {inScope: [owns=documentação executável do command, invariant=justificativa não entra em argv, allowedDependencies=spec-prosa-risk-hitl-step-9], outOfScope: [doesNotOwn=runtime CLI e runbook amplo], maxLogicalFiles: 5}
dependsOn: [spec-prosa-risk-hitl-step-9]
predictedFiles: [.cursor/commands/resume-spec.md, scripts/workflow/test-commands.cjs]
allowedAreas: [.cursor/commands, scripts/workflow/test-commands.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-risk-hitl.md, stepPath: specs/steps/prosa-risk-hitl-step-12.md, baseSha: f24be0c353e28b370018b65ea3163908fa72e2cb, implementationNoteIds: [NOTE-02]}
acceptanceCriteria:
  - id: AC-10
    evidence:
      - {id: EVIDENCE-30, kind: automated-test, description: "Command usa decision-file ou stdin sem razão em argv.", gateId: workflow-tests, resultRef: spec-prosa-risk-hitl-step-12/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-commands.cjs}
  - id: AC-18
    evidence:
      - {id: EVIDENCE-31, kind: static-check, description: "Geração OpenCode permanece sincronizada com o command canônico.", gateId: commands-opencode-check, resultRef: spec-prosa-risk-hitl-step-12/attempt-1/gate-commands-opencode-check, testSelector: .cursor/commands/resume-spec.md}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, commands-opencode-check, commands-claude-check, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: paths, paths: [.cursor/commands/resume-spec.md]}
testing: {required: true, gateIds: [workflow-tests, commands-opencode-check, commands-claude-check], rationale: Command canônico precisa gerar adapters equivalentes.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 12: Command de resume

## Goal

Atualizar o command canônico de resume e validar geração multi-adapter.

## Assumptions

- Este handoff v1 permanece `restricted`; `.cursor/commands/resume-spec.md` é a fonte canônica.

## Risks

- Documentar razão em argv; mostrar somente decision file ou stdin.

## Edge cases

- Aprovação, rejeição com três ações e leitura por `-`.

## Acceptance Criteria

- Command explica payload seguro e adapters gerados permanecem equivalentes.

## Tarefas

1. Atualizar `.cursor/commands/resume-spec.md` com decision file, exemplos e rejeição.
2. Atualizar `scripts/workflow/test-commands.cjs` para validar geração OpenCode/Claude.

## Paths afetados (limite absoluto)

- `.cursor/commands/resume-spec.md`
- `scripts/workflow/test-commands.cjs`

## Fora de Escopo

- Alterar parser runtime, UI ou runbook amplo.

## Critério de Pronto

- Testes e dry-runs passam sem justificativa em argv.

## Dependências

- Passo 9.

## Prompt de handoff

```text
Implemente APENAS o Passo 12.
Files: @.cursor/commands/resume-spec.md @scripts/workflow/test-commands.cjs
Out of scope: parser runtime, UI e runbook amplo.
Done criteria: command usa decision-file/stdin e adapters passam checks equivalentes.
---
@specs/steps/prosa-risk-hitl-step-12.md
@specs/prosa-risk-hitl.md
```
