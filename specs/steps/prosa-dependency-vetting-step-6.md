---
schemaVersion: 2.0.0
changeType: security
id: spec-prosa-dependency-vetting-step-6
sequence: 6
specId: spec-prosa-dependency-vetting
source: {path: specs/steps/prosa-dependency-vetting-step-6.md, hash: 1f8ab8409f26be16707e539a5301b3755425ac7c6abc2718d07c484394cfd6a3, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
goal: Centralizar Git em wrapper sandboxada com preflight seguro de config e attributes.
boundaries: {inScope: [owns=safe Git e instrução operacional, invariant=Git sem rede secrets child exec ou config executável, allowedDependencies=step 5], outOfScope: [doesNotOwn=gate sandbox vetting e enablement], maxLogicalFiles: 5}
dependsOn: [spec-prosa-dependency-vetting-step-5]
predictedFiles: [scripts/workflow/lib/git.cjs, scripts/workflow/lib/sandbox.cjs, scripts/workflow/test-git.cjs, scripts/workflow/test-sandbox-runtime-macos.cjs, docs/workflows/automated-spec-pipeline-runbook.md]
allowedAreas: [scripts/workflow/lib, scripts/workflow/test-git.cjs, scripts/workflow/test-sandbox-runtime-macos.cjs, docs/workflows]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-dependency-vetting.md, stepPath: specs/steps/prosa-dependency-vetting-step-6.md, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0, implementationNoteIds: [NOTE-06, NOTE-08]}
acceptanceCriteria:
  - {id: AC-55, evidence: [{id: EVIDENCE-255, kind: automated-test, description: "Wrapper e preflight neutralizam config e attributes executáveis com proteção TOCTOU.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-6/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-git.cjs}]}
  - {id: AC-56, evidence: [{id: EVIDENCE-256, kind: documentation, description: "Runbook usa apenas safe wrapper e preserva ownership.", resultRef: docs/workflows/automated-spec-pipeline-runbook.md}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, specs-lint, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: paths, paths: [docs/workflows/automated-spec-pipeline-runbook.md]}
testing: {required: true, gateIds: [workflow-tests], rationale: Git é parte do TCB e requer canários reais.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 6: Safe Git
## Goal
Fazer toda operação Git relevante passar por wrapper sandboxada e preflight fail-closed.
## Assumptions
- Drift concluído; bootstrap v2 exato por spec hash/baseSha/IDs; nenhum enablement produtivo até o Step 22.
## Risks
- Caminho direto residual para Git; buscar e testar todas as operações do pipeline.
## Edge cases
- Hook, filter, fsmonitor, signing, helper, include, symlink e inode swap.
## Acceptance Criteria
- AC-55 e AC-56 passam antes de qualquer worktree materializado produtivo.
## Tarefas
1. Implementar `git.cjs` com config/env fechados e sandbox sem rede/child exec.
2. Fazer preflight estável de repo config e `.gitattributes`; cobrir ataques no macOS.
3. Remover instruções de Git/IDE direto do runbook.
## Paths afetados (limite absoluto)
- `scripts/workflow/lib/git.cjs`
- `scripts/workflow/lib/sandbox.cjs`
- `scripts/workflow/test-git.cjs`
- `scripts/workflow/test-sandbox-runtime-macos.cjs`
- `docs/workflows/automated-spec-pipeline-runbook.md`
## Fora de Escopo
- Gates, broker vetting, state e enablement.
## Critério de Pronto
- Git não executa código nem usa configuração não allowlisted.
## Dependências
- Passo 5 e drift concluído.
## Checklist pré-handoff
- [ ] Cinco arquivos? [ ] Sem Git direto residual? [ ] Sem enablement?
## Prompt de handoff
```text
Implemente APENAS o Passo 6.
Files: @scripts/workflow/lib/git.cjs @scripts/workflow/lib/sandbox.cjs @scripts/workflow/test-git.cjs @scripts/workflow/test-sandbox-runtime-macos.cjs @docs/workflows/automated-spec-pipeline-runbook.md
Out of scope: gates, vetting, state e enablement.
Done criteria: safe Git e preflight adversarial comprovados.
---
@specs/steps/prosa-dependency-vetting-step-6.md
@specs/prosa-dependency-vetting.md
```
