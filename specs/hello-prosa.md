---
schemaVersion: 1.0.0
id: spec-hello-prosa
title: Hello Prosa — smoke test com trabalho real
status: approved
source:
  path: specs/hello-prosa.md
  hash: b3ac49fb0bd8a50ab7dc182d1f4d403a70aa97442c2dc1f4a665f56bbb326795
  baseSha: 9f18e55ed2af2bc7da953c56fcc13105754de581
approval:
  approvedBy: user
  approvedAt: 2026-07-17
  baseSha: 9f18e55ed2af2bc7da953c56fcc13105754de581
goal: Criar um script hello-prosa.sh que imprime uma saudação e a versão da prosa, provando o ciclo completo da pipeline com produção de código real.
nonGoals:
  - Alterar código existente
  - Criar testes complexos
acceptanceCriteria:
  - id: AC-01
    description: O script hello-prosa.sh existe, é executável e imprime a saudação com a versão.
implementationNotes: []
documentationImpact:
  kind: none
  justification: Artefato descartável para smoke test.
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
globalGates: []
---

# Hello Prosa — smoke test

> **Formato:** spec lite

**Status:** descartável — existe para provar o ciclo completo da prosa com produção de código real, não para entregar software durável.

Prova de ponta a ponta: spec → step → prosa executada com agente real. Goal, Non-goals e Acceptance criteria são a fonte única no frontmatter (ADR 020).

## Implementation plan

1. Criar `scripts/hello-prosa.sh` — script que lê VERSION.txt e imprime saudação.
