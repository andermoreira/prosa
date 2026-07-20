---
schemaVersion: 1.0.0
id: spec-automated-pipeline-step-12
sequence: 12
specId: spec-automated-pipeline
source: {path: specs/steps/automated-spec-pipeline-step-12.md, hash: 60c78bf653e3dfd82371199f3989e80e11cadfca2e25d8df0d882c9925025e7f, baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4}
goal: Criar exatamente um commit local para step aceito somente sob dupla autorização.
boundaries:
  inScope:
    - behaviorType=vertical
    - owns=preflight, commit local, autorização e resume idempotente
    - invariant=autoCommit false por default e nenhum push
    - allowedDependencies=spec-automated-pipeline-step-11
  outOfScope:
    - doesNotOwn=push, PR, merge, bypass de hook e commit rejeitado
  maxLogicalFiles: 5
dependsOn: [spec-automated-pipeline-step-11]
predictedFiles: [scripts/workflow/lib/git.cjs, scripts/workflow/lib/orchestrator.cjs, scripts/workflow/test-commit.cjs]
allowedAreas: [scripts/workflow]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/automated-spec-pipeline.md, stepPath: specs/steps/automated-spec-pipeline-step-12.md, baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4, implementationNoteIds: [NOTE-01, NOTE-02, NOTE-03]}
acceptanceCriteria:
  - id: AC-16
    evidence:
      - {id: EVIDENCE-19, kind: automated-test, description: "Gate verify-pack cobre espera por commit humano, dupla autorização, hooks, crash e ausência de push.", gateId: verify-pack, resultRef: spec-automated-pipeline-step-12/attempt-1/gate-verify-pack, testSelector: scripts/workflow/test-commit.cjs}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [verify-pack, revalidation]}
revalidation:
  triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume]
  driftPolicy: block
documentationImpact: {kind: none, justification: Autorização de commit será documentada no Step 17.}
testing: {required: true, gateIds: [verify-pack], rationale: "Combinações de flags e crash exigem repositórios temporários."}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 12: Commit opt-in e resume idempotente

## Goal

Criar exatamente um commit local para step aceito somente sob dupla autorização.

## Assumptions

- Acceptance local é positiva e o lock/revalidation permanecem válidos.

## Risks

- Crash entre commit e estado; mitigar reconciliando parent/tree/commit antes de repetir.

## Edge cases

- Quatro combinações de autorização, hook rejeitando, árvore dirty e commit concluído sem state reconciliado.

## Acceptance Criteria

- Só `autoCommit: true` + `--allow-commit` cria commit; hooks são respeitados, resume não duplica e nenhum push ocorre.

## Tarefas

1. Estender `scripts/workflow/lib/git.cjs` com preflight, commit local e reconciliação idempotente.
2. Integrar autorização/transitions em `scripts/workflow/lib/orchestrator.cjs`.
3. Criar `scripts/workflow/test-commit.cjs` cobrindo autorizações, hooks, crash/resume e ausência de push.

## Paths afetados (limite absoluto)

- `scripts/workflow/lib/git.cjs`
- `scripts/workflow/lib/orchestrator.cjs`
- `scripts/workflow/test-commit.cjs`

## Fora de Escopo

- Push, PR, merge, bypass de hook ou commit de step rejeitado.

## Critério de Pronto

- Commit é opt-in, auditado e idempotente em todos os cenários testados.

## Dependências

- Passos 6 e 11; ADR 018.

## Checklist pré-handoff

- [ ] ≤ 5 arquivos afetados?
- [ ] Dupla autorização testada?
- [ ] Resume e ausência de push comprovados?

---

## Prompt de handoff

```text
Implemente APENAS o Passo 12.
Files: @scripts/workflow/lib/git.cjs @scripts/workflow/lib/orchestrator.cjs @scripts/workflow/test-commit.cjs
Out of scope: push, PR, merge, bypass de hook e commit rejeitado.
Done criteria: dupla autorização cria um commit e resume não duplica.
---
@specs/steps/automated-spec-pipeline-step-12.md
@specs/automated-spec-pipeline.md
```
