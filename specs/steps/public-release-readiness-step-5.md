---
schemaVersion: 2.0.0
changeType: documentation
id: spec-public-release-readiness-step-5
sequence: 5
specId: spec-public-release-readiness
source: {path: specs/steps/public-release-readiness-step-5.md, hash: c5efcf8bdbd9f4c11c7f0616c623233ab74880d9d90e44d864c7a51570f2bbf9, baseSha: efe8dabe50acf4250e82adbb726f199648a53d60}
goal: Consolidar evidências finais e preparar um handoff sem autoridade para publicar.
boundaries: {inScope: [owns=release notes locais e relatório final de gates, invariant=ação externa permanece pendente de aprovação, allowedDependencies=steps 1 a 4], outOfScope: [doesNotOwn=visibility, release GitHub, metadata remota, pins e README do perfil], maxLogicalFiles: 5}
dependsOn: [spec-public-release-readiness-step-1, spec-public-release-readiness-step-2, spec-public-release-readiness-step-3, spec-public-release-readiness-step-4]
predictedFiles: [docs/releases/v0.1.0-alpha.md, docs/audits/public-release-gate-2026-07-26.md]
allowedAreas: [docs/releases, docs/audits]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/public-release-readiness.md, stepPath: specs/steps/public-release-readiness-step-5.md, baseSha: efe8dabe50acf4250e82adbb726f199648a53d60, implementationNoteIds: [NOTE-01, NOTE-02, NOTE-03]}
acceptanceCriteria:
  - {id: AC-04, evidence: [{id: EVIDENCE-09, kind: artifact, description: "Relatório registra três execuções consecutivas verdes ou mantém o gate bloqueado.", resultRef: docs/audits/public-release-gate-2026-07-26.md}]}
  - {id: AC-10, evidence: [{id: EVIDENCE-10, kind: documentation, description: "Handoff lista visibilidade, release, metadata e perfil como ações externas ainda não autorizadas.", resultRef: docs/releases/v0.1.0-alpha.md}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 180, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, specs-lint, verify-pack, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: paths, paths: [docs/releases/v0.1.0-alpha.md, docs/audits/public-release-gate-2026-07-26.md]}
testing: {required: true, gateIds: [workflow-tests, verify-pack], rationale: O handoff final só pode declarar prontidão com todos os gates técnicos executados.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 5: gate final e handoff

## Goal

Consolidar evidências finais e preparar um handoff sem autoridade para publicar.

## Tarefas

1. Preparar release notes alpha locais sem criar release.
2. Executar gates locais e registrar resultados.
3. Registrar as três execuções consecutivas da CI ou manter o gate bloqueado.
4. Listar ações externas pendentes e a aprovação exata necessária.

## Paths afetados (limite absoluto)

- `docs/releases/v0.1.0-alpha.md`
- `docs/audits/public-release-gate-2026-07-26.md`

## Fora de Escopo

- Tornar público, criar release, editar metadata, pin ou README do perfil.

## Critério de Pronto

- O relatório permite decisão humana objetiva e nenhuma ação externa foi executada.

## Dependências

- Passos 1 a 4.

## Checklist pré-handoff

- [ ] Gates e CI ligados a URLs ou artifacts.
- [ ] Finding bloqueante impede recomendação de publicação.
- [ ] Ações externas continuam explicitamente pendentes.

## Prompt de handoff

```text
Implemente APENAS o Passo 5.
Files: @docs/releases/v0.1.0-alpha.md @docs/audits/public-release-gate-2026-07-26.md
Out of scope: visibility, GitHub release, metadata, pin e perfil.
Done criteria: evidência final consolidada e pedido de aprovação externa pronto.
---
@specs/steps/public-release-readiness-step-5.md
@specs/public-release-readiness.md
```
