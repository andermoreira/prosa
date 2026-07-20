---
schemaVersion: 1.0.0
id: spec-automated-pipeline-step-2
sequence: 2
specId: spec-automated-pipeline
source:
  path: specs/steps/automated-spec-pipeline-step-2.md
  hash: 279a08a65a92721a6083b44914e1476e8c5cec808b43f9b1e4f179caf0cbef16
  baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4
goal: Validar review, diagnosis, retrospective, findings e evidence por contratos independentes.
boundaries:
  inScope:
    - behaviorType=vertical
    - owns=schemas de review, diagnosis e retrospective e validator comum
    - invariant=diagnosis não concede mutação ou acceptance
    - allowedDependencies=spec-automated-pipeline-step-1
  outOfScope:
    - doesNotOwn=catálogos, spawn, transitions e acceptance
  maxLogicalFiles: 5
dependsOn:
  - spec-automated-pipeline-step-1
predictedFiles:
  - schemas/review.schema.json
  - schemas/diagnosis.schema.json
  - schemas/retrospective.schema.json
  - scripts/workflow/lib/contracts.cjs
  - scripts/workflow/test-contracts.cjs
allowedAreas:
  - schemas
  - scripts/workflow
resources:
  executor: opencode
  reviewer: opencode-reviewer
  diagnostician: opencode-diagnostician
  notifications: []
context:
  specPath: specs/automated-spec-pipeline.md
  stepPath: specs/steps/automated-spec-pipeline-step-2.md
  baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4
  implementationNoteIds: [NOTE-01, NOTE-02, NOTE-03]
acceptanceCriteria:
  - id: AC-05
    evidence:
      - id: EVIDENCE-02
        kind: contract-test
        description: Gate workflow-tests valida os seis schemas e fixtures negativas.
        gateId: workflow-tests
        resultRef: spec-automated-pipeline-step-2/attempt-1/gate-workflow-tests
        testSelector: scripts/workflow/test-contracts.cjs
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification:
  gateIds: [workflow-tests, revalidation]
revalidation:
  triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, on-resume]
  driftPolicy: block
documentationImpact:
  kind: none
  justification: Contratos internos serão documentados no Step 17.
testing:
  required: true
  gateIds: [workflow-tests]
  rationale: Findings, nullable e campos extras exigem testes contratuais.
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 2: Schemas de análise e retrospectiva

## Goal

Validar review, diagnosis, retrospective, findings e evidence por contratos independentes.

## Assumptions

- Os schemas do Passo 1 e Ajv estão disponíveis.

## Risks

- Verdict de modelo virar acceptance; mitigar mantendo verdict como evidência e acceptance fora do schema de review.

## Edge cases

- Severidade desconhecida, finding duplicado, evidence stale, custo/tokens `null` e diagnosis tentando aprovar.

## Acceptance Criteria

- Review, diagnosis e retrospective têm schemas separados; findings aceitam somente cinco severidades e diagnosis não possui autoridade de mutação/aceite.

## Tarefas

1. Criar `schemas/review.schema.json`, `schemas/diagnosis.schema.json` e `schemas/retrospective.schema.json`.
2. Criar `scripts/workflow/lib/contracts.cjs` para carregar/compilar todos os seis schemas e validar YAML/JSON com erros estáveis.
3. Criar `scripts/workflow/test-contracts.cjs` cobrindo positivos/negativos dos seis contratos, nullable e campos extras.

## Paths afetados (limite absoluto)

- `schemas/review.schema.json`
- `schemas/diagnosis.schema.json`
- `schemas/retrospective.schema.json`
- `scripts/workflow/lib/contracts.cjs`
- `scripts/workflow/test-contracts.cjs`

## Fora de Escopo

- Catálogos, spawn, state transitions ou acceptance.

## Critério de Pronto

- Todos os schemas compilam e fixtures inválidas falham com path/código acionáveis.

## Dependências

- Passo 1.

## Checklist pré-handoff

- [ ] ≤ 5 arquivos afetados?
- [ ] Diagnosis não aprova/corrige?
- [ ] Findings/evidence/nullable testados?

---

## Prompt de handoff

```text
Implemente APENAS o Passo 2.
Files: @schemas/review.schema.json @schemas/diagnosis.schema.json @schemas/retrospective.schema.json @scripts/workflow/lib/contracts.cjs @scripts/workflow/test-contracts.cjs
Out of scope: catálogos, processos, transitions e acceptance.
Done criteria: seis schemas compilam e fixtures positivas/negativas passam.
---
@specs/steps/automated-spec-pipeline-step-2.md
@specs/automated-spec-pipeline.md
```
