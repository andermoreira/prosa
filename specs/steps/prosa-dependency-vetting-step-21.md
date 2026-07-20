---
schemaVersion: 2.0.0
changeType: test
id: spec-prosa-dependency-vetting-step-21
sequence: 21
specId: spec-prosa-dependency-vetting
source: {path: specs/steps/prosa-dependency-vetting-step-21.md, hash: 97ef56f4bb7f3dcf61902d7a06db6a7fe90d385657e2221e81f6d3aafe890d4d, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
goal: Registrar evidência manual e shadow final de todos os controles antes do enablement.
boundaries: {inScope: [owns=manual evidence and final shadow verdict, invariant=qualquer falha mantém produção disabled, allowedDependencies=steps 1 a 20], outOfScope: [doesNotOwn=correção runtime e enablement], maxLogicalFiles: 5}
dependsOn: [spec-prosa-dependency-vetting-step-20]
predictedFiles: [docs/audits/prosa-dependency-vetting-manual.md]
allowedAreas: [docs/audits]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-dependency-vetting.md, stepPath: specs/steps/prosa-dependency-vetting-step-21.md, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0, implementationNoteIds: [NOTE-06, NOTE-07, NOTE-08]}
acceptanceCriteria:
  - {id: AC-38, evidence: [{id: EVIDENCE-238, kind: artifact, description: "Registro final cobre matriz automatizada e shadow sem enablement.", resultRef: docs/audits/prosa-dependency-vetting-manual.md}]}
  - {id: AC-48, evidence: [{id: EVIDENCE-248, kind: artifact, description: "E2E manual cobre baseline integrated no-exec broker reports downloads remove lifecycle e recovery.", resultRef: docs/audits/prosa-dependency-vetting-manual.md}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, specs-lint, verify-pack, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: paths, paths: [docs/audits/prosa-dependency-vetting-manual.md]}
testing: {required: true, gateIds: [workflow-tests, verify-pack], rationale: Evidência manual só é aceita após shadow e suíte integral.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 21: Evidência e shadow final
## Goal
Produzir verdict reproduzível de todos os controles com produção ainda desabilitada.
## Assumptions
- Drift e Steps 1–20 concluídos; bootstrap exato ainda ativo; enablement continua proibido.
## Risks
- Registrar sucesso sem execução real; exigir comandos, hashes, IDs e outcomes sanitizados.
## Edge cases
- Host extra, adapter disabled, crash pós-ci, stale decision e integrated completion.
## Acceptance Criteria
- AC-38 e AC-48 passam; qualquer desvio é blocker explícito do Step 22.
## Tarefas
1. Executar matriz manual/e2e e shadow final conforme spec e docs.
2. Registrar IDs, hashes, comandos, outcomes e limitações sem secrets.
3. Confirmar materialização/agentes/gates produtivos disabled em toda a evidência.
## Paths afetados (limite absoluto)
- `docs/audits/prosa-dependency-vetting-manual.md`
## Fora de Escopo
- Corrigir falhas, alterar runtime ou executar enablement.
## Critério de Pronto
- Relatório completo aprova todos os gates ou bloqueia explicitamente o Step 22.
## Dependências
- Passos 1 a 20 e drift concluído.
## Checklist pré-handoff
- [ ] Um arquivo? [ ] Evidence sanitizada? [ ] Produção comprovadamente disabled?
## Prompt de handoff
```text
Implemente APENAS o Passo 21.
Files: @docs/audits/prosa-dependency-vetting-manual.md
Out of scope: correções runtime e enablement.
Done criteria: evidência/shadow final reproduzível aprova controles com produção disabled.
---
@specs/steps/prosa-dependency-vetting-step-21.md
@specs/prosa-dependency-vetting.md
```
