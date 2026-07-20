---
schemaVersion: 2.0.0
changeType: security
id: spec-prosa-dependency-vetting-step-3
sequence: 3
specId: spec-prosa-dependency-vetting
source: {path: specs/steps/prosa-dependency-vetting-step-3.md, hash: f4c7a633530e495a94eaed1345ab7784ba522ff811254f5e0b84b90c7e0ed975, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
goal: Fechar o sandbox coercitivo de todo subprocesso do broker antes de sua integração.
boundaries: {inScope: [owns=broker sandbox e toolchain process boundary, invariant=deny-first sem secrets sockets ou paths extras, allowedDependencies=steps 1 e 2], outOfScope: [doesNotOwn=executor gates Git e orchestrator], maxLogicalFiles: 5}
dependsOn: [spec-prosa-dependency-vetting-step-2]
predictedFiles: [scripts/workflow/lib/dependency-broker.cjs, scripts/workflow/lib/sandbox.cjs, scripts/workflow/lib/process.cjs, scripts/workflow/test-dependency-broker.cjs, scripts/workflow/test-sandbox.cjs]
allowedAreas: [scripts/workflow/lib, scripts/workflow/test-dependency-broker.cjs, scripts/workflow/test-sandbox.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-dependency-vetting.md, stepPath: specs/steps/prosa-dependency-vetting-step-3.md, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0, implementationNoteIds: [NOTE-01, NOTE-06, NOTE-08]}
acceptanceCriteria:
  - {id: AC-44, evidence: [{id: EVIDENCE-244, kind: automated-test, description: "Broker subprocess usa sandbox com hosts e filesystem mínimos.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-3/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-dependency-broker.cjs}]}
  - {id: AC-45, evidence: [{id: EVIDENCE-245, kind: automated-test, description: "Canários negam secrets, sockets, traversal, symlink e write outside.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-3/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-sandbox.cjs}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: Controles serão documentados no Step 20.}
testing: {required: true, gateIds: [workflow-tests], rationale: A fronteira privilegiada requer testes adversariais coercitivos.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 3: Sandbox do broker

## Goal
Provar a fronteira deny-first do broker sem conectá-la ao orchestrator.

## Assumptions
- Drift está concluído e o bootstrap v2 continua limitado à spec/hash/baseSha/IDs aprovados.
- Broker e materialização produtivos permanecem desabilitados.

## Risks
- Processo helper herdar HOME, env, socket ou rede; usar policy única para toda a árvore.

## Edge cases
- Symlink swap, traversal, socket Unix, `.env`, SSH/cloud credentials e terceiro host.

## Acceptance Criteria
- AC-44 e AC-45 passam em backend real quando disponível e sem fallback permissivo.

## Tarefas
1. Delimitar subprocessos do broker em `dependency-broker.cjs`, `sandbox.cjs` e `process.cjs`.
2. Permitir apenas toolchain/stores read-only, scratch/cache/paths exatos writable e dois hosts.
3. Adicionar canários adversariais sem integrar o broker a runs reais.

## Paths afetados (limite absoluto)
- `scripts/workflow/lib/dependency-broker.cjs`
- `scripts/workflow/lib/sandbox.cjs`
- `scripts/workflow/lib/process.cjs`
- `scripts/workflow/test-dependency-broker.cjs`
- `scripts/workflow/test-sandbox.cjs`

## Fora de Escopo
- Executor, gates, Git, state e enablement.

## Critério de Pronto
- Todo subprocesso broker prova isolamento coercitivo e falha fechado.

## Dependências
- Passo 2; precondição externa de drift concluída.

## Checklist pré-handoff
- [ ] Cinco arquivos totais?
- [ ] Nenhum wiring produtivo?
- [ ] Canários cobrem a árvore de processos?

## Prompt de handoff
```text
Implemente APENAS o Passo 3.
Files: @scripts/workflow/lib/dependency-broker.cjs @scripts/workflow/lib/sandbox.cjs @scripts/workflow/lib/process.cjs @scripts/workflow/test-dependency-broker.cjs @scripts/workflow/test-sandbox.cjs
Out of scope: executor, gates, Git, state e enablement.
Done criteria: sandbox broker deny-first passa canários sem integração produtiva.
---
@specs/steps/prosa-dependency-vetting-step-3.md
@specs/prosa-dependency-vetting.md
```
