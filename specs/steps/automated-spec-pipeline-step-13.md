---
schemaVersion: 1.0.0
id: spec-automated-pipeline-step-13
sequence: 13
specId: spec-automated-pipeline
source: {path: specs/steps/automated-spec-pipeline-step-13.md, hash: df507161b902f39e732496b1a12f84a0d080850c796c7209399ec80598a3d035, baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4}
goal: Integrar steps em ordem e exigir suíte, final review fresh e global acceptance antes de sucesso.
boundaries:
  inScope:
    - behaviorType=vertical
    - owns=integração sequencial, gates globais, final review e global acceptance
    - invariant=SUCCEEDED exige global gates, backlog medium/low completo e ausência de critical/high sem correction step automático
    - allowedDependencies=spec-automated-pipeline-step-12
  outOfScope:
    - doesNotOwn=resolução automática de conflito, alteração de spec, correção automática e PR
  maxLogicalFiles: 5
dependsOn: [spec-automated-pipeline-step-12]
predictedFiles: [scripts/workflow/lib/orchestrator.cjs, scripts/workflow/lib/review.cjs, scripts/workflow/lib/acceptance.cjs, scripts/workflow/test-global.cjs]
allowedAreas: [scripts/workflow]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/automated-spec-pipeline.md, stepPath: specs/steps/automated-spec-pipeline-step-13.md, baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4, implementationNoteIds: [NOTE-01, NOTE-02, NOTE-03]}
acceptanceCriteria:
  - id: AC-17
    evidence:
      - {id: EVIDENCE-20, kind: automated-test, description: "Gate verify-pack valida espera por commits, global gates exatos, política critical/high, backlog medium/low, final review e global acceptance sem auto correction.", gateId: verify-pack, resultRef: spec-automated-pipeline-step-13/attempt-1/gate-verify-pack, testSelector: scripts/workflow/test-global.cjs}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [verify-pack, revalidation]}
revalidation:
  triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, on-resume, before-final-review, before-global-acceptance]
  driftPolicy: block
documentationImpact: {kind: none, justification: Review e acceptance globais serão documentados no Step 17.}
testing: {required: true, gateIds: [verify-pack], rationale: Falhas globais e ausência de correction step exigem testes.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 13: Final review e global acceptance

## Goal

Integrar steps em ordem e exigir suíte, final review fresh e global acceptance antes de sucesso.

## Assumptions

- Steps locais aceitos possuem evidence/commits reconciliados e dependências satisfeitas.

## Risks

- Falha global induzir correção automática fora do plano; mitigar encerrando/bloqueando sem criar correction step.

## Edge cases

- Dependência rejeitada, conflito, gate global tardio, AC global sem evidence, finding `critical/high`, `medium/low` ausente do backlog e docs divergentes.

## Acceptance Criteria

- `SUCCEEDED` só ocorre após suíte, final review read-only e global acceptance sem `critical/high`, com todo `medium/low` salvo no backlog; `high` correction eligible não cria nem executa auto correction.

## Tarefas

1. Estender `scripts/workflow/lib/orchestrator.cjs` com integração ordenada, gates globais e transitions finais.
2. Estender `scripts/workflow/lib/review.cjs` com final review fresh sobre snapshot global sanitizado.
3. Estender `scripts/workflow/lib/acceptance.cjs` com cobertura global de AC/evidence/documentation impact/findings.
4. Criar `scripts/workflow/test-global.cjs` cobrindo `critical` imediato, `high` bloqueante/correction eligible, backlog obrigatório de `medium/low` e ausência de auto correction.

## Paths afetados (limite absoluto)

- `scripts/workflow/lib/orchestrator.cjs`
- `scripts/workflow/lib/review.cjs`
- `scripts/workflow/lib/acceptance.cjs`
- `scripts/workflow/test-global.cjs`

## Fora de Escopo

- Resolver conflito, alterar spec, corrigir código automaticamente ou criar PR.

## Critério de Pronto

- Nenhum run chega a sucesso sem os três gates globais e correction step permanece inexistente.

## Dependências

- Passos 11 e 12.

## Checklist pré-handoff

- [ ] ≤ 5 arquivos afetados?
- [ ] Final review e global acceptance obrigatórios?
- [ ] Correction step automático ausente em todos os caminhos?

---

## Prompt de handoff

```text
Implemente APENAS o Passo 13.
Files: @scripts/workflow/lib/orchestrator.cjs @scripts/workflow/lib/review.cjs @scripts/workflow/lib/acceptance.cjs @scripts/workflow/test-global.cjs
Out of scope: conflito/correção automática, alteração de spec e PR.
Done criteria: suíte + final review + global acceptance são obrigatórios e não há correction step.
---
@specs/steps/automated-spec-pipeline-step-13.md
@specs/automated-spec-pipeline.md
```
