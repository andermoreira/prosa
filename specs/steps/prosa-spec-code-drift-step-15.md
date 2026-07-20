---
schemaVersion: 2.0.0
changeType: architecture
id: spec-prosa-spec-code-drift-step-15
sequence: 15
specId: spec-prosa-spec-code-drift
source: {path: specs/steps/prosa-spec-code-drift-step-15.md, hash: a2df62e21f0bdee1c850710930fac5a35ce654cf0c933f671ddc559c5119188f, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
goal: Registrar evidência manual e habilitar transacionalmente fail-closed para runs futuros, encerrando a exceção bootstrap.
boundaries: {inScope: [owns=evidência final switch e encerramento atômico, invariant=exceção e enforcement mudam juntos somente após validar 15 handoffs, allowedDependencies=step 14], outOfScope: [doesNotOwn=waiver compatibilidade geral correção archive e release], maxLogicalFiles: 5}
dependsOn: [spec-prosa-spec-code-drift-step-14]
predictedFiles: [scripts/workflow/lib/orchestrator.cjs, scripts/workflow/lib/local-adapter.cjs, scripts/workflow/test-e2e.cjs, docs/audits/prosa-spec-code-drift-manual.md]
allowedAreas: [scripts/workflow/lib, scripts/workflow/test-e2e.cjs, docs/audits]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-spec-code-drift.md, stepPath: specs/steps/prosa-spec-code-drift-step-15.md, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0, implementationNoteIds: [NOTE-03, NOTE-04, NOTE-05, NOTE-06]}
acceptanceCriteria:
  - {id: AC-21, evidence: [{id: EVIDENCE-21, kind: artifact, description: "Registro manual prova rename confirmed artifact review rejeição de approved e rejeição acionável.", resultRef: docs/audits/prosa-spec-code-drift-manual.md}]}
  - {id: AC-23, evidence: [{id: EVIDENCE-23, kind: static-check, description: "Workflow tests specs lint e verify pack passam no enablement final.", gateId: verify-pack, resultRef: spec-prosa-spec-code-drift-step-15/attempt-1/gate-verify-pack, testSelector: scripts/verify.sh}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 180, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, specs-lint, verify-pack, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: paths, paths: [docs/audits/prosa-spec-code-drift-manual.md]}
testing: {required: true, gateIds: [workflow-tests, specs-lint, verify-pack], rationale: Enablement só é aceito após evidência manual e gates globais completos.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 15: Evidência e enablement transacional

## Goal

Registrar evidência manual e habilitar transacionalmente fail-closed para runs futuros, encerrando a exceção bootstrap.

## Assumptions

- Os 15 handoffs v2 foram aprovados em 2026-07-19 e seus IDs, hashes, spec hash e `baseSha` coincidem exatamente com o conjunto autorizado.
- O run bootstrap atual conclui sob v2; o novo enforcement alcança somente novos runs e resumes iniciados depois deste step aceito.

## Risks

- Ativação parcial deixar exceção aberta ou bloquear o próprio run; mitigar com uma única decisão transacional pós-validação e efeito futuro.

## Edge cases

- Um hash/ID divergente, falha de gate, rename inconclusive, approved inválido, resume futuro v2 e crash no marco de enablement.

## Acceptance Criteria

- Evidência manual é reproduzível e o switch só ativa após gates; exceção termina no mesmo marco e não alcança outro step v2.

## Tarefas

1. Validar antes do switch os 15 documentos schema v2, IDs exatos, hashes, spec hash aprovado e `baseSha`; qualquer divergência mantém tudo dormente e falha fechado.
2. Executar rename proposital em harness isolado, registrar state/artifact/review, provar rejeição de `approved` e concluir com `retry`, `replan` ou `abort` em `docs/audits/prosa-spec-code-drift-manual.md`.
3. Em `orchestrator.cjs` e `local-adapter.cjs`, tornar o enablement e o encerramento da exceção uma única condição transacional aplicável somente a novos runs/resumes futuros.
4. Cobrir em `test-e2e.cjs` sucesso atômico, falha sem ativação, inexistência de compatibilidade geral e impossibilidade de estado intermediário.
5. Executar `workflow-tests`, `specs-lint` e `verify-pack`; checks de commands só se tornam obrigatórios se o escopo aprovado for alterado para tocar commands, o que exige replan.

## Paths afetados (limite absoluto)

- `scripts/workflow/lib/orchestrator.cjs`
- `scripts/workflow/lib/local-adapter.cjs`
- `scripts/workflow/test-e2e.cjs`
- `docs/audits/prosa-spec-code-drift-manual.md`

## Fora de Escopo

- Waiver, compatibilidade geral v1/v2, correções descobertas durante evidência, archive, release ou mudança em commands.

## Critério de Pronto

- Relatório manual e gates passam; novos runs/resumes exigem v3 e drift aligned; exceção bootstrap está encerrada sem estado intermediário.

## Dependências

- Passo 14.

## Checklist pré-handoff

- [ ] Quatro paths previstos, sem arquivo adicional.
- [ ] Todos os 15 handoffs e provenance foram validados antes do switch.
- [ ] O próprio run v2 não é bloqueado e nenhum run futuro recebe a exceção.
- [ ] EVIDENCE-21 e EVIDENCE-23 são reproduzíveis e gates globais passam.

## Prompt de handoff

```text
Implemente APENAS o Passo 15.
Files: @scripts/workflow/lib/orchestrator.cjs @scripts/workflow/lib/local-adapter.cjs @scripts/workflow/test-e2e.cjs @docs/audits/prosa-spec-code-drift-manual.md
Out of scope: waiver, compatibilidade geral, correções fora do step, archive, release e commands.
Done criteria: evidência manual e gates passam; enablement e fim da exceção ocorrem atomicamente só para novos runs/resumes futuros.
---
@specs/steps/prosa-spec-code-drift-step-15.md
@specs/prosa-spec-code-drift.md
```
