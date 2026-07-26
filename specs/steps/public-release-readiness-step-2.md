---
schemaVersion: 2.0.0
changeType: feature
id: spec-public-release-readiness-step-2
sequence: 2
specId: spec-public-release-readiness
source: {path: specs/steps/public-release-readiness-step-2.md, hash: 6a115ef8c3926ea8762d39a69a3d5ece390a0d1267fcbd913b88ddda2864fd38, baseSha: efe8dabe50acf4250e82adbb726f199648a53d60}
goal: Entregar uma demonstração local determinística do ciclo completo do Prosa sem serviço pago.
boundaries: {inScope: [owns=runner de demo, fixture, teste e guia do cenário, invariant=demo não chama agente ou serviço externo, allowedDependencies=step 1], outOfScope: [doesNotOwn=CLI pública geral, publicação, telemetria e novos contratos do orchestrator], maxLogicalFiles: 5}
dependsOn: [spec-public-release-readiness-step-1]
predictedFiles: [scripts/workflow/demo-public-alpha.cjs, scripts/workflow/test-demo-public-alpha.cjs, examples/public-alpha/README.md, examples/public-alpha/spec.md, examples/public-alpha/step.md]
allowedAreas: [scripts/workflow, examples/public-alpha]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/public-release-readiness.md, stepPath: specs/steps/public-release-readiness-step-2.md, baseSha: efe8dabe50acf4250e82adbb726f199648a53d60, implementationNoteIds: [NOTE-01, NOTE-03]}
acceptanceCriteria:
  - {id: AC-05, evidence: [{id: EVIDENCE-04, kind: automated-test, description: "Demo percorre validação, execução confinada, gate, review, decisão humana e relatório com adapter determinístico.", gateId: workflow-tests, resultRef: spec-public-release-readiness-step-2/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-demo-public-alpha.cjs}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 180, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, specs-lint, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: paths, paths: [examples/public-alpha/README.md]}
testing: {required: true, gateIds: [workflow-tests], rationale: A demo precisa provar o fluxo e não pode depender apenas de narrativa ou output gravado.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 2: demonstração pública determinística

## Goal

Entregar uma demonstração local determinística do ciclo completo do Prosa sem serviço pago.

## Tarefas

1. Criar uma fixture mínima de spec e step confinados.
2. Implementar runner de demonstração sobre seams existentes, sem chamadas externas.
3. Testar estados, decisão humana simulada e relatório sanitizado.
4. Documentar execução, arquitetura, trust boundary e output esperado.

## Paths afetados (limite absoluto)

- `scripts/workflow/demo-public-alpha.cjs`
- `scripts/workflow/test-demo-public-alpha.cjs`
- `examples/public-alpha/README.md`
- `examples/public-alpha/spec.md`
- `examples/public-alpha/step.md`

## Fora de Escopo

- Criar CLI genérica, alterar contratos do orchestrator ou exigir credenciais.

## Critério de Pronto

- O cenário executa localmente e seu teste prova o fluxo completo com dados fictícios.

## Dependências

- Passo 1.

## Checklist pré-handoff

- [ ] Exatamente um cenário demonstrativo.
- [ ] Nenhuma rede, credencial ou agente real.
- [ ] Cinco arquivos ou menos.

## Prompt de handoff

```text
Implemente APENAS o Passo 2.
Files: @scripts/workflow/demo-public-alpha.cjs @scripts/workflow/test-demo-public-alpha.cjs @examples/public-alpha/README.md @examples/public-alpha/spec.md @examples/public-alpha/step.md
Out of scope: CLI geral, serviço externo, publicação e mudança de contratos do orchestrator.
Done criteria: demo determinística prova o ciclo completo e passa em workflow-tests.
---
@specs/steps/public-release-readiness-step-2.md
@specs/public-release-readiness.md
```
