---
schemaVersion: 2.0.0
changeType: permissions
id: spec-prosa-dependency-vetting-step-8
sequence: 8
specId: spec-prosa-dependency-vetting
source: {path: specs/steps/prosa-dependency-vetting-step-8.md, hash: 1a375c7bbce5c01d7166e1691c4459e5908c5803d79616d568c8b04f9c051c71, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
goal: Fechar policies de gates locais e globais preservando o contrato MCP externo.
boundaries: {inScope: [owns=gate catalog policies, invariant=worktree gate é sandboxado e MCP externo conserva contrato, allowedDependencies=step 7], outOfScope: [doesNotOwn=broker reports e enablement], maxLogicalFiles: 5}
dependsOn: [spec-prosa-dependency-vetting-step-7]
predictedFiles: [workflow/gates.yaml, scripts/workflow/lib/catalogs.cjs, scripts/workflow/test-catalogs.cjs, scripts/workflow/test-e2e.cjs]
allowedAreas: [workflow, scripts/workflow/lib, scripts/workflow/test-catalogs.cjs, scripts/workflow/test-e2e.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-dependency-vetting.md, stepPath: specs/steps/prosa-dependency-vetting-step-8.md, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0, implementationNoteIds: [NOTE-06, NOTE-08]}
acceptanceCriteria:
  - {id: AC-42, evidence: [{id: EVIDENCE-242, kind: automated-test, description: "Gate global requer integrated completion próprio e nunca reutiliza completion local.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-8/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-e2e.cjs}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: Contrato será documentado no Step 20.}
testing: {required: true, gateIds: [workflow-tests], rationale: Policies locais/globais e MCP precisam de regressão integrada.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 8: Policies de gates
## Goal
Fechar argv, writes e escopos de gates sem alterar MCP read-only externo.
## Assumptions
- Drift concluído; bootstrap exato; gates produtivos permanecem desabilitados.
## Risks
- Aplicar policy de worktree a MCP externo ou permitir gate sem catálogo.
## Edge cases
- Gate global integrado, gate MCP sem worktree e completion local apresentada ao global.
## Acceptance Criteria
- AC-42 possui regressão de completion independente e catálogo fechado.
## Tarefas
1. Fechar policies em `workflow/gates.yaml` e normalização em `catalogs.cjs`.
2. Preservar explicitamente MCP/read-only externo.
3. Testar gates local/global e rejeição de completion reutilizado.
## Paths afetados (limite absoluto)
- `workflow/gates.yaml`
- `scripts/workflow/lib/catalogs.cjs`
- `scripts/workflow/test-catalogs.cjs`
- `scripts/workflow/test-e2e.cjs`
## Fora de Escopo
- Materializar worktree real e habilitar gates.
## Critério de Pronto
- Policies são fechadas e distinguish local/global/MCP.
## Dependências
- Passo 7 e drift concluído.
## Checklist pré-handoff
- [ ] Quatro arquivos? [ ] MCP preservado? [ ] Gates disabled?
## Prompt de handoff
```text
Implemente APENAS o Passo 8.
Files: @workflow/gates.yaml @scripts/workflow/lib/catalogs.cjs @scripts/workflow/test-catalogs.cjs @scripts/workflow/test-e2e.cjs
Out of scope: materialização e enablement.
Done criteria: policies fechadas preservam MCP e exigem completion global próprio.
---
@specs/steps/prosa-dependency-vetting-step-8.md
@specs/prosa-dependency-vetting.md
```
