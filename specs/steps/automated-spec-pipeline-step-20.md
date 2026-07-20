---
schemaVersion: 1.0.0
id: spec-automated-pipeline-step-20
sequence: 20
specId: spec-automated-pipeline
source:
  path: specs/steps/automated-spec-pipeline-step-20.md
  hash: c9d2f8df7fa72df1a11cf4eef079d1936b59a9ed44c5f3b8f35620dbaad088d5
  baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4
goal: Tornar dependências e testes workflow gates explícitos e reproduzíveis localmente e na CI.
boundaries:
  inScope:
    - behaviorType=vertical
    - owns=CI lint, verify local, E2E, documentação operacional e scripts npm
    - invariant=CI instala sem lifecycle scripts, bloqueia audit high e executa workflow tests
    - allowedDependencies=spec-automated-pipeline-step-19
  outOfScope:
    - doesNotOwn=deploy, release, auto-fix de vulnerabilidade e chamadas reais de agentes no CI
  maxLogicalFiles: 5
dependsOn: [spec-automated-pipeline-step-19]
predictedFiles:
  - .github/workflows/lint.yml
  - scripts/verify.sh
  - scripts/workflow/test-e2e.cjs
  - docs/workflows/automated-spec-pipeline.md
  - package.json
allowedAreas: [.github/workflows, scripts, docs/workflows, package.json]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/automated-spec-pipeline.md, stepPath: specs/steps/automated-spec-pipeline-step-20.md, baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4, implementationNoteIds: [NOTE-01, NOTE-02, NOTE-03]}
acceptanceCriteria:
  - id: AC-23
    evidence:
      - {id: EVIDENCE-29, kind: static-check, description: "Gate verify-pack valida dependências locais, workflow tests e o E2E.", gateId: verify-pack, resultRef: spec-automated-pipeline-step-20/attempt-1/gate-verify-pack, testSelector: dependency-gate}
  - id: AC-20
    evidence:
      - {id: EVIDENCE-30, kind: automated-test, description: "Gate verify-pack executa a cobertura fase 1 sem serviços externos.", gateId: verify-pack, resultRef: spec-automated-pipeline-step-20/attempt-1/gate-verify-pack, testSelector: scripts/workflow/test-e2e.cjs}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [verify-pack, revalidation]}
revalidation:
  triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, on-resume, before-final-review, before-global-acceptance]
  driftPolicy: block
documentationImpact:
  kind: paths
  paths: [docs/workflows/automated-spec-pipeline.md]
testing: {required: true, gateIds: [verify-pack], rationale: "CI e gate local precisam provar instalação, audit, dependências e suíte workflow sem agentes reais."}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 20: CI e gate de dependências

## Goal

Tornar instalação, audit de dependências e testes workflow gates claros e reproduzíveis localmente e na CI.

## Assumptions

- `package-lock.json` é a resolução canônica e o E2E pode usar somente fakes e repositórios temporários.

## Risks

- Audit remoto introduzir indisponibilidade; mitigar mantendo diagnóstico distinto sem enfraquecer o bloqueio high na CI.

## Edge cases

- `node_modules` ausente, lockfile divergente, audit indisponível, vulnerabilidade high e E2E opcionalmente já suficiente sem mudança.

## Acceptance Criteria

- CI instala com `npm ci --ignore-scripts`, bloqueia `npm audit` em severidade high e executa workflow tests; verify local identifica claramente dependência ausente ou divergente.

## Tarefas

1. Atualizar `.github/workflows/lint.yml` para instalar dependências com `npm ci --ignore-scripts`, executar audit bloqueante em high e rodar a suíte workflow.
2. Atualizar `scripts/verify.sh` com gate explícito de dependências/lockfile e diagnóstico acionável antes dos testes workflow.
3. Atualizar `scripts/workflow/test-e2e.cjs` somente se necessário para cobrir o adapter local/validate e manter E2E sem serviços externos.
4. Atualizar `docs/workflows/automated-spec-pipeline.md` com pré-requisitos, instalação, audit e equivalência local↔CI.
5. Atualizar `package.json` com scripts nomeados para verify workflow e audit usados pela CI, sem lifecycle scripts.

## Paths afetados (limite absoluto)

- `.github/workflows/lint.yml`
- `scripts/verify.sh`
- `scripts/workflow/test-e2e.cjs`
- `docs/workflows/automated-spec-pipeline.md`
- `package.json`

## Fora de Escopo

- Deploy, release, auto-fix de vulnerabilidades, alteração do lockfile ou chamadas reais de OpenCode/GitHub no CI.

## Critério de Pronto

- CI e verify local falham de forma clara para dependência/lock/audit inválidos e executam a mesma suíte workflow relevante.

## Dependências

- Passo 19.

## Checklist pré-handoff

- [ ] ≤ 5 arquivos afetados?
- [ ] Instalação sem lifecycle scripts e audit high são bloqueantes?
- [ ] Gate local explica dependências antes da suíte?

---

## Prompt de handoff

```text
Implemente APENAS o Passo 20.
Files: @.github/workflows/lint.yml @scripts/verify.sh @scripts/workflow/test-e2e.cjs @docs/workflows/automated-spec-pipeline.md @package.json
Out of scope: deploy, release, auto-fix, lockfile e serviços externos reais.
Done criteria: CI usa instalação reproduzível, audit high e workflow tests; verify local detecta dependências claramente.
---
@specs/steps/automated-spec-pipeline-step-20.md
@specs/automated-spec-pipeline.md
```
