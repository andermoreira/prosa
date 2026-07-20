---
schemaVersion: 1.0.0
id: spec-automated-pipeline-step-8
sequence: 8
specId: spec-automated-pipeline
source: {path: specs/steps/automated-spec-pipeline-step-8.md, hash: 4d03271c89b0315a581ea8f2f8690f7470d564fa8a516ef9a79378b045041f40, baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4}
goal: Executar OpenCode por papel e tentativa fresh, sob budget, resources e revalidation antes e depois.
boundaries:
  inScope:
    - behaviorType=vertical
    - owns=adapter OpenCode e primeira fatia do orchestrator
    - invariant=toda agent call é fresh, reservada e revalidada
    - allowedDependencies=spec-automated-pipeline-step-7
  outOfScope:
    - doesNotOwn=artifacts completos, acceptance, commit e outros adapters
  maxLogicalFiles: 5
dependsOn: [spec-automated-pipeline-step-7]
predictedFiles: [scripts/workflow/lib/opencode.cjs, scripts/workflow/lib/orchestrator.cjs, scripts/workflow/test-opencode.cjs]
allowedAreas: [scripts/workflow]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/automated-spec-pipeline.md, stepPath: specs/steps/automated-spec-pipeline-step-8.md, baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4, implementationNoteIds: [NOTE-01, NOTE-02, NOTE-03]}
acceptanceCriteria:
  - id: AC-09
    evidence:
      - {id: EVIDENCE-12, kind: automated-test, description: "Gate verify-pack valida o adapter OpenCode e sessões fresh.", gateId: verify-pack, resultRef: spec-automated-pipeline-step-8/attempt-1/gate-verify-pack, testSelector: scripts/workflow/test-opencode.cjs}
  - id: AC-10
    evidence:
      - {id: EVIDENCE-13, kind: automated-test, description: "Gate verify-pack comprova revalidation antes e depois da chamada.", gateId: verify-pack, resultRef: spec-automated-pipeline-step-8/attempt-1/gate-verify-pack, testSelector: scripts/workflow/test-opencode.cjs}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [verify-pack, revalidation]}
revalidation:
  triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, on-resume]
  driftPolicy: block
documentationImpact: {kind: none, justification: Uso do adapter será documentado no Step 17.}
testing: {required: true, gateIds: [verify-pack], rationale: "Adapter fake cobre contrato, crash e drift sem agente real."}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 8: Adapter OpenCode e revalidation de chamadas

## Goal

Executar OpenCode por papel/tentativa fresh, sob budget, resources e revalidation antes/depois.

## Assumptions

- Process, resources, state e budget oferecem operações testáveis e fail-closed.

## Risks

- Mudança de CLI ser aceita como sucesso; mitigar validando versão, exit status e output.

## Edge cases

- OpenCode ausente, saída parcial, timeout, crash após chamada, budget reservado e drift durante execução.

## Acceptance Criteria

- Cada chamada usa sessão fresh, reserva budget e só produz evidência reutilizável após revalidation pós-chamada.

## Tarefas

1. Criar `scripts/workflow/lib/opencode.cjs` para executor/reviewer/diagnostician com capabilities específicas e métricas nullable.
2. Criar `scripts/workflow/lib/orchestrator.cjs` com primeira fatia state→budget→revalidation→agent call→revalidation.
3. Criar `scripts/workflow/test-opencode.cjs` com adapter fake e falhas contratuais/crash/drift.

## Paths afetados (limite absoluto)

- `scripts/workflow/lib/opencode.cjs`
- `scripts/workflow/lib/orchestrator.cjs`
- `scripts/workflow/test-opencode.cjs`

## Fora de Escopo

- Artifacts completos, review, acceptance, commit ou outro adapter.

## Critério de Pronto

- Prosa livre não concede sucesso e resume não duplica chamada reconciliada.

## Dependências

- Passos 3, 5 e 7.

## Checklist pré-handoff

- [ ] ≤ 5 arquivos afetados?
- [ ] Sessões fresh por papel/tentativa?
- [ ] Budget e revalidation cercam toda chamada?

---

## Prompt de handoff

```text
Implemente APENAS o Passo 8.
Files: @scripts/workflow/lib/opencode.cjs @scripts/workflow/lib/orchestrator.cjs @scripts/workflow/test-opencode.cjs
Out of scope: artifacts completos, review, acceptance, commit e outros adapters.
Done criteria: OpenCode fake roda sob budget/revalidation e falha fechado em drift/contrato inválido.
---
@specs/steps/automated-spec-pipeline-step-8.md
@specs/automated-spec-pipeline.md
```
