---
schemaVersion: 1.0.0
id: spec-automated-pipeline-step-18
sequence: 18
specId: spec-automated-pipeline
source:
  path: specs/steps/automated-spec-pipeline-step-18.md
  hash: 180871e8b5ddaeadb332d997dc49761b3108397847e5ced692ca65fb23139400
  baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4
goal: Montar o adapter local de produção e o wrapper de validação para run, resume, review e validate reais, preservando dependency injection para testes.
boundaries:
  inScope:
    - behaviorType=vertical
    - owns=adapter local, wiring default do orchestrator, validate wrapper e testes do CLI/adapter
    - invariant=o caminho default monta OpenCode, lock/state, worktrees, gates, review, acceptance, report e PR sem placeholders
    - allowedDependencies=spec-automated-pipeline-step-17
  outOfScope:
    - doesNotOwn=novo executor, nova state machine, alteração de schemas ou chamadas externas reais nos testes
  maxLogicalFiles: 5
dependsOn: [spec-automated-pipeline-step-17]
predictedFiles:
  - scripts/workflow/lib/local-adapter.cjs
  - scripts/workflow/lib/orchestrator.cjs
  - scripts/workflow/test-adapter.cjs
  - scripts/workflow/validate-spec.sh
  - scripts/workflow/test-cli.cjs
allowedAreas: [scripts/workflow]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/automated-spec-pipeline.md, stepPath: specs/steps/automated-spec-pipeline-step-18.md, baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4, implementationNoteIds: [NOTE-01, NOTE-02, NOTE-03]}
acceptanceCriteria:
  - id: AC-21
    evidence:
      - {id: EVIDENCE-27, kind: automated-test, description: "Gate verify-pack valida wiring default completo, validate wrapper e dependency injection de testes.", gateId: verify-pack, resultRef: spec-automated-pipeline-step-18/attempt-1/gate-verify-pack, testSelector: scripts/workflow/test-adapter.cjs}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [verify-pack, revalidation]}
revalidation:
  triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, on-resume, before-final-review, before-global-acceptance, before-pull-request]
  driftPolicy: block
documentationImpact: {kind: none, justification: Wiring e validate wrapper serão descritos na documentação durável atualizada no Step 20.}
testing: {required: true, gateIds: [verify-pack], rationale: "Adapter local e CLI exigem fakes injetados para validar todos os módulos sem serviços reais."}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 18: Adapter local de produção e validate wrapper

## Goal

Montar por default o runtime local completo para `validate`, `run`, `resume` e `review`, mantendo dependency injection explícita para testes.

## Assumptions

- Os módulos implementados nos Passos 1–17 expõem contratos concretos e seams de teste.

## Risks

- Wiring parcial manter caminhos que lançam capability placeholder; mitigar com teste do adapter default para cada modo.

## Edge cases

- Override parcial, módulo ausente, validate sem base explícita, erro de construção antes do lock e fake vazando para produção.

## Acceptance Criteria

- O adapter default monta OpenCode, lock/state, worktrees, gates, review/diagnosis, acceptance, report/notifications e PR para os quatro modos; testes ainda podem injetar dependências.

## Tarefas

1. Criar `scripts/workflow/lib/local-adapter.cjs` como composition root de produção para todos os módulos existentes, sem fallback para placeholder.
2. Atualizar `scripts/workflow/lib/orchestrator.cjs` para consumir o adapter default em `validate`, `run`, `resume` e `review`, aceitando overrides somente por dependency injection explícita.
3. Criar `scripts/workflow/test-adapter.cjs` cobrindo composição completa, ausência de módulo, overrides e isolamento de fakes.
4. Criar `scripts/workflow/validate-spec.sh` como wrapper fino do modo validate, sem duplicar validação.
5. Atualizar `scripts/workflow/test-cli.cjs` para provar wiring real dos quatro modos e defaults seguros.

## Paths afetados (limite absoluto)

- `scripts/workflow/lib/local-adapter.cjs`
- `scripts/workflow/lib/orchestrator.cjs`
- `scripts/workflow/test-adapter.cjs`
- `scripts/workflow/validate-spec.sh`
- `scripts/workflow/test-cli.cjs`

## Fora de Escopo

- Novo adapter de agente, alteração de schema ou chamadas reais de OpenCode/GitHub/rede nos testes.

## Critério de Pronto

- Os quatro modos usam wiring real por default, nenhum capability placeholder permanece no caminho de produção e dependency injection continua testável.

## Dependências

- Passo 17.

## Checklist pré-handoff

- [ ] ≤ 5 arquivos afetados?
- [ ] Composition root inclui todos os módulos fase 1?
- [ ] Defaults reais e overrides de teste estão cobertos?

---

## Prompt de handoff

```text
Implemente APENAS o Passo 18.
Files: @scripts/workflow/lib/local-adapter.cjs @scripts/workflow/lib/orchestrator.cjs @scripts/workflow/test-adapter.cjs @scripts/workflow/validate-spec.sh @scripts/workflow/test-cli.cjs
Out of scope: novos adapters/schemas e serviços externos reais nos testes.
Done criteria: validate/run/resume/review montam o runtime completo por default e preservam dependency injection.
---
@specs/steps/automated-spec-pipeline-step-18.md
@specs/automated-spec-pipeline.md
```
