---
schemaVersion: 1.0.0
id: spec-hello-prosa-step-1
sequence: 1
specId: spec-hello-prosa
source:
  path: specs/steps/hello-prosa-step-1.md
  hash: 274e06c39c83c22beb591525649380b93edd6c9fb21b385fe8eebe4a40ef78fe
  baseSha: 9f18e55ed2af2bc7da953c56fcc13105754de581
goal: "Criar scripts/hello-prosa.sh — script bash que lê VERSION.txt e imprime saudação"
boundaries:
  inScope:
    - behaviorType=vertical
    - owns=scripts/hello-prosa.sh
    - invariant=script é executável com shebang bash
    - allowedDependencies=nenhum step anterior
  outOfScope:
    - doesNotOwn=outros scripts, código existente, testes
  maxLogicalFiles: 5
dependsOn: []
predictedFiles:
  - scripts/hello-prosa.sh
allowedAreas:
  - scripts
resources:
  executor: opencode
  reviewer: opencode-reviewer
  diagnostician: opencode-diagnostician
  notifications: []
context:
  specPath: specs/hello-prosa.md
  stepPath: specs/steps/hello-prosa-step-1.md
  baseSha: 9f18e55ed2af2bc7da953c56fcc13105754de581
  implementationNoteIds: []
acceptanceCriteria:
  - id: AC-01
    evidence:
      - id: EVIDENCE-01
        kind: documentation
        description: "scripts/hello-prosa.sh criado e executável"
        resultRef: scripts/hello-prosa.sh
budgets:
  maxAttempts: 2
  maxAgentCalls: 4
  maxReviewCycles: 2
  maxDiagnosisCycles: 2
  maxElapsedMinutes: 30
  maxEstimatedCost: null
  maxTokens: null
verification:
  gateIds:
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
    - before-acceptance
    - on-resume
  driftPolicy: block
documentationImpact:
  kind: paths
  paths:
    - scripts/hello-prosa.sh
testing:
  required: false
  gateIds: []
  rationale: Nenhum gate de teste para smoke test descartável.
execution:
  adapter: opencode
  isolation: git-worktree
  writable: true
  autoCommit: false
  allowPullRequest: false
  correctionStep: false
---
# Step 1 — Criar hello-prosa.sh

Criar scripts/hello-prosa.sh com shebang bash, ler VERSION.txt, imprimir saudação.
Tornar executável com chmod +x.
