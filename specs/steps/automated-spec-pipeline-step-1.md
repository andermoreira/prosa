---
schemaVersion: 1.0.0
id: spec-automated-pipeline-step-1
sequence: 1
specId: spec-automated-pipeline
source:
  path: specs/steps/automated-spec-pipeline-step-1.md
  hash: 81fc16eac36b95d1054efb709661fdfa0e686b7334f7679931465ce08406e4b9
  baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4
goal: Estabelecer dependências e contratos JSON separados para entradas normativas e estado runtime.
boundaries:
  inScope:
    - behaviorType=vertical
    - owns=manifests npm e schemas de spec, step e state
    - invariant=schemas fechados não persistem DAG autoral
    - allowedDependencies=nenhum step anterior
  outOfScope:
    - doesNotOwn=processos, catálogos e schemas de review, diagnosis ou retrospective
  maxLogicalFiles: 5
dependsOn: []
predictedFiles:
  - package.json
  - package-lock.json
  - schemas/spec.schema.json
  - schemas/step.schema.json
  - schemas/state.schema.json
allowedAreas:
  - package.json
  - package-lock.json
  - schemas
resources:
  executor: opencode
  reviewer: opencode-reviewer
  diagnostician: opencode-diagnostician
  notifications: []
context:
  specPath: specs/automated-spec-pipeline.md
  stepPath: specs/steps/automated-spec-pipeline-step-1.md
  baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4
  implementationNoteIds:
    - NOTE-01
    - NOTE-02
    - NOTE-03
acceptanceCriteria:
  - id: AC-05
    evidence:
      - id: EVIDENCE-01
        kind: contract-test
        description: Gate workflow-tests comprova compilação e rejeição de contratos inválidos.
        gateId: workflow-tests
        resultRef: spec-automated-pipeline-step-1/attempt-1/gate-workflow-tests
        testSelector: scripts/workflow/test-contracts.cjs
budgets: &stepBudgets
  maxAttempts: 3
  maxAgentCalls: 6
  maxReviewCycles: 2
  maxDiagnosisCycles: 2
  maxElapsedMinutes: 120
  maxEstimatedCost: null
  maxTokens: null
verification:
  gateIds:
    - workflow-tests
    - revalidation
revalidation: &standardRevalidation
  triggers:
    - after-lock
    - before-worktree
    - before-agent-call
    - after-agent-call
    - after-diff
    - after-gate
    - before-review
    - after-review
    - before-diagnosis
    - after-diagnosis
    - before-acceptance
    - on-resume
  driftPolicy: block
documentationImpact:
  kind: none
  justification: Este step cria contratos executáveis; a documentação durável será consolidada no Step 17.
testing:
  required: true
  gateIds:
    - workflow-tests
  rationale: Os schemas e dependências exigem fixtures positivas e negativas.
execution: &stepExecution
  adapter: opencode
  isolation: git-worktree
  writable: true
  autoCommit: false
  allowPullRequest: false
  correctionStep: false
---
# Passo 1: Schemas de spec, step e state

## Goal

Estabelecer dependências e contratos JSON separados para entradas normativas e estado runtime.

## Assumptions

- O repositório ainda não possui manifesto npm raiz; Ajv e `yaml` precisam ser pinados.

## Risks

- Schemas virarem um manifesto DAG; mitigar limitando-os às representações normalizadas definidas na spec.

## Edge cases

- AC sem ID, note sem aprovação, transition desconhecida, budget ausente e campo extra.

## Acceptance Criteria

- Os três schemas são fechados, versionados e representam aprovação, AC/evidence, documentation impact, state machine, lock e counters.

## Tarefas

1. Criar `package.json` e `package-lock.json` apenas com o runtime/test scripts necessários e dependências pinadas Ajv + `yaml`.
2. Criar `schemas/spec.schema.json`, `schemas/step.schema.json` e `schemas/state.schema.json` conforme os contratos da spec.
3. Incluir implementation notes aprovadas, budgets, resource/gate IDs, AC IDs, evidence refs, documentation impact, states/transitions, lock e reservas.

## Paths afetados (limite absoluto)

- `package.json`
- `package-lock.json`
- `schemas/spec.schema.json`
- `schemas/step.schema.json`
- `schemas/state.schema.json`

## Fora de Escopo

- DAG persistido, execução de processo ou schemas de review/diagnosis/retrospective.

## Critério de Pronto

- Os schemas compilam com Ajv e não aceitam campos desconhecidos nos objetos controlados.

## Dependências

- Spec mestre e ADRs 015, 017 e 018.

## Checklist pré-handoff

- [ ] ≤ 5 arquivos afetados, incluindo manifests?
- [ ] Schemas separados e sem manifesto DAG?
- [ ] Notes, budgets, evidence e docs impact representados?

---

## Prompt de handoff

```text
Implemente APENAS o Passo 1.
Files: @package.json @package-lock.json @schemas/spec.schema.json @schemas/step.schema.json @schemas/state.schema.json
Out of scope: DAG persistido, processos e demais schemas.
Done criteria: schemas fechados compilam com Ajv e cobrem os contratos listados.
---
@specs/steps/automated-spec-pipeline-step-1.md
@specs/automated-spec-pipeline.md
```
