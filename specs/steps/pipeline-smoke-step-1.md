---
schemaVersion: 1.0.0
id: spec-pipeline-smoke-step-1
sequence: 1
specId: spec-pipeline-smoke
source:
  path: specs/steps/pipeline-smoke-step-1.md
  hash: c009e4e937f30e69a5f88001138794f5a3261693a6750e6ac6a9bc33590dde80
  baseSha: ba369b18471544638e1be4c27e0f184490458bcb
goal: Criar um documento curto em docs/ para dar ao executor trabalho real, mínimo e verificável.
boundaries:
  inScope:
    - behaviorType=vertical
    - owns=docs/pipeline-smoke-probe.md
    - invariant=nenhum arquivo fora de docs/ é tocado
    - allowedDependencies=nenhum step anterior
  outOfScope:
    - doesNotOwn=código, schemas, catálogos, specs e testes
  maxLogicalFiles: 5
dependsOn: []
predictedFiles:
  - docs/pipeline-smoke-probe.md
allowedAreas:
  - docs
resources:
  executor: cursor-cli
  reviewer: cursor-cli-reviewer
  diagnostician: cursor-cli-diagnostician
  notifications: []
context:
  specPath: specs/pipeline-smoke.md
  stepPath: specs/steps/pipeline-smoke-step-1.md
  baseSha: ba369b18471544638e1be4c27e0f184490458bcb
  implementationNoteIds:
    - NOTE-01
acceptanceCriteria:
  - id: AC-01
    evidence:
      - id: EVIDENCE-01
        kind: static-check
        description: Gate specs-lint comprova que a estrutura de specs segue íntegra após o diff.
        gateId: specs-lint
        resultRef: spec-pipeline-smoke-step-1/attempt-1/gate-specs-lint
        testSelector: scripts/lint-specs.cjs
budgets:
  maxAttempts: 2
  maxAgentCalls: 4
  maxReviewCycles: 2
  maxDiagnosisCycles: 1
  maxElapsedMinutes: 30
  maxEstimatedCost: null
  maxTokens: null
verification:
  gateIds:
    - specs-lint
    - revalidation
revalidation:
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
  kind: paths
  paths:
    - docs/pipeline-smoke-probe.md
testing:
  required: true
  gateIds:
    - specs-lint
  rationale: O único gate relevante é a integridade estrutural de specs após o diff; não há código a testar.
execution:
  adapter: opencode
  isolation: git-worktree
  writable: true
  autoCommit: false
  allowPullRequest: false
  correctionStep: false
---
# Passo 1: Documento de prova

## Goal

Criar um documento curto em `docs/` para dar ao executor trabalho real, mínimo e verificável.

## Assumptions

- O arquivo não existe no base SHA; o step o cria do zero.

## Risks

- O executor expandir escopo para além de `docs/`; mitigado pelo allowlist e pelo limite de escopo.

## Edge cases

- Arquivo já existente: o step deve falhar em vez de sobrescrever silenciosamente.

## Acceptance Criteria

- `docs/pipeline-smoke-probe.md` existe, tem as três seções pedidas e nada fora de `docs/` mudou.

## Tarefas

1. Criar `docs/pipeline-smoke-probe.md` com exatamente estas três seções, nesta ordem:
   - `# Pipeline smoke probe`
   - `## Origem` — uma frase dizendo que o arquivo foi gerado por uma execução do pipeline
     automatizado a partir de `specs/steps/pipeline-smoke-step-1.md`.
   - `## Descarte` — uma frase dizendo que o arquivo é descartável e não deve ser mantido.

## Paths afetados (limite absoluto)

- `docs/pipeline-smoke-probe.md`

## Fora de Escopo

- Qualquer arquivo fora de `docs/`. Não edite código, schemas, specs, catálogos ou testes.

## Critério de Pronto

- O arquivo existe com as três seções na ordem pedida.

## Dependências

- Nenhuma.

## Checklist pré-handoff

- [ ] Exatamente 1 arquivo afetado?
- [ ] Nada fora de `docs/` tocado?

---

## Prompt de handoff

```text
Implemente APENAS o Passo 1.
Files: @docs/pipeline-smoke-probe.md
Out of scope: qualquer arquivo fora de docs/.
Done criteria: o arquivo existe com as seções Origem e Descarte.
---
@specs/steps/pipeline-smoke-step-1.md
@specs/pipeline-smoke.md
```
