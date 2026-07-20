---
schemaVersion: 2.0.0
changeType: feature
id: spec-prosa-dependency-vetting-step-11
sequence: 11
specId: spec-prosa-dependency-vetting
source: {path: specs/steps/prosa-dependency-vetting-step-11.md, hash: e102ae612c37b927ca856010f9307cffacdcf9734fcb496786c626d920e22a16, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
goal: Implementar metadata mínima, not-found conclusivo e downloads com granularidade explícita.
boundaries: {inScope: [owns=registry metadata e downloads, invariant=indisponível nunca vira not-found ou clean, allowedDependencies=step 10], outOfScope: [doesNotOwn=reports npm state materialização enablement], maxLogicalFiles: 5}
dependsOn: [spec-prosa-dependency-vetting-step-10]
predictedFiles: [scripts/workflow/lib/dependency-metadata.cjs, scripts/workflow/test-dependency-metadata.cjs]
allowedAreas: [scripts/workflow/lib, scripts/workflow/test-dependency-metadata.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-dependency-vetting.md, stepPath: specs/steps/prosa-dependency-vetting-step-11.md, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0, implementationNoteIds: [NOTE-03, NOTE-05, NOTE-08]}
acceptanceCriteria:
  - {id: AC-23, evidence: [{id: EVIDENCE-223, kind: automated-test, description: "Not found exige packument válido e ausência da versão; 404 isolado é inconclusive.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-11/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-dependency-metadata.cjs}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: Endpoints e troubleshooting serão documentados no Step 20.}
testing: {required: true, gateIds: [workflow-tests], rationale: Classificação remota exige matriz de transporte e payload.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 11: Metadata e downloads
## Goal
Classificar existência e heurística de downloads sem confundir indisponibilidade com fato.
## Assumptions
- Drift concluído; bootstrap exato; chamadas usam fixtures/scratch e não runs produtivos.
## Risks
- 404 ambíguo bloquear como inexistente; exigir packument completo.
## Edge cases
- 429, partial JSON, scoped encoding, bulk 129 e fallback package-level.
## Acceptance Criteria
- AC-23 passa e os contratos de AC-24/AC-49 prototipados permanecem preservados.
## Tarefas
1. Implementar metadata mínima e classificação de transporte.
2. Implementar endpoint version e fallbacks com granularidade/reason code.
3. Cobrir freshness, scoped e indisponibilidade sem enablement.
## Paths afetados (limite absoluto)
- `scripts/workflow/lib/dependency-metadata.cjs`
- `scripts/workflow/test-dependency-metadata.cjs`
## Fora de Escopo
- Reports npm, state, materialização e orchestrator.
## Critério de Pronto
- Metadata remota falha fechado e nunca produz not-found indevido.
## Dependências
- Passo 10 e drift concluído.
## Checklist pré-handoff
- [ ] Dois arquivos? [ ] Sem runs reais? [ ] Indisponibilidade conservadora?
## Prompt de handoff
```text
Implemente APENAS o Passo 11.
Files: @scripts/workflow/lib/dependency-metadata.cjs @scripts/workflow/test-dependency-metadata.cjs
Out of scope: reports, state, materialização e enablement.
Done criteria: metadata/downloads classificam resultados sem bypass.
---
@specs/steps/prosa-dependency-vetting-step-11.md
@specs/prosa-dependency-vetting.md
```
