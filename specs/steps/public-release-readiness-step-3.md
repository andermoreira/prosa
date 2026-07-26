---
schemaVersion: 2.0.0
changeType: security
id: spec-public-release-readiness-step-3
sequence: 3
specId: spec-public-release-readiness
source: {path: specs/steps/public-release-readiness-step-3.md, hash: 6cf499c778adaf27ba42fa770fc98c4cd5c9737523994ec1c0868e85cdc9eb7e, baseSha: efe8dabe50acf4250e82adbb726f199648a53d60}
goal: Registrar uma auditoria bloqueante da árvore, do histórico, da proveniência e das licenças publicáveis.
boundaries: {inScope: [owns=relatório factual de exposição e decisão do gate, invariant=finding bloqueante impede avanço, allowedDependencies=steps 1 e 2], outOfScope: [doesNotOwn=reescrita de histórico, correção automática, visibilidade e parecer jurídico], maxLogicalFiles: 5}
dependsOn: [spec-public-release-readiness-step-1, spec-public-release-readiness-step-2]
predictedFiles: [docs/audits/public-release-readiness-2026-07-26.md]
allowedAreas: [docs/audits]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/public-release-readiness.md, stepPath: specs/steps/public-release-readiness-step-3.md, baseSha: efe8dabe50acf4250e82adbb726f199648a53d60, implementationNoteIds: [NOTE-01, NOTE-02]}
acceptanceCriteria:
  - {id: AC-07, evidence: [{id: EVIDENCE-05, kind: artifact, description: "Relatório datado cobre árvore, histórico, segredos, dados privados, autoria, licença e notices.", resultRef: docs/audits/public-release-readiness-2026-07-26.md}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 180, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [specs-lint, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: paths, paths: [docs/audits/public-release-readiness-2026-07-26.md]}
testing: {required: false, gateIds: [], rationale: "O step produz evidência de auditoria por comandos read-only e inspeção do histórico, não comportamento executável novo."}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 3: auditoria de exposição

## Goal

Registrar uma auditoria bloqueante da árvore, do histórico, da proveniência e das licenças.

## Tarefas

1. Executar secret scanning na árvore e no histórico completo.
2. Procurar paths pessoais, e-mails privados, dados de clientes e referências privadas.
3. Verificar autoria, origem da extração, MIT, dependências e `THIRD_PARTY_NOTICES.md`.
4. Registrar comandos, resultados, findings e decisão publicável/bloqueada.

## Paths afetados (limite absoluto)

- `docs/audits/public-release-readiness-2026-07-26.md`

## Fora de Escopo

- Corrigir findings, reescrever histórico, mudar visibilidade ou emitir parecer jurídico.

## Critério de Pronto

- O relatório cobre todo o escopo e bloqueia explicitamente o avanço se houver finding aberto.

## Dependências

- Passos 1 e 2.

## Checklist pré-handoff

- [ ] Histórico completo incluído.
- [ ] Dados sensíveis não são reproduzidos no relatório.
- [ ] Decisão final é factual e fail-closed.

## Prompt de handoff

```text
Implemente APENAS o Passo 3.
File: @docs/audits/public-release-readiness-2026-07-26.md
Out of scope: correções, history rewrite, publicação e parecer jurídico.
Done criteria: auditoria completa, sanitizada e com gate publicável/bloqueado explícito.
---
@specs/steps/public-release-readiness-step-3.md
@specs/public-release-readiness.md
```
