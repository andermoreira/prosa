---
schemaVersion: 1.0.0
id: spec-automated-pipeline-step-7
sequence: 7
specId: spec-automated-pipeline
source: {path: specs/steps/automated-spec-pipeline-step-7.md, hash: 629b99dcf1d1b972b05d4a067ea8143fc3e67f863a20a15e8c932d1850f2939d, baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4}
goal: Limitar e persistir tentativas, chamadas, ciclos, tempo, custo estimado e tokens antes de qualquer ação onerosa.
boundaries:
  inScope:
    - behaviorType=vertical
    - owns=budget ledger, reservas, retries e gatilho de diagnosis
    - invariant=nenhuma ação excede budget e retry determinístico é proibido
    - allowedDependencies=spec-automated-pipeline-step-6
  outOfScope:
    - doesNotOwn=retry ilimitado, override e correction step automático
  maxLogicalFiles: 5
dependsOn: [spec-automated-pipeline-step-6]
predictedFiles: [scripts/workflow/lib/budget.cjs, scripts/workflow/lib/retry.cjs, scripts/workflow/test-budget.cjs]
allowedAreas: [scripts/workflow]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/automated-spec-pipeline.md, stepPath: specs/steps/automated-spec-pipeline-step-7.md, baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4, implementationNoteIds: [NOTE-01, NOTE-02, NOTE-03]}
acceptanceCriteria:
  - id: AC-07
    evidence:
      - {id: EVIDENCE-10, kind: automated-test, description: "Gate verify-pack cobre reservas, limites e reconciliação após crash.", gateId: verify-pack, resultRef: spec-automated-pipeline-step-7/attempt-1/gate-verify-pack, testSelector: scripts/workflow/test-budget.cjs}
  - id: AC-08
    evidence:
      - {id: EVIDENCE-11, kind: automated-test, description: "Gate verify-pack comprova retries classificados e diagnosis obrigatório após falha repetida elegível.", gateId: verify-pack, resultRef: spec-automated-pipeline-step-7/attempt-1/gate-verify-pack, testSelector: scripts/workflow/test-budget.cjs}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [verify-pack, revalidation]}
revalidation:
  triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, on-resume]
  driftPolicy: block
documentationImpact: {kind: none, justification: Budgets e retries serão documentados no Step 17.}
testing: {required: true, gateIds: [verify-pack], rationale: "Reservas e crash exigem testes determinísticos."}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 7: Budgets, reservas e retries

## Goal

Limitar e persistir tentativas, chamadas, ciclos, tempo, custo estimado e tokens antes de qualquer ação onerosa.

## Assumptions

- State/runtime persistem counters e reservas atomicamente; custo/tokens do adapter podem ser `null`.

## Risks

- Crash causar overshoot; mitigar reservando antes da chamada e reconciliando no resume.

## Edge cases

- Limite exatamente alcançado, reserva órfã, elapsed excedido durante chamada, medição nullable e erro não retryable.

## Acceptance Criteria

- Todos os budgets exigidos bloqueiam antes do excesso; retries são finitos e falha repetida elegível exige diagnosis antes da próxima tentativa.

## Tarefas

1. Criar `scripts/workflow/lib/budget.cjs` com ledger por step e total para attempts, agent calls, review/diagnosis cycles, elapsed, cost e tokens nullable, usando os nomes definidos na spec.
2. Criar `scripts/workflow/lib/retry.cjs` com classificação, limites e gatilho obrigatório de diagnosis; schema/trust/escopo/autorização não repetem.
3. Criar `scripts/workflow/test-budget.cjs` cobrindo reserva/reconciliação, crash, nullable, bloqueio e diagnosis após falha repetida.

## Paths afetados (limite absoluto)

- `scripts/workflow/lib/budget.cjs`
- `scripts/workflow/lib/retry.cjs`
- `scripts/workflow/test-budget.cjs`

## Fora de Escopo

- Retry ilimitado, override de budget ou correction step automático.

## Critério de Pronto

- Nenhuma ação ultrapassa budget e counters permanecem corretos após interrupção/resume.

## Dependências

- Passos 2 e 5.

## Checklist pré-handoff

- [ ] ≤ 5 arquivos afetados?
- [ ] Todos os grupos de budget cobertos por step e total?
- [ ] Diagnosis obrigatório e correction step desabilitado?

---

## Prompt de handoff

```text
Implemente APENAS o Passo 7.
Files: @scripts/workflow/lib/budget.cjs @scripts/workflow/lib/retry.cjs @scripts/workflow/test-budget.cjs
Out of scope: retry ilimitado, override e correction step.
Done criteria: ledger/reservas bloqueiam limites e falha repetida elegível exige diagnosis.
---
@specs/steps/automated-spec-pipeline-step-7.md
@specs/automated-spec-pipeline.md
```
