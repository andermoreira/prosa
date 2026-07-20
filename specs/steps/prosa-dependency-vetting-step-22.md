---
schemaVersion: 2.0.0
changeType: irreversible
id: spec-prosa-dependency-vetting-step-22
sequence: 22
specId: spec-prosa-dependency-vetting
source: {path: specs/steps/prosa-dependency-vetting-step-22.md, hash: 3d4133aff80e8af679901008ebd8801a23117e688fe16dcf0789eeb0b455a0c0, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
goal: Habilitar transacionalmente o fluxo fail-closed e expirar a exceção bootstrap no mesmo efeito.
boundaries: {inScope: [owns=orchestrator state-machine local-adapter enablement e bootstrap expiry, invariant=ou tudo habilita validado ou tudo permanece disabled, allowedDependencies=steps 1 a 21], outOfScope: [doesNotOwn=novos contratos policy docs ou correções], maxLogicalFiles: 5}
dependsOn: [spec-prosa-dependency-vetting-step-21]
predictedFiles: [scripts/workflow/lib/orchestrator.cjs, scripts/workflow/lib/state-machine.cjs, scripts/workflow/lib/local-adapter.cjs, scripts/workflow/test-state.cjs, scripts/workflow/test-e2e.cjs]
allowedAreas: [scripts/workflow/lib, scripts/workflow/test-state.cjs, scripts/workflow/test-e2e.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-dependency-vetting.md, stepPath: specs/steps/prosa-dependency-vetting-step-22.md, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0, implementationNoteIds: [NOTE-02, NOTE-03, NOTE-07, NOTE-08]}
acceptanceCriteria:
  - {id: AC-57, evidence: [{id: EVIDENCE-257, kind: automated-test, description: "Enablement só ocorre após gates/evidência e expira bootstrap atomicamente; falha mantém tudo disabled.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-22/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-e2e.cjs}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, verify-pack, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: Documentação foi concluída e aprovada nos Steps 20 e 21 antes do enablement.}
testing: {required: true, gateIds: [workflow-tests, verify-pack], rationale: Enablement e expiry devem ser provados como uma transação fail-closed.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 22: Enablement transacional final
## Goal
Liberar plan/vet → HITL → materialization → agent/gates e remover o bootstrap sem estado intermediário.
## Assumptions
- Drift e Steps 1–21 estão aprovados; toda evidência obrigatória passa e a produção ainda está disabled.
- A exceção aceita somente esta spec hash, baseSha e IDs 1–22; nenhuma compatibilidade geral existe.
## Risks
- Expirar bootstrap antes do wiring ou habilitar antes da expiry; realizar em única transição validada.
## Edge cases
- Resume v2 após enablement, gate faltante, state v4/v5 incompatível e falha entre writes.
## Acceptance Criteria
- AC-57 passa: sucesso habilita e expira juntos; qualquer falha deixa todos os caminhos disabled.
## Tarefas
1. Exigir conclusão/evidência dos Steps 1–21 e precondições de state-machine.
2. Integrar ordem produtiva fail-closed no orchestrator e local adapter.
3. Expirar atomicamente a exceção bootstrap exata; exigir step v3/v4 e state v4/v5 para novos e resumed runs.
4. Testar rollback transacional, ausência de compatibilidade v2 geral e fluxo completo.
## Paths afetados (limite absoluto)
- `scripts/workflow/lib/orchestrator.cjs`
- `scripts/workflow/lib/state-machine.cjs`
- `scripts/workflow/lib/local-adapter.cjs`
- `scripts/workflow/test-state.cjs`
- `scripts/workflow/test-e2e.cjs`
## Fora de Escopo
- Alterar schemas/policies/docs, corrigir blocker ou ampliar compatibilidade.
## Critério de Pronto
- Enablement e expiry são atômicos; pós-transição nenhum run v2 novo ou retomado é aceito.
## Dependências
- Passos 1 a 21 e os 15 steps de drift concluídos e aprovados.
## Checklist pré-handoff
- [ ] Cinco arquivos? [ ] Gates/evidência completos? [ ] Atomicidade e rollback provados? [ ] Sem compatibilidade geral?
## Prompt de handoff
```text
Implemente APENAS o Passo 22.
Files: @scripts/workflow/lib/orchestrator.cjs @scripts/workflow/lib/state-machine.cjs @scripts/workflow/lib/local-adapter.cjs @scripts/workflow/test-state.cjs @scripts/workflow/test-e2e.cjs
Out of scope: schemas, policies, docs, correções e compatibilidade geral.
Done criteria: enablement fail-closed e expiry bootstrap ocorrem atomicamente; v2 não retoma depois.
---
@specs/steps/prosa-dependency-vetting-step-22.md
@specs/prosa-dependency-vetting.md
```
