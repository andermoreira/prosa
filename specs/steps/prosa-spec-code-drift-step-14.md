---
schemaVersion: 2.0.0
changeType: documentation
id: spec-prosa-spec-code-drift-step-14
sequence: 14
specId: spec-prosa-spec-code-drift
source: {path: specs/steps/prosa-spec-code-drift-step-14.md, hash: a31f69012a8ed42c72e2417fab111faea82844abb656e65a6188033670631606, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
goal: Atualizar documentação durável e troubleshooting antes do enablement, descrevendo o estado ainda dormente.
boundaries: {inScope: [owns=documentação operacional e de desenvolvimento, invariant=docs distinguem shadow atual de enforcement futuro, allowedDependencies=step 13], outOfScope: [doesNotOwn=código testes enablement e evidência manual], maxLogicalFiles: 5}
dependsOn: [spec-prosa-spec-code-drift-step-13]
predictedFiles: [README.md, docs/workflows/automated-spec-pipeline.md, docs/workflows/automated-spec-pipeline-runbook.md, docs/workflows/prosa-development.md]
allowedAreas: [README.md, docs/workflows]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-spec-code-drift.md, stepPath: specs/steps/prosa-spec-code-drift-step-14.md, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0, implementationNoteIds: [NOTE-01, NOTE-02, NOTE-03, NOTE-04, NOTE-05, NOTE-06]}
acceptanceCriteria:
  - {id: AC-22, evidence: [{id: EVIDENCE-22, kind: documentation, description: "Documentação durável cobre v3 detectores state recovery resultados retry replan e troubleshooting.", resultRef: docs/workflows/automated-spec-pipeline.md}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 180, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [specs-lint, verify-pack, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: paths, paths: [README.md, docs/workflows/automated-spec-pipeline.md, docs/workflows/automated-spec-pipeline-runbook.md, docs/workflows/prosa-development.md]}
testing: {required: true, gateIds: [specs-lint, verify-pack], rationale: Documentação e referências precisam permanecer consistentes com o pack.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 14: Documentação durável

## Goal

Atualizar documentação durável e troubleshooting antes do enablement, descrevendo o estado ainda dormente.

## Assumptions

- A arquitetura e os comportamentos foram fechados e testados nos Steps 1 a 13.

## Risks

- Documentar enforcement como já ativo; mitigar marcar explicitamente que a ativação ocorre somente no Step 15.

## Edge cases

- Run v1/v2 para diagnóstico, resume incompatível, corruption, inconclusive, retry versus replan e rollback.

## Acceptance Criteria

- Docs explicam contratos, operação, recovery, decisões e troubleshooting sem antecipar a ativação.

## Tarefas

1. Atualizar visão geral em `README.md` e desenvolvimento em `docs/workflows/prosa-development.md`.
2. Documentar v3, fase, resultados, state e recovery em `automated-spec-pipeline.md`.
3. Documentar operação, retry/replan, erros e rollback em `automated-spec-pipeline-runbook.md`.

## Paths afetados (limite absoluto)

- `README.md`
- `docs/workflows/automated-spec-pipeline.md`
- `docs/workflows/automated-spec-pipeline-runbook.md`
- `docs/workflows/prosa-development.md`

## Fora de Escopo

- Alterar commands/adapters, código, testes, evidência manual ou ativar fail-closed.

## Critério de Pronto

- Quatro documentos estão consistentes, distinguem shadow de enabled e passam lint/verify.

## Dependências

- Passo 13.

## Checklist pré-handoff

- [ ] Quatro paths previstos, sem arquivo adicional.
- [ ] Não há alteração em docs/commands ou adapters de commands.
- [ ] Enforcement continua explicitamente dormente.
- [ ] EVIDENCE-22 está navegável.

## Prompt de handoff

```text
Implemente APENAS o Passo 14.
Files: @README.md @docs/workflows/automated-spec-pipeline.md @docs/workflows/automated-spec-pipeline-runbook.md @docs/workflows/prosa-development.md
Out of scope: commands, código, testes, evidência manual e enablement.
Done criteria: documentação durável completa e consistente, indicando ativação apenas no Step 15.
---
@specs/steps/prosa-spec-code-drift-step-14.md
@specs/prosa-spec-code-drift.md
```
