---
schemaVersion: 2.0.0
changeType: vetted_dependency
id: spec-prosa-spec-code-drift-step-1
sequence: 1
specId: spec-prosa-spec-code-drift
source: {path: specs/steps/prosa-spec-code-drift-step-1.md, hash: 331fd928939aa7cc91bcf17a6b4173339e84c86312d1fa88d496f28591567e0e, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
goal: Prototipar parser, worker, matriz, canonicalização, vetting e limites com baseline sem ativar drift em runs reais.
boundaries: {inScope: [owns=protótipo e baseline reproduzível, invariant=nenhum componente participa do caminho mutável, allowedDependencies=nenhum step anterior], outOfScope: [doesNotOwn=schema v3 wiring runtime e enablement], maxLogicalFiles: 5}
dependsOn: []
predictedFiles: [package.json, package-lock.json, scripts/workflow/prototype-spec-code-drift.cjs, docs/audits/prosa-spec-code-drift-prototype.md]
allowedAreas: [package.json, package-lock.json, scripts/workflow, docs/audits]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-spec-code-drift.md, stepPath: specs/steps/prosa-spec-code-drift-step-1.md, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0, implementationNoteIds: [NOTE-02, NOTE-05, NOTE-06]}
acceptanceCriteria:
  - {id: AC-05, evidence: [{id: EVIDENCE-05, kind: artifact, description: "Relatório registra pin, vetting, provenance, advisories, audit e instalação sem scripts.", resultRef: docs/audits/prosa-spec-code-drift-prototype.md}]}
  - {id: AC-06, evidence: [{id: EVIDENCE-06, kind: artifact, description: "Baseline registra matriz reproduzível de extensões e casos inconclusivos.", resultRef: docs/audits/prosa-spec-code-drift-prototype.md}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 180, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, specs-lint, verify-pack, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: paths, paths: [docs/audits/prosa-spec-code-drift-prototype.md]}
testing: {required: true, gateIds: [workflow-tests, specs-lint, verify-pack], rationale: O protótipo e a dependência pinada precisam preservar toda a suíte e o pack.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 1: Protótipo, vetting e baseline

## Goal

Prototipar parser, worker, matriz, canonicalização, vetting e limites com baseline sem ativar drift em runs reais.

## Assumptions

- Este handoff v2 é um dos 15 IDs da exceção bootstrap aprovada; o protótipo permanece isolado do runtime.

## Risks

- Limites arbitrários ou dependência comprometida; mitigar com fixtures reproduzíveis, pin exato e vetting documentado.

## Edge cases

- JSX/TSX/CTS/MTS, CJS dinâmico, AST profunda, arquivo grande, timeout e término coercitivo do worker.

## Acceptance Criteria

- O relatório fecha matriz, baseline, limites propostos e vetting sem habilitar execução mutável.

## Tarefas

1. Pinar `@babel/parser@7.29.7` em `package.json` e `package-lock.json`, sem alterar outras dependências.
2. Criar `scripts/workflow/prototype-spec-code-drift.cjs` para medir fixtures normais e adversariais sem wiring no orchestrator.
3. Registrar comandos, ambiente, matriz, números, vetting e riscos em `docs/audits/prosa-spec-code-drift-prototype.md`.

## Paths afetados (limite absoluto)

- `package.json`
- `package-lock.json`
- `scripts/workflow/prototype-spec-code-drift.cjs`
- `docs/audits/prosa-spec-code-drift-prototype.md`

## Fora de Escopo

- Alterar schemas, state, orchestrator, acceptance ou habilitar detector em runs reais.

## Critério de Pronto

- Pin e lock são exatos; baseline é reproduzível; matriz e limites são revisáveis; nenhum caminho mutável usa o protótipo.

## Dependências

- Nenhuma.

## Checklist pré-handoff

- [ ] Quatro paths previstos, sem arquivo adicional.
- [ ] Exceção bootstrap continua restrita ao ID e provenance aprovados.
- [ ] Componentes permanecem shadow/dormant.
- [ ] Evidências EVIDENCE-05 e EVIDENCE-06 são reproduzíveis.

## Prompt de handoff

```text
Implemente APENAS o Passo 1.
Files: @package.json @package-lock.json @scripts/workflow/prototype-spec-code-drift.cjs @docs/audits/prosa-spec-code-drift-prototype.md
Out of scope: schemas, state, orchestrator, acceptance e enablement.
Done criteria: pin e vetting registrados, baseline/matriz reproduzíveis e protótipo sem wiring mutável.
---
@specs/steps/prosa-spec-code-drift-step-1.md
@specs/prosa-spec-code-drift.md
```
