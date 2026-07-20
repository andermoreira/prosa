---
schemaVersion: 1.0.0
id: spec-prosa-os-sandboxing-step-1
sequence: 1
specId: spec-prosa-os-sandboxing
source:
  path: specs/steps/prosa-os-sandboxing-step-1.md
  hash: 4e12d78451ff5dd634df2453d743b247fb31125a93fef758468c5f2d8db0df56
  baseSha: 7fb3c4b5659e5e8a69ceb032a27a25307d4f5ced
goal: Materializar os achados já obtidos do protótipo SRT em um registro reproduzível e auditável.
boundaries:
  inScope:
    - behaviorType=vertical
    - owns=registro documental reproduzível do protótipo macOS
    - invariant=medições observadas não se tornam SLO
    - allowedDependencies=nenhum step anterior
  outOfScope:
    - doesNotOwn=runtime, policy, adapters, gates, MCP e suporte Linux
  maxLogicalFiles: 5
dependsOn: []
predictedFiles:
  - docs/audits/prosa-os-sandboxing-macos-prototype-2026-07-18.md
allowedAreas:
  - docs/audits
resources:
  executor: opencode
  reviewer: opencode-reviewer
  diagnostician: opencode-diagnostician
  notifications: []
context:
  specPath: specs/prosa-os-sandboxing.md
  stepPath: specs/steps/prosa-os-sandboxing-step-1.md
  baseSha: 7fb3c4b5659e5e8a69ceb032a27a25307d4f5ced
  implementationNoteIds:
    - NOTE-01
acceptanceCriteria:
  - id: AC-11
    evidence:
      - id: EVIDENCE-01
        kind: documentation
        description: O relatório registra os vetores macOS reais e os resultados observados do protótipo.
        resultRef: docs/audits/prosa-os-sandboxing-macos-prototype-2026-07-18.md
  - id: AC-12
    evidence:
      - id: EVIDENCE-02
        kind: documentation
        description: O relatório registra método, amostras, baseline e overhead de forma reproduzível.
        resultRef: docs/audits/prosa-os-sandboxing-macos-prototype-2026-07-18.md
budgets:
  maxAttempts: 3
  maxAgentCalls: 6
  maxReviewCycles: 2
  maxDiagnosisCycles: 2
  maxElapsedMinutes: 120
  maxEstimatedCost: null
  maxTokens: null
verification:
  gateIds:
    - specs-lint
    - revalidation
revalidation:
  triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, on-resume]
  driftPolicy: block
documentationImpact:
  kind: paths
  paths:
    - docs/audits/prosa-os-sandboxing-macos-prototype-2026-07-18.md
testing:
  required: false
  gateIds: []
  rationale: O step consolida evidência documental de um protótipo já executado; a repetição automatizada pertence ao Step 8.
execution:
  adapter: opencode
  isolation: git-worktree
  writable: true
  autoCommit: false
  allowPullRequest: false
  correctionStep: false
---
# Passo 1: Registrar o protótipo macOS

## Goal

Materializar os achados já obtidos do protótipo SRT em um registro reproduzível e auditável.

## Assumptions

- O protótipo foi executado em macOS com `@anthropic-ai/sandbox-runtime@0.0.66` e 15 amostras.

## Risks

- Confundir o baseline do harness curto com SLO; registrar ambiente, comando e amostras sem criar limite.

## Edge cases

- Backend diferente de `sandbox-exec`, host sem SRT e arredondamento divergente das medianas.

## Acceptance Criteria

- O registro informa: `.env` bloqueado com `EPERM` via `credentials.files` deny; write do reviewer
  com `EPERM`; rede vazia bloqueada; Unix socket `listen` com `EPERM`; argv com espaços e
  metacaracteres preservado; medianas raw 51,97 ms e sandbox 247,14 ms; overhead 195,17 ms/375,6%.

## Tarefas

1. Criar `docs/audits/prosa-os-sandboxing-macos-prototype-2026-07-18.md` com ambiente, método,
   vetores, resultados, 15 amostras e limitações do protótipo descartável.

## Paths afetados (limite absoluto)

- `docs/audits/prosa-os-sandboxing-macos-prototype-2026-07-18.md`

## Fora de Escopo

- Implementar runtime, policy, adapters, gates ou MCP; declarar Linux suportado.

## Critério de Pronto

- O relatório permite repetir o experimento e distingue observação, decisão e risco residual.

## Dependências

- Nenhuma; os resultados do protótipo já foram fornecidos e registrados no ADR 021.

## Checklist pré-handoff

- [ ] Um arquivo afetado e nenhum número inventado?
- [ ] Todos os vetores e as 15 amostras estão identificados?

## Prompt de handoff

```text
Implemente APENAS o Passo 1.
Files: @docs/audits/prosa-os-sandboxing-macos-prototype-2026-07-18.md
Out of scope: runtime, policy, adapters, gates, MCP e suporte Linux.
Done criteria: relatório reproduzível contém todos os achados macOS e limitações, sem transformar o baseline em SLO.
---
@specs/steps/prosa-os-sandboxing-step-1.md
@specs/prosa-os-sandboxing.md
```
