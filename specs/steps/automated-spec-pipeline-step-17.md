---
schemaVersion: 1.0.0
id: spec-automated-pipeline-step-17
sequence: 17
specId: spec-automated-pipeline
source: {path: specs/steps/automated-spec-pipeline-step-17.md, hash: b89857c6d696e1b985af3cae4130ed3ee018171dd438a48b707550c57d4958f4, baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4}
goal: Documentar, conectar CLI e orchestrator e verificar ponta a ponta todo o pipeline fase 1 sem serviços externos reais.
boundaries:
  inScope:
    - behaviorType=vertical
    - owns=documentação, E2E, verify e wiring real entre CLI e orchestrator
    - invariant=run, resume e review deixam de ser placeholders e o E2E não usa serviços reais
    - allowedDependencies=spec-automated-pipeline-step-16
  outOfScope:
    - doesNotOwn=archive, adapters extras, paralelismo, sandbox, CI e serviços reais
  maxLogicalFiles: 5
dependsOn: [spec-automated-pipeline-step-16]
predictedFiles:
  - docs/workflows/automated-spec-pipeline.md
  - scripts/workflow/test-e2e.cjs
  - scripts/verify.sh
  - scripts/workflow/lib/cli.cjs
  - scripts/workflow/lib/orchestrator.cjs
allowedAreas:
  - docs/workflows
  - scripts/workflow
  - scripts/verify.sh
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/automated-spec-pipeline.md, stepPath: specs/steps/automated-spec-pipeline-step-17.md, baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4, implementationNoteIds: [NOTE-01, NOTE-02, NOTE-03]}
acceptanceCriteria:
  - id: AC-09
    evidence:
      - {id: EVIDENCE-25, kind: static-check, description: "Gate verify-pack valida wiring real de run, resume e review entre cli.cjs e orchestrator.cjs.", gateId: verify-pack, resultRef: spec-automated-pipeline-step-17/attempt-1/gate-verify-pack, testSelector: scripts/workflow/test-cli.cjs}
  - id: AC-20
    evidence:
      - {id: EVIDENCE-26, kind: automated-test, description: "Gate verify-pack executa suíte e E2E completos sem serviços externos.", gateId: verify-pack, resultRef: spec-automated-pipeline-step-17/attempt-1/gate-verify-pack, testSelector: scripts/workflow/test-e2e.cjs}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [specs-lint, workflow-tests, verify-pack, commands-opencode-check, commands-claude-check, revalidation]}
revalidation:
  triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, before-final-review, before-global-acceptance, before-pull-request]
  driftPolicy: block
documentationImpact:
  kind: paths
  paths: [docs/workflows/automated-spec-pipeline.md]
testing: {required: true, gateIds: [specs-lint, workflow-tests, verify-pack, commands-opencode-check, commands-claude-check], rationale: Wiring e fluxo fase 1 exigem suíte completa e E2E com fakes.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 17: Documentação operacional e E2E

## Goal

Documentar e verificar ponta a ponta todo o pipeline fase 1 sem serviços externos reais.

## Assumptions

- Passos 1–16 oferecem seams para repos, agentes, notifiers e GitHub fake.

## Risks

- E2E depender do ambiente; mitigar com repo temporário, clocks/adapters fake e cleanup controlado.

## Edge cases

- Sem OpenCode/`gh`/rede, lock concorrente, crash/resume, budget esgotado, final review falho e cleanup parcial.

## Acceptance Criteria

- Verify cobre schemas, catálogos, commands, state/lock, budgets, execução, review local/global, reports e PR sem chamadas externas.

## Tarefas

1. Criar `docs/workflows/automated-spec-pipeline.md` com operação, state machine, budgets, artifacts, notes, evidence, docs impact, commands, segurança, resume e troubleshooting.
2. Criar `scripts/workflow/test-e2e.cjs` com caminho completo e cenários fail-closed, incluindo correction step ausente.
3. Atualizar `scripts/verify.sh` para executar toda a suíte `scripts/workflow/test-*.cjs` e checks de schema/catálogo/commands.
4. Atualizar `scripts/workflow/lib/cli.cjs` para fazer o wiring real dos modos `run`, `resume` e `review` ao orchestrator, preservando parsing fechado e defaults seguros.
5. Atualizar `scripts/workflow/lib/orchestrator.cjs` para expor os entrypoints consumidos pelo CLI e percorrer o fluxo E2E da fase 1 sem capability placeholder.

## Paths afetados (limite absoluto)

- `docs/workflows/automated-spec-pipeline.md`
- `scripts/workflow/test-e2e.cjs`
- `scripts/verify.sh`
- `scripts/workflow/lib/cli.cjs`
- `scripts/workflow/lib/orchestrator.cjs`

## Fora de Escopo

- Archive antecipado, adapter adicional, paralelismo, sandbox, CI ou chamadas reais de rede/agente.

## Critério de Pronto

- Verify passa deterministicamente e documentação permite run/resume/review sem contexto oral nem promessas futuras incorretas.

## Dependências

- Passos 1 a 16.

## Checklist pré-handoff

- [ ] ≤ 5 arquivos afetados?
- [ ] E2E usa apenas fakes/temporários?
- [ ] Todos os ACs têm evidence de teste ou documentação?

---

## Prompt de handoff

```text
Implemente APENAS o Passo 17.
Files: @docs/workflows/automated-spec-pipeline.md @scripts/workflow/test-e2e.cjs @scripts/verify.sh @scripts/workflow/lib/cli.cjs @scripts/workflow/lib/orchestrator.cjs
Out of scope: archive, adapters extras, paralelismo, sandbox, CI e serviços reais.
Done criteria: CLI e orchestrator têm wiring real, verify cobre a fase 1 completa e docs operacionais são autônomas.
---
@specs/steps/automated-spec-pipeline-step-17.md
@specs/automated-spec-pipeline.md
```
