---
schemaVersion: 1.0.0
id: spec-automated-pipeline-step-11
sequence: 11
specId: spec-automated-pipeline
source: {path: specs/steps/automated-spec-pipeline-step-11.md, hash: 161a3d7e1b4a92b0a92fa5fbe2b6e838e4bd6b0776cc8975dd6a991a6d8e8d3e, baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4}
goal: Aceitar um step deterministicamente somente com evidence válida por AC e documentation impact verificado.
boundaries:
  inScope:
    - behaviorType=vertical
    - owns=evidence, notes aprovadas, documentation impact e acceptance local
    - invariant=acceptance é recalculável e não aceita evidence stale
    - allowedDependencies=spec-automated-pipeline-step-10
  outOfScope:
    - doesNotOwn=commit, final review, global acceptance e overrides
  maxLogicalFiles: 5
dependsOn: [spec-automated-pipeline-step-10]
predictedFiles: [scripts/workflow/lib/evidence.cjs, scripts/workflow/lib/acceptance.cjs, scripts/workflow/lib/orchestrator.cjs, scripts/workflow/test-acceptance.cjs]
allowedAreas: [scripts/workflow]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/automated-spec-pipeline.md, stepPath: specs/steps/automated-spec-pipeline-step-11.md, baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4, implementationNoteIds: [NOTE-01, NOTE-02, NOTE-03]}
acceptanceCriteria:
  - id: AC-15
    evidence:
      - {id: EVIDENCE-17, kind: automated-test, description: "Gate verify-pack valida evidence por AC, notes e documentation impact.", gateId: verify-pack, resultRef: spec-automated-pipeline-step-11/attempt-1/gate-verify-pack, testSelector: scripts/workflow/test-acceptance.cjs}
  - id: AC-16
    evidence:
      - {id: EVIDENCE-18, kind: automated-test, description: "Gate verify-pack recalcula acceptance local deterministicamente.", gateId: verify-pack, resultRef: spec-automated-pipeline-step-11/attempt-1/gate-verify-pack, testSelector: scripts/workflow/test-acceptance.cjs}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [verify-pack, revalidation]}
revalidation:
  triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, on-resume]
  driftPolicy: block
documentationImpact: {kind: none, justification: Contrato de evidence e acceptance será documentado no Step 17.}
testing: {required: true, gateIds: [verify-pack], rationale: Freshness e determinismo exigem fixtures completas.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 11: Evidence, notes, docs impact e acceptance local

## Goal

Aceitar um step deterministicamente somente com evidence válida por AC e documentation impact verificado.

## Assumptions

- AC IDs e implementation notes aprovadas foram normalizados pelos schemas.

## Risks

- Note mudar requisito sem reaprevação; mitigar validando escopo e metadados de aprovação/base SHA.

## Edge cases

- AC sem evidence, evidence stale, note material, docs impact `none` sem justificativa e finding bloqueante.

## Acceptance Criteria

- Acceptance local é recalculável e falha para qualquer predicado inválido; cada AC coberto aponta para evidence hasheada.

## Tarefas

1. Criar `scripts/workflow/lib/evidence.cjs` para mapear AC→artifact/evidence e validar freshness/provenance.
2. Criar `scripts/workflow/lib/acceptance.cjs` com predicados de schema/state/lock/budget/scope/gates/revalidation/artifacts/review/findings/notes/docs.
3. Integrar acceptance local em `scripts/workflow/lib/orchestrator.cjs`.
4. Criar `scripts/workflow/test-acceptance.cjs` cobrindo AC evidence, notes, docs impact e determinismo.

## Paths afetados (limite absoluto)

- `scripts/workflow/lib/evidence.cjs`
- `scripts/workflow/lib/acceptance.cjs`
- `scripts/workflow/lib/orchestrator.cjs`
- `scripts/workflow/test-acceptance.cjs`

## Fora de Escopo

- Commit, final review/global acceptance ou override humano no runtime.

## Critério de Pronto

- Mesmas evidências produzem outcome/razões iguais; lacuna de AC/notes/docs bloqueia.

## Dependências

- Passos 6, 9 e 10.

## Checklist pré-handoff

- [ ] ≤ 5 arquivos afetados?
- [ ] Evidence por AC e freshness testadas?
- [ ] Notes aprovadas e docs impact validados?

---

## Prompt de handoff

```text
Implemente APENAS o Passo 11.
Files: @scripts/workflow/lib/evidence.cjs @scripts/workflow/lib/acceptance.cjs @scripts/workflow/lib/orchestrator.cjs @scripts/workflow/test-acceptance.cjs
Out of scope: commit, acceptance global e overrides.
Done criteria: acceptance local determinística exige evidence por AC, notes válidas e docs impact.
---
@specs/steps/automated-spec-pipeline-step-11.md
@specs/automated-spec-pipeline.md
```
