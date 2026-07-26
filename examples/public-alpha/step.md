---
schemaVersion: 2.0.0
changeType: documentation
id: spec-public-alpha-example-step-1
sequence: 1
specId: spec-public-alpha-example
source:
  path: examples/public-alpha/step.md
  hash: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  baseSha: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
goal: Produce a fictitious documentation artifact for deterministic review.
boundaries:
  inScope:
    - owns=examples/public-alpha/output.md
    - invariant=no external calls
  outOfScope:
    - doesNotOwn=production code, Git state or remote services
  maxLogicalFiles: 5
dependsOn: []
predictedFiles:
  - examples/public-alpha/output.md
allowedAreas:
  - examples/public-alpha
resources:
  executor: opencode
  reviewer: opencode-reviewer
  diagnostician: opencode-diagnostician
  notifications: []
context:
  specPath: examples/public-alpha/spec.md
  stepPath: examples/public-alpha/step.md
  baseSha: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
  implementationNoteIds: []
acceptanceCriteria:
  - id: AC-01
    evidence:
      - id: EVIDENCE-01
        kind: automated-test
        description: The deterministic demo covers the complete decision cycle.
        gateId: workflow-tests
        resultRef: public-alpha/demo-test
        testSelector: scripts/workflow/test-demo-public-alpha.cjs
budgets:
  maxAttempts: 1
  maxAgentCalls: 1
  maxReviewCycles: 1
  maxDiagnosisCycles: 1
  maxElapsedMinutes: 5
  maxEstimatedCost: null
  maxTokens: null
verification:
  gateIds:
    - workflow-tests
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
    - before-acceptance
  driftPolicy: block
documentationImpact:
  kind: paths
  paths:
    - examples/public-alpha/output.md
testing:
  required: true
  gateIds:
    - workflow-tests
  rationale: The public demo must remain deterministic.
execution:
  adapter: opencode
  isolation: git-worktree
  writable: true
  autoCommit: false
  allowPullRequest: false
  correctionStep: false
---
# Public alpha example step

Create one fictitious documentation artifact. The public runner simulates the mutation while using
the real contract validators and a deterministic review record.
