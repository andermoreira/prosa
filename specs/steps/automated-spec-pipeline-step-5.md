---
schemaVersion: 1.0.0
id: spec-automated-pipeline-step-5
sequence: 5
specId: spec-automated-pipeline
source:
  path: specs/steps/automated-spec-pipeline-step-5.md
  hash: c9dac63f1f1a230e0c6199e8267ef313fead5e2993c2f9881f6881d4b9f08fe4
  baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4
goal: Derivar o DAG e persistir uma state machine protegida por lock atômico por repositório.
boundaries:
  inScope:
    - behaviorType=vertical
    - owns=DAG derivado, state machine, runtime, lock e ignore
    - invariant=uma execução mutável por repo e runtime sem requisitos autorais
    - allowedDependencies=spec-automated-pipeline-step-4
  outOfScope:
    - doesNotOwn=worktree, agents, gates e acceptance
  maxLogicalFiles: 5
dependsOn: [spec-automated-pipeline-step-4]
predictedFiles:
  - scripts/workflow/lib/dag.cjs
  - scripts/workflow/lib/state-machine.cjs
  - scripts/workflow/lib/runtime.cjs
  - scripts/workflow/test-state.cjs
  - .gitignore
allowedAreas:
  - scripts/workflow
  - .gitignore
resources:
  executor: opencode
  reviewer: opencode-reviewer
  diagnostician: opencode-diagnostician
  notifications: []
context:
  specPath: specs/automated-spec-pipeline.md
  stepPath: specs/steps/automated-spec-pipeline-step-5.md
  baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4
  implementationNoteIds: [NOTE-01, NOTE-02, NOTE-03]
acceptanceCriteria:
  - id: AC-01
    evidence:
      - id: EVIDENCE-05
        kind: automated-test
        description: Gate verify-pack valida derivação determinística do DAG.
        gateId: verify-pack
        resultRef: spec-automated-pipeline-step-5/attempt-1/gate-verify-pack
        testSelector: scripts/workflow/test-state.cjs
  - id: AC-02
    evidence:
      - id: EVIDENCE-06
        kind: automated-test
        description: Gate verify-pack valida exclusão mútua e stale recovery.
        gateId: verify-pack
        resultRef: spec-automated-pipeline-step-5/attempt-1/gate-verify-pack
        testSelector: scripts/workflow/test-state.cjs
  - id: AC-03
    evidence:
      - id: EVIDENCE-07
        kind: automated-test
        description: Gate verify-pack valida transitions e persistência atômica.
        gateId: verify-pack
        resultRef: spec-automated-pipeline-step-5/attempt-1/gate-verify-pack
        testSelector: scripts/workflow/test-state.cjs
  - id: AC-04
    evidence:
      - id: EVIDENCE-08
        kind: static-check
        description: Gate verify-pack comprova .workflow-runtime no .gitignore e ausência de requisitos no runtime.
        gateId: verify-pack
        resultRef: spec-automated-pipeline-step-5/attempt-1/gate-verify-pack
        testSelector: scripts/workflow/test-state.cjs
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification:
  gateIds: [verify-pack, revalidation]
revalidation:
  triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, on-resume]
  driftPolicy: block
documentationImpact:
  kind: none
  justification: Operação de state e lock será documentada no Step 17.
testing:
  required: true
  gateIds: [verify-pack]
  rationale: Concorrência, crash e transitions exigem testes determinísticos.
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 5: DAG, state machine, runtime e lock

## Goal

Derivar o DAG e persistir uma state machine protegida por lock atômico por repositório.

## Assumptions

- Spec/steps/notes normalizados passam pelos schemas; `.workflow-runtime/` pode ser descartado.

## Risks

- Stale lock ser liberado incorretamente; mitigar exigindo prova de processo, identidade e confirmação.

## Edge cases

- Ciclo/órfão, transition inválida, dois runs concorrentes, PID reutilizado, crash na aquisição e clone movido.

## Acceptance Criteria

- Um único run mutável detém lock; transitions são validadas/persistidas atomicamente e runtime não vira SSOT.

## Tarefas

1. Criar `scripts/workflow/lib/dag.cjs` para derivação sem manifesto.
2. Criar `scripts/workflow/lib/state-machine.cjs` com estados/transições da spec.
3. Criar `scripts/workflow/lib/runtime.cjs` com escrita atômica, lock/recovery e artifact refs iniciais.
4. Criar `scripts/workflow/test-state.cjs` cobrindo DAG, transitions, concorrência, stale recovery e crash.
5. Atualizar `.gitignore` para ignorar `.workflow-runtime/` sem esconder fontes canônicas.

## Paths afetados (limite absoluto)

- `scripts/workflow/lib/dag.cjs`
- `scripts/workflow/lib/state-machine.cjs`
- `scripts/workflow/lib/runtime.cjs`
- `scripts/workflow/test-state.cjs`
- `.gitignore`

## Fora de Escopo

- Worktree, agents, gates ou acceptance.

## Critério de Pronto

- Concorrência é bloqueada e resume não aceita estado/transição inválidos.

## Dependências

- Passos 1, 2 e 4; ADRs 015 e 018.

## Checklist pré-handoff

- [ ] ≤ 5 arquivos afetados?
- [ ] Lock usa identidade real do repo?
- [ ] Runtime ignorado e sem requisitos autorais?

---

## Prompt de handoff

```text
Implemente APENAS o Passo 5.
Files: @scripts/workflow/lib/dag.cjs @scripts/workflow/lib/state-machine.cjs @scripts/workflow/lib/runtime.cjs @scripts/workflow/test-state.cjs @.gitignore
Out of scope: worktrees, agents, gates e acceptance.
Done criteria: DAG derivado, transitions atômicas e lock exclusivo/recovery seguro testados.
---
@specs/steps/automated-spec-pipeline-step-5.md
@specs/automated-spec-pipeline.md
```
