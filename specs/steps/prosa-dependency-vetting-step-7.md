---
schemaVersion: 2.0.0
changeType: security
id: spec-prosa-dependency-vetting-step-7
sequence: 7
specId: spec-prosa-dependency-vetting
source: {path: specs/steps/prosa-dependency-vetting-step-7.md, hash: c09ada786e2f8b8926bc7d6ea578fbb0eb2f82f9120a4f0a2679167c671d061a, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
goal: Sandboxar todo gate executável em worktree com ownership antes e depois.
boundaries: {inScope: [owns=gate process sandbox e ownership, invariant=sem rede secrets ou write broker-owned, allowedDependencies=step 6], outOfScope: [doesNotOwn=catálogo de argv MCP e enablement], maxLogicalFiles: 5}
dependsOn: [spec-prosa-dependency-vetting-step-6]
predictedFiles: [scripts/workflow/lib/local-adapter.cjs, scripts/workflow/lib/sandbox.cjs, scripts/workflow/lib/process.cjs, scripts/workflow/test-sandbox.cjs, scripts/workflow/test-adapter.cjs]
allowedAreas: [scripts/workflow/lib, scripts/workflow/test-sandbox.cjs, scripts/workflow/test-adapter.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-dependency-vetting.md, stepPath: specs/steps/prosa-dependency-vetting-step-7.md, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0, implementationNoteIds: [NOTE-06, NOTE-08]}
acceptanceCriteria:
  - {id: AC-08, evidence: [{id: EVIDENCE-208, kind: automated-test, description: "Gates executáveis usam sandbox sem rede/secrets e writes mínimos.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-7/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-sandbox.cjs}]}
  - {id: AC-09, evidence: [{id: EVIDENCE-209, kind: automated-test, description: "Ownership ocorre antes e depois de cada subprocesso sem substituir deny coercitivo.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-7/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-adapter.cjs}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: Gate sandbox será documentado no Step 20.}
testing: {required: true, gateIds: [workflow-tests], rationale: Gates executam código não confiável e exigem enforcement real.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 7: Sandbox dos gates
## Goal
Aplicar sandbox deny-first e ownership checks a cada gate executável.
## Assumptions
- Drift concluído; bootstrap exato; materialização/agentes/gates produtivos continuam desabilitados.
## Risks
- Check posterior ser tratado como proteção durante execução; manter deny-write coercitivo.
## Edge cases
- Gate filho, tentativa de rede, secret env, lock rewrite e write path não catalogado.
## Acceptance Criteria
- AC-08 e AC-09 passam sem classifier inferido por comando.
## Tarefas
1. Envolver execução de gates em sandbox de processo.
2. Aplicar ownership antes/depois e interromper em divergência.
3. Cobrir rede, secrets, filhos e writes em testes.
## Paths afetados (limite absoluto)
- `scripts/workflow/lib/local-adapter.cjs`
- `scripts/workflow/lib/sandbox.cjs`
- `scripts/workflow/lib/process.cjs`
- `scripts/workflow/test-sandbox.cjs`
- `scripts/workflow/test-adapter.cjs`
## Fora de Escopo
- Policy detalhada dos gates e enablement produtivo.
## Critério de Pronto
- Gates não escapam da sandbox e ownership é invariável.
## Dependências
- Passo 6 e drift concluído.
## Checklist pré-handoff
- [ ] Cinco arquivos? [ ] Deny coercitivo testado? [ ] Gates produtivos disabled?
## Prompt de handoff
```text
Implemente APENAS o Passo 7.
Files: @scripts/workflow/lib/local-adapter.cjs @scripts/workflow/lib/sandbox.cjs @scripts/workflow/lib/process.cjs @scripts/workflow/test-sandbox.cjs @scripts/workflow/test-adapter.cjs
Out of scope: catálogo detalhado e enablement.
Done criteria: gates sandboxados com ownership pré/pós.
---
@specs/steps/prosa-dependency-vetting-step-7.md
@specs/prosa-dependency-vetting.md
```
