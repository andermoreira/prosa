---
schemaVersion: 2.0.0
changeType: api_contract
id: spec-prosa-dependency-vetting-step-2
sequence: 2
specId: spec-prosa-dependency-vetting
source: {path: specs/steps/prosa-dependency-vetting-step-2.md, hash: 07b4efc28193ed1d53fee4c78323f8158a4e73e15b90df0a70d764e0c678f614, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
goal: Definir step v4 e dependency policy fechada sem habilitar seu consumo produtivo.
boundaries: {inScope: [owns=step v4 policy e validators, invariant=contratos são fail-closed e dormentes, allowedDependencies=step 1], outOfScope: [doesNotOwn=broker state e enablement], maxLogicalFiles: 5}
dependsOn: [spec-prosa-dependency-vetting-step-1]
predictedFiles: [schemas/step.schema.json, workflow/dependency-policy.yaml, scripts/workflow/lib/dependency-policy.cjs, scripts/workflow/test-contracts.cjs, scripts/workflow/test-dependency-policy.cjs]
allowedAreas: [schemas, workflow, scripts/workflow/lib, scripts/workflow/test-contracts.cjs, scripts/workflow/test-dependency-policy.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-dependency-vetting.md, stepPath: specs/steps/prosa-dependency-vetting-step-2.md, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0, implementationNoteIds: [NOTE-04, NOTE-08]}
acceptanceCriteria:
  - {id: AC-01, evidence: [{id: EVIDENCE-201, kind: contract-test, description: "Schema v4 aceita somente requests npm públicos e exatos.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-2/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-contracts.cjs}]}
  - {id: AC-02, evidence: [{id: EVIDENCE-202, kind: contract-test, description: "Contrato valida cwd, versão exata e optional suportado.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-2/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-contracts.cjs}]}
  - {id: AC-04, evidence: [{id: EVIDENCE-204, kind: contract-test, description: "Compatibilidade v3 rejeita dependency change não declarada.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-2/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-contracts.cjs}]}
  - {id: AC-06, evidence: [{id: EVIDENCE-206, kind: contract-test, description: "Manifest e lock continuam no limite e node_modules não é autoral.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-2/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-contracts.cjs}]}
  - {id: AC-10, evidence: [{id: EVIDENCE-210, kind: contract-test, description: "Policy fechada e hasheada contém controles aprovados e preapproved vazio.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-2/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-dependency-policy.cjs}]}
  - {id: AC-11, evidence: [{id: EVIDENCE-211, kind: contract-test, description: "Entrada preapproved exige closure e approval metadata completos.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-2/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-dependency-policy.cjs}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: Documentação durável será atualizada no Step 20 antes do enablement.}
testing: {required: true, gateIds: [workflow-tests], rationale: Contratos fechados exigem fixtures positivas e negativas.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 2: Step v4 e dependency policy

## Goal
Definir contratos v4 e policy confiável sem habilitar o fluxo produtivo.

## Assumptions
- Os 15 steps de drift estão concluídos; o bootstrap v2 é exato por spec hash, baseSha e IDs 1–22.
- Steps 1–21 não habilitam materialização, agentes ou gates produtivos.

## Risks
- Compatibilidade v3 virar permissão geral; restringir à semântica aceita e bloquear mutation não declarada.

## Edge cases
- Campos extras, range/tag, paths divergentes, workspace/link/bundled e preapproval incompleto.

## Acceptance Criteria
- Schemas e policy cobrem AC-01, AC-02, AC-04, AC-06, AC-10 e AC-11 em testes negativos.

## Tarefas
1. Evoluir `schemas/step.schema.json` para v4 sequencial ao v3.
2. Criar policy produtiva fechada com `preapproved: []` e loader puro.
3. Cobrir versões, paths, sources, closure e bootstrap exato sem ativar enforcement produtivo.

## Paths afetados (limite absoluto)
- `schemas/step.schema.json`
- `workflow/dependency-policy.yaml`
- `scripts/workflow/lib/dependency-policy.cjs`
- `scripts/workflow/test-contracts.cjs`
- `scripts/workflow/test-dependency-policy.cjs`

## Fora de Escopo
- Broker, state v5, materialização e enablement.

## Critério de Pronto
- Contratos falham fechado e permanecem dormentes fora da exceção bootstrap exata.

## Dependências
- Passo 1 e conclusão externa dos 15 steps de drift.

## Checklist pré-handoff
- [ ] Cinco arquivos totais?
- [ ] Nenhuma compatibilidade geral com step v2?
- [ ] ACs e testes negativos cobertos?

## Prompt de handoff
```text
Implemente APENAS o Passo 2.
Files: @schemas/step.schema.json @workflow/dependency-policy.yaml @scripts/workflow/lib/dependency-policy.cjs @scripts/workflow/test-contracts.cjs @scripts/workflow/test-dependency-policy.cjs
Out of scope: broker, state, materialização e enablement.
Done criteria: step v4 e policy fechada validam ACs sem habilitar produção.
---
@specs/steps/prosa-dependency-vetting-step-2.md
@specs/prosa-dependency-vetting.md
```
