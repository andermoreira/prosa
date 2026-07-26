---
schemaVersion: 2.0.0
changeType: test
id: spec-public-release-readiness-step-1
sequence: 1
specId: spec-public-release-readiness
source: {path: specs/steps/public-release-readiness-step-1.md, hash: 7c1e21b129a148ffad175a119f61ff311b4b9d73e81afc2332746033705b650b, baseSha: efe8dabe50acf4250e82adbb726f199648a53d60}
goal: Restaurar a suíte padrão hermética sem enfraquecer o fail-closed para executáveis de agente ausentes.
boundaries: {inScope: [owns=fixtures de adapter, scripts de teste, job padrão e gates locais ausentes, invariant=suíte padrão não exige agente real, allowedDependencies=contrato AC-20 e AC-23 aprovado], outOfScope: [doesNotOwn=demo pública, publicação, runtime de produção e instalação de agentes no CI], maxLogicalFiles: 5}
dependsOn: []
predictedFiles: [scripts/workflow/test-adapter.cjs, package.json, .github/workflows/lint.yml, scripts/lint-specs.cjs, scripts/verify.sh]
allowedAreas: [scripts/workflow/test-adapter.cjs, package.json, .github/workflows/lint.yml, scripts/lint-specs.cjs, scripts/verify.sh]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/public-release-readiness.md, stepPath: specs/steps/public-release-readiness-step-1.md, baseSha: efe8dabe50acf4250e82adbb726f199648a53d60, implementationNoteIds: [NOTE-01]}
acceptanceCriteria:
  - {id: AC-01, evidence: [{id: EVIDENCE-01, kind: automated-test, description: "Suíte padrão passa sem executável de agente ou credenciais.", gateId: workflow-tests, resultRef: spec-public-release-readiness-step-1/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-adapter.cjs}]}
  - {id: AC-02, evidence: [{id: EVIDENCE-02, kind: automated-test, description: "Preflight real preserva OPENCODE_COMMAND_UNAVAILABLE quando a resolução controlada informa ausência.", gateId: workflow-tests, resultRef: spec-public-release-readiness-step-1/attempt-1/gate-workflow-tests, testSelector: production adapter fails preflight before runtime mutation}]}
  - {id: AC-03, evidence: [{id: EVIDENCE-03, kind: static-check, description: "Scripts e CI distinguem suíte hermética de capacidades dependentes da plataforma.", gateId: specs-lint, resultRef: spec-public-release-readiness-step-1/attempt-1/gate-specs-lint, testSelector: package.json .github/workflows/lint.yml scripts/lint-specs.cjs scripts/verify.sh}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 180, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, specs-lint, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: O contrato hermético já está documentado pela spec aprovada da pipeline; este step restaura sua execução.}
testing: {required: true, gateIds: [workflow-tests, specs-lint], rationale: A regressão observada está na fronteira entre fixtures e preflight real e exige prova automatizada junto ao contrato estrutural.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 1: suíte hermética

## Goal

Restaurar a suíte padrão hermética sem enfraquecer o fail-closed para executáveis ausentes.

## Tarefas

1. Fazer as fixtures do adapter injetarem resolução controlada coerente com o `runProcess` falso.
2. Preservar o cenário explícito em que `opencode` não pode ser resolvido.
3. Nomear e usar na CI a suíte hermética, mantendo capacidades reais fora do job padrão.
4. Materializar os gates `specs-lint` e `verify-pack` já catalogados, hoje ausentes na extração.

## Paths afetados (limite absoluto)

- `scripts/workflow/test-adapter.cjs`
- `package.json`
- `.github/workflows/lint.yml`
- `scripts/lint-specs.cjs`
- `scripts/verify.sh`

## Fora de Escopo

- Alterar o preflight de produção, instalar agente no runner ou editar testes de demo.

## Critério de Pronto

- A suíte padrão passa sem agente real e o teste de executável ausente continua falhando fechado.

## Checklist pré-handoff

- [ ] No máximo cinco arquivos.
- [ ] Nenhum skip genérico para ocultar falha.
- [ ] `workflow-tests`, `specs-lint` e revalidation passam.

## Prompt de handoff

```text
Implemente APENAS o Passo 1.
Files: @scripts/workflow/test-adapter.cjs @package.json @.github/workflows/lint.yml @scripts/lint-specs.cjs @scripts/verify.sh
Out of scope: runtime de produção, instalação de agente, demo e publicação.
Done criteria: suíte padrão hermética e fail-closed OPENCODE_COMMAND_UNAVAILABLE preservado.
---
@specs/steps/public-release-readiness-step-1.md
@specs/public-release-readiness.md
```
