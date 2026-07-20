---
schemaVersion: 1.0.0
id: spec-automated-pipeline-step-10
sequence: 10
specId: spec-automated-pipeline
source: {path: specs/steps/automated-spec-pipeline-step-10.md, hash: 4a44d664c97e1066f6068da670c4d14b249e029d147d924aa0765f47e5eb98b3, baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4}
goal: Produzir review e diagnosis fresh e read-only com findings estruturados e backlog para triagem humana.
boundaries:
  inScope:
    - behaviorType=vertical
    - owns=review, diagnosis, findings e backlog
    - invariant=critical bloqueia imediatamente; high bloqueia com correction apenas elegível; medium e low exigem backlog
    - allowedDependencies=spec-automated-pipeline-step-9
  outOfScope:
    - doesNotOwn=acceptance, edição automática, issue automática e correction step
  maxLogicalFiles: 5
dependsOn: [spec-automated-pipeline-step-9]
predictedFiles: [scripts/workflow/lib/review.cjs, scripts/workflow/lib/findings.cjs, scripts/workflow/lib/orchestrator.cjs, scripts/workflow/test-review.cjs]
allowedAreas: [scripts/workflow]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/automated-spec-pipeline.md, stepPath: specs/steps/automated-spec-pipeline-step-10.md, baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4, implementationNoteIds: [NOTE-01, NOTE-02, NOTE-03]}
acceptanceCriteria:
  - id: AC-08
    evidence:
      - {id: EVIDENCE-15, kind: automated-test, description: "Gate verify-pack comprova diagnosis obrigatório e bounded.", gateId: verify-pack, resultRef: spec-automated-pipeline-step-10/attempt-1/gate-verify-pack, testSelector: scripts/workflow/test-review.cjs}
  - id: AC-14
    evidence:
      - {id: EVIDENCE-16, kind: automated-test, description: "Gate verify-pack valida sessões fresh read-only, critical/high bloqueantes e backlog obrigatório para medium/low.", gateId: verify-pack, resultRef: spec-automated-pipeline-step-10/attempt-1/gate-verify-pack, testSelector: scripts/workflow/test-review.cjs}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [verify-pack, revalidation]}
revalidation:
  triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, on-resume]
  driftPolicy: block
documentationImpact: {kind: none, justification: Fluxo de findings será documentado no Step 17.}
testing: {required: true, gateIds: [verify-pack], rationale: "Read-only, severidade e ciclos exigem testes com adapters fake."}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 10: Review, diagnosis e findings

## Goal

Produzir review/diagnosis fresh e read-only com findings estruturados e backlog para triagem humana.

## Assumptions

- Somente artifacts sanitizados e revalidados entram nos snapshots.

## Risks

- Diagnostician ou reviewer alterar o alvo; mitigar por resource read-only e verificação antes/depois.

## Edge cases

- Severidade fora de `critical/high/medium/low`, finding duplicado, backlog ausente para `medium/low`, resposta incompleta, tentativa de escrita e budget de ciclos esgotado.

## Acceptance Criteria

- `critical` bloqueia imediatamente; `high` bloqueia e pode ser correction eligible sob regras, com auto correction desabilitada; todo `medium/low` entra obrigatoriamente no backlog; diagnosis não corrige/aprova e consome budget.

## Tarefas

1. Criar `scripts/workflow/lib/review.cjs` para snapshots, review e diagnosis sob schemas/budget/revalidation.
2. Criar `scripts/workflow/lib/findings.cjs` para o enum fechado `critical/high/medium/low`, fingerprint, regras de correction eligibility para `high`, deduplicação sem perda e backlog obrigatório para `medium/low`.
3. Integrar ciclos e gatilho pós-falha repetida em `scripts/workflow/lib/orchestrator.cjs`.
4. Criar `scripts/workflow/test-review.cjs` cobrindo read-only, sessões fresh, findings e ausência de correction step.

## Paths afetados (limite absoluto)

- `scripts/workflow/lib/review.cjs`
- `scripts/workflow/lib/findings.cjs`
- `scripts/workflow/lib/orchestrator.cjs`
- `scripts/workflow/test-review.cjs`

## Fora de Escopo

- Acceptance, edição automática, issue automática ou correction step.

## Critério de Pronto

- Papéis não mutam o worktree; `critical/high` impedem avanço, auto correction não ocorre e a ausência de qualquer `medium/low` no backlog reprova o review.

## Dependências

- Passos 2, 7, 8 e 9.

## Checklist pré-handoff

- [ ] ≤ 5 arquivos afetados?
- [ ] Findings usam enum fechado?
- [ ] Diagnosis sem verdict/edição e correction step ausente?

---

## Prompt de handoff

```text
Implemente APENAS o Passo 10.
Files: @scripts/workflow/lib/review.cjs @scripts/workflow/lib/findings.cjs @scripts/workflow/lib/orchestrator.cjs @scripts/workflow/test-review.cjs
Out of scope: acceptance, edição/issue automática e correction step.
Done criteria: review/diagnosis fresh read-only e findings/backlog seguem schemas e budgets.
---
@specs/steps/automated-spec-pipeline-step-10.md
@specs/automated-spec-pipeline.md
```
