---
schemaVersion: 1.0.0
id: spec-prosa-risk-hitl-step-13
sequence: 13
specId: spec-prosa-risk-hitl
source: {path: specs/steps/prosa-risk-hitl-step-13.md, hash: 0aad3d68d5577272bf213472ac47069e6ab7b043e69ac2c2984c4777f6aa502c, baseSha: f24be0c353e28b370018b65ea3163908fa72e2cb}
goal: Publicar contrato durável e troubleshooting de schemas v1/v2, risco e HITL.
boundaries: {inScope: [owns=documentação durável e operacional, invariant=docs não prometem identidade forte nem aprovação Git, allowedDependencies=steps 7 a 12], outOfScope: [doesNotOwn=archive release e comportamento novo], maxLogicalFiles: 5}
dependsOn: [spec-prosa-risk-hitl-step-7, spec-prosa-risk-hitl-step-8, spec-prosa-risk-hitl-step-9, spec-prosa-risk-hitl-step-10, spec-prosa-risk-hitl-step-11, spec-prosa-risk-hitl-step-12]
predictedFiles: [docs/workflows/automated-spec-pipeline.md, docs/workflows/automated-spec-pipeline-runbook.md, docs/workflows/prosa-development.md, README.md]
allowedAreas: [docs/workflows, README.md]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-risk-hitl.md, stepPath: specs/steps/prosa-risk-hitl-step-13.md, baseSha: f24be0c353e28b370018b65ea3163908fa72e2cb, implementationNoteIds: [NOTE-01, NOTE-02, NOTE-03]}
acceptanceCriteria:
  - id: AC-18
    evidence:
      - {id: EVIDENCE-32, kind: documentation, description: "Docs explicam v1 restricted v2 changeType policy sinais decisões e troubleshooting.", resultRef: docs/workflows/automated-spec-pipeline-runbook.md}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [specs-lint, verify-pack, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: paths, paths: [docs/workflows/automated-spec-pipeline.md, docs/workflows/automated-spec-pipeline-runbook.md, docs/workflows/prosa-development.md, README.md]}
testing: {required: true, gateIds: [specs-lint, verify-pack], rationale: Links exemplos e consistência do pack precisam de validação.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 13: Documentação durável

## Goal

Publicar contrato durável e troubleshooting de schemas v1/v2, risco e HITL.

## Assumptions

- Este handoff v1 permanece `restricted`; migração gradual é comportamento normativo, não débito oculto.

## Risks

- Chamar v1 de fallback ou prometer migração em massa; explicar compatibilidade conservadora.

## Edge cases

- Run misto, policy drift, stale, state antigo, stdin e v1 com `behaviorType`.

## Acceptance Criteria

- Operador entende v1→`restricted`, v2 obrigatório, policy, sinais, decisões e troubleshooting.

## Tarefas

1. Atualizar `docs/workflows/automated-spec-pipeline.md` com arquitetura e contratos v1/v2.
2. Atualizar `docs/workflows/automated-spec-pipeline-runbook.md` com operação e troubleshooting.
3. Atualizar `docs/workflows/prosa-development.md` com autoria v2 e migração natural.
4. Atualizar `README.md` com visão curta e links.

## Paths afetados (limite absoluto)

- `docs/workflows/automated-spec-pipeline.md`
- `docs/workflows/automated-spec-pipeline-runbook.md`
- `docs/workflows/prosa-development.md`
- `README.md`

## Fora de Escopo

- Arquivar, publicar release ou migrar steps v1.

## Critério de Pronto

- Docs cobrem bootstrap conservador, operação, autoridade local e risco residual.

## Dependências

- Passos 7 a 12.

## Prompt de handoff

```text
Implemente APENAS o Passo 13.
Files: @docs/workflows/automated-spec-pipeline.md @docs/workflows/automated-spec-pipeline-runbook.md @docs/workflows/prosa-development.md @README.md
Out of scope: archive, release e migração em massa.
Done criteria: docs cobrem v1 restricted, v2 obrigatório, policy, sinais, decisões e troubleshooting.
---
@specs/steps/prosa-risk-hitl-step-13.md
@specs/prosa-risk-hitl.md
```
