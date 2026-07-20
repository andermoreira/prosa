---
schemaVersion: 1.0.0
id: spec-pipeline-smoke
title: Prova de ponta a ponta do pipeline com trabalho real
status: approved
source:
  path: specs/pipeline-smoke.md
  hash: c5e937e6fd66e490e642d4cadcf22d675a47bbee6acb5a5f1e889d94e1df807e
  baseSha: ba369b18471544638e1be4c27e0f184490458bcb
approval:
  approvedBy: user
  approvedAt: 2026-07-16
  baseSha: ba369b18471544638e1be4c27e0f184490458bcb
goal: Provar que um step com trabalho real percorre executor, diff, gates, review e acceptance — o caminho que nenhuma execução exercitou.
nonGoals:
  - Entregar funcionalidade durável; o artefato produzido é descartável.
  - Exercitar commit automático, PR, resume ou global review.
  - Substituir a spec do pipeline ou alterar seu contrato.
acceptanceCriteria:
  - id: AC-01
    description: O step produz um arquivo novo em docs/, o diff é coletado e os gates declarados passam sobre ele.
implementationNotes:
  - id: NOTE-01
    content: A execução é descartável e existe para observar o caminho do executor em diante; o resultado não deve ser commitado nem integrado.
    approvedBy: user
    approvedAt: 2026-07-16
    baseSha: ba369b18471544638e1be4c27e0f184490458bcb
documentationImpact:
  kind: paths
  paths:
    - docs/pipeline-smoke-probe.md
budgets:
  maxAttemptsPerStep: 2
  maxAttemptsTotal: 4
  maxAgentCallsPerStep: 4
  maxAgentCallsTotal: 8
  maxReviewCyclesPerStep: 2
  maxReviewCyclesTotal: 4
  maxDiagnosisCyclesPerStep: 1
  maxDiagnosisCyclesTotal: 2
  maxElapsedMinutesPerStep: 30
  maxElapsedMinutesTotal: 60
  maxEstimatedCostPerStep: null
  maxEstimatedCostTotal: null
  maxTokensPerStep: null
  maxTokensTotal: null
execution:
  adapter: opencode
  autoCommit: false
  pullRequest: false
  correctionStep: false
  notificationResourceIds: []
isolation:
  strategy: git-worktree
  operatingSystemSandbox: true
  shell: false
  reviewerReadOnly: true
  diagnosticianReadOnly: true
review:
  local: true
  final: true
  globalAcceptance: true
  freshSessions: true
  blockingSeverities:
    - critical
    - high
globalGates:
  - specs-lint
---
# Prova de ponta a ponta do pipeline

> **Formato:** spec lite

**Status:** descartável — existe para observar o pipeline, não para entregar software.

## Goal

Provar que um step com trabalho real percorre executor, diff, gates, review e acceptance — o caminho
que nenhuma execução exercitou.

Até aqui o pipeline só foi observado até o spawn do executor. A spec do próprio pipeline não serve
mais como alvo: seus 20 steps já estão implementados, então o executor sempre encontra o contrato
satisfeito e delibera até o timeout sem produzir diff. Esta spec dá a ele algo pequeno e real para
fazer.

## Non-goals

- Entregar funcionalidade durável; o artefato produzido é descartável.
- Exercitar commit automático, PR, resume ou global review.
- Substituir a spec do pipeline ou alterar seu contrato.

## Acceptance criteria

1. **AC-01:** o step cria `docs/pipeline-smoke-probe.md`, o diff é coletado dentro do escopo
   declarado e o gate `specs-lint` passa sobre o worktree resultante.

## Implementation plan

1. Criar `docs/pipeline-smoke-probe.md` com o conteúdo mínimo descrito no step.
