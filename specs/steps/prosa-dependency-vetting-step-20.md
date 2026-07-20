---
schemaVersion: 2.0.0
changeType: documentation
id: spec-prosa-dependency-vetting-step-20
sequence: 20
specId: spec-prosa-dependency-vetting
source: {path: specs/steps/prosa-dependency-vetting-step-20.md, hash: 2b3d91d21350b85ccf9748c4a666e85b43b7ce9e7a5e4d5879a6d78a53bb3171, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
goal: Atualizar documentação operacional completa antes do enablement.
boundaries: {inScope: [owns=workflow runbook development docs, invariant=documentação antecede evidência final e enablement, allowedDependencies=steps 1 a 19], outOfScope: [doesNotOwn=manual evidence runtime e enablement], maxLogicalFiles: 5}
dependsOn: [spec-prosa-dependency-vetting-step-19]
predictedFiles: [docs/workflows/automated-spec-pipeline.md, docs/workflows/automated-spec-pipeline-runbook.md, docs/workflows/prosa-development.md]
allowedAreas: [docs/workflows]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-dependency-vetting.md, stepPath: specs/steps/prosa-dependency-vetting-step-20.md, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0, implementationNoteIds: [NOTE-01, NOTE-02, NOTE-03, NOTE-04, NOTE-05, NOTE-06, NOTE-07, NOTE-08]}
acceptanceCriteria:
  - {id: AC-39, evidence: [{id: EVIDENCE-239, kind: documentation, description: "Docs cobrem policy closure approval disclosure recovery sandbox e troubleshooting.", resultRef: docs/workflows/automated-spec-pipeline.md}]}
  - {id: AC-40, evidence: [{id: EVIDENCE-240, kind: documentation, description: "Docs mantêm npx MCP como follow-up não coberto.", resultRef: docs/workflows/prosa-development.md}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [specs-lint, verify-pack, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: paths, paths: [docs/workflows/automated-spec-pipeline.md, docs/workflows/automated-spec-pipeline-runbook.md, docs/workflows/prosa-development.md]}
testing: {required: true, gateIds: [specs-lint, verify-pack], rationale: Documentação deve permanecer navegável e consistente com contratos.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 20: Documentação pré-enablement
## Goal
Publicar a operação segura e troubleshooting antes da prova final e do enablement.
## Assumptions
- Drift concluído; bootstrap exato; shadow aprovado; produção continua disabled.
## Risks
- Runbook sugerir Git direto ou approval como waiver; revisar contra ADRs 026/027.
## Edge cases
- Retry versus replan, candidate stale, npx MCP e rollback com state v5.
## Acceptance Criteria
- AC-39 e AC-40 estão completos antes do Step 21.
## Tarefas
1. Documentar arquitetura, contracts, policy, disclosure e rollout.
2. Documentar safe Git, recovery, reason codes e rollback.
3. Explicitar follow-up MCP e bootstrap que expira no Step 22.
## Paths afetados (limite absoluto)
- `docs/workflows/automated-spec-pipeline.md`
- `docs/workflows/automated-spec-pipeline-runbook.md`
- `docs/workflows/prosa-development.md`
## Fora de Escopo
- Registrar evidência manual ou habilitar runtime.
## Critério de Pronto
- Operador consegue executar, diagnosticar e reverter sem instruções inseguras.
## Dependências
- Passos 1 a 19 e drift concluído.
## Checklist pré-handoff
- [ ] Três docs? [ ] Safe Git apenas? [ ] Produção disabled?
## Prompt de handoff
```text
Implemente APENAS o Passo 20.
Files: @docs/workflows/automated-spec-pipeline.md @docs/workflows/automated-spec-pipeline-runbook.md @docs/workflows/prosa-development.md
Out of scope: evidência manual e enablement.
Done criteria: documentação operacional completa antecede enablement.
---
@specs/steps/prosa-dependency-vetting-step-20.md
@specs/prosa-dependency-vetting.md
```
