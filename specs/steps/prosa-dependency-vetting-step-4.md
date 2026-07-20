---
schemaVersion: 2.0.0
changeType: security
id: spec-prosa-dependency-vetting-step-4
sequence: 4
specId: spec-prosa-dependency-vetting
source: {path: specs/steps/prosa-dependency-vetting-step-4.md, hash: f4ed1f87f11d3c696dc75c3e634e2530e37f47db44a3f627e5b5ee54a8c817a0, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
goal: Impedir genericamente project execution pelo executor e isolar credenciais no provider transport.
boundaries: {inScope: [owns=process deny de OpenCode Cursor e adapter, invariant=adapter incapaz fica disabled, allowedDependencies=step 3], outOfScope: [doesNotOwn=registry resources gates Git e broker vetting], maxLogicalFiles: 5}
dependsOn: [spec-prosa-dependency-vetting-step-3]
predictedFiles: [scripts/workflow/lib/opencode.cjs, scripts/workflow/lib/cursor.cjs, scripts/workflow/lib/local-adapter.cjs, scripts/workflow/test-opencode.cjs, scripts/workflow/test-cursor.cjs]
allowedAreas: [scripts/workflow/lib, scripts/workflow/test-opencode.cjs, scripts/workflow/test-cursor.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-dependency-vetting.md, stepPath: specs/steps/prosa-dependency-vetting-step-4.md, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0, implementationNoteIds: [NOTE-06, NOTE-08]}
acceptanceCriteria:
  - {id: AC-07, evidence: [{id: EVIDENCE-207, kind: automated-test, description: "Executores negam processos, interpreters, inspection e egress.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-4/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-opencode.cjs}]}
  - {id: AC-43, evidence: [{id: EVIDENCE-243, kind: automated-test, description: "Provider transport não vaza credenciais e adapter incapaz fica disabled.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-4/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-cursor.cjs}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: Operação segura será documentada no Step 20.}
testing: {required: true, gateIds: [workflow-tests], rationale: No-exec e isolamento de credenciais são controles coercitivos.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 4: Executor sem project execution

## Goal
Separar `agent:invoke` de qualquer capacidade genérica de processo e de credenciais do provider.

## Assumptions
- Drift concluído; exceção v2 exata e temporária permanece ativa somente para IDs desta spec.
- Agentes e gates produtivos desta feature continuam desabilitados.

## Risks
- Adapter interno reintroduzir filho com provider env; exigir allowlist absoluta e env limpo.

## Edge cases
- Loader, shebang, `.bin`, shell, Python/Ruby, plugin, env/proc inspection e executable absoluto.

## Acceptance Criteria
- AC-07 e AC-43 falham fechado em OpenCode e Cursor.

## Tarefas
1. Restringir os adapters a `agent:invoke` sem execução de projeto.
2. Manter credentials/config apenas no transport e limpar filhos inevitáveis.
3. Desabilitar adapter que não prove enforcement e cobrir a matriz adversarial.

## Paths afetados (limite absoluto)
- `scripts/workflow/lib/opencode.cjs`
- `scripts/workflow/lib/cursor.cjs`
- `scripts/workflow/lib/local-adapter.cjs`
- `scripts/workflow/test-opencode.cjs`
- `scripts/workflow/test-cursor.cjs`

## Fora de Escopo
- Policy de registry, gate sandbox, Git e enablement.

## Critério de Pronto
- Ambos os adapters negam project exec e não expõem provider secrets.

## Dependências
- Passo 3 e drift concluído.

## Checklist pré-handoff
- [ ] Cinco arquivos totais?
- [ ] Provider env ausente de filhos e logs?
- [ ] Adapter incapaz desabilita fail-closed?

## Prompt de handoff
```text
Implemente APENAS o Passo 4.
Files: @scripts/workflow/lib/opencode.cjs @scripts/workflow/lib/cursor.cjs @scripts/workflow/lib/local-adapter.cjs @scripts/workflow/test-opencode.cjs @scripts/workflow/test-cursor.cjs
Out of scope: registry, gates, Git e enablement.
Done criteria: executor sem generic process e provider transport isolado.
---
@specs/steps/prosa-dependency-vetting-step-4.md
@specs/prosa-dependency-vetting.md
```
