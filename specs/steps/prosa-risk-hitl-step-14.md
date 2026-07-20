---
schemaVersion: 1.0.0
id: spec-prosa-risk-hitl-step-14
sequence: 14
specId: spec-prosa-risk-hitl
source: {path: specs/steps/prosa-risk-hitl-step-14.md, hash: fa87f4bc154e49a89feebdf2dcf7188373d22184ebb6d81474b7cc4e84816c78, baseSha: f24be0c353e28b370018b65ea3163908fa72e2cb}
goal: Registrar evidência manual do rollout conservador e dos escalonamentos HITL.
boundaries: {inScope: [owns=registro manual reproduzível, invariant=evidência usa artifacts reais e sanitizados, allowedDependencies=steps 1 a 13], outOfScope: [doesNotOwn=correção archive e release], maxLogicalFiles: 5}
dependsOn: [spec-prosa-risk-hitl-step-1, spec-prosa-risk-hitl-step-2, spec-prosa-risk-hitl-step-3, spec-prosa-risk-hitl-step-4, spec-prosa-risk-hitl-step-5, spec-prosa-risk-hitl-step-6, spec-prosa-risk-hitl-step-7, spec-prosa-risk-hitl-step-8, spec-prosa-risk-hitl-step-9, spec-prosa-risk-hitl-step-10, spec-prosa-risk-hitl-step-11, spec-prosa-risk-hitl-step-12, spec-prosa-risk-hitl-step-13]
predictedFiles: [docs/audits/prosa-risk-hitl-manual-2026-07-19.md]
allowedAreas: [docs/audits]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-risk-hitl.md, stepPath: specs/steps/prosa-risk-hitl-step-14.md, baseSha: f24be0c353e28b370018b65ea3163908fa72e2cb, implementationNoteIds: [NOTE-01, NOTE-02, NOTE-03]}
acceptanceCriteria:
  - id: AC-17
    evidence:
      - {id: EVIDENCE-33, kind: artifact, description: "Registro manual prova v1 restricted e finding high escalando v2 autonomous.", resultRef: docs/audits/prosa-risk-hitl-manual-2026-07-19.md}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [specs-lint, verify-pack, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: paths, paths: [docs/audits/prosa-risk-hitl-manual-2026-07-19.md]}
testing: {required: true, gateIds: [specs-lint, verify-pack], rationale: Registro só é aceito após execução manual e validação integral.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 14: Evidência manual

## Goal

Registrar evidência manual do rollout conservador e dos escalonamentos HITL.

## Assumptions

- Este próprio handoff v1 deve aparecer como `restricted` com sinal legado durante a execução.

## Risks

- Registrar resultado sem execução real; exigir IDs, hashes, comandos e outcomes observados.

## Edge cases

- V1 legado, v2 autônomo com finding high, decisão stale e Git não autorizado.

## Acceptance Criteria

- Relatório prova v1→`restricted`, escalada v2, resume válido e independência Git.

## Tarefas

1. Executar cenário v1 e registrar nível, razão e sinal `legacy-step-without-change-type` antes de efeitos.
2. Executar cenário v2 autônomo escalado por finding `high` e retomar com decision file válido.
3. Registrar policy/baseSha, IDs, hashes sanitizados, comandos e limitações em `docs/audits/prosa-risk-hitl-manual-2026-07-19.md`.
4. Executar validação integral e registrar qualquer desvio como falha.

## Paths afetados (limite absoluto)

- `docs/audits/prosa-risk-hitl-manual-2026-07-19.md`

## Fora de Escopo

- Corrigir falhas, arquivar, publicar release ou expor dados sensíveis.

## Critério de Pronto

- Relatório reproduzível prova os cenários conservador e de escalada com resultados aprovados.

## Dependências

- Passos 1 a 13.

## Prompt de handoff

```text
Implemente APENAS o Passo 14.
Files: @docs/audits/prosa-risk-hitl-manual-2026-07-19.md
Out of scope: correções, archive, release e dados sensíveis.
Done criteria: relatório prova v1 restricted, escalada v2, resume single-use e independência Git.
---
@specs/steps/prosa-risk-hitl-step-14.md
@specs/prosa-risk-hitl.md
```
