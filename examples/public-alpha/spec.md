---
schemaVersion: 1.0.0
id: spec-public-alpha-example
title: Public alpha example
status: approved
source:
  path: examples/public-alpha/spec.md
  hash: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  baseSha: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
approval:
  approvedBy: demo-user
  approvedAt: 2026-07-26
  baseSha: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
goal: Demonstrate a deterministic and reviewable documentation change.
nonGoals:
  - Call a real agent or external service.
  - Commit, push or open a pull request.
acceptanceCriteria:
  - id: AC-01
    description: The example completes validation, gate, review, human decision and reporting.
implementationNotes: []
documentationImpact:
  kind: paths
  paths:
    - examples/public-alpha/output.md
budgets:
  maxAttemptsPerStep: 1
  maxAttemptsTotal: 1
  maxAgentCallsPerStep: 1
  maxAgentCallsTotal: 1
  maxReviewCyclesPerStep: 1
  maxReviewCyclesTotal: 1
  maxDiagnosisCyclesPerStep: 1
  maxDiagnosisCyclesTotal: 1
  maxElapsedMinutesPerStep: 5
  maxElapsedMinutesTotal: 5
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
  - workflow-tests
---
# Public alpha example

> **Formato:** spec lite

## Implementation plan

1. Produce a fictitious documentation artifact and submit it to the deterministic review cycle.
