---
schemaVersion: 1.0.0
id: spec-automated-pipeline-step-16
sequence: 16
specId: spec-automated-pipeline
source: {path: specs/steps/automated-spec-pipeline-step-16.md, hash: 2fd872dd1f94c59680f755f3c27d001566759a3a8dd1f33626ba91eb80ca179e, baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4}
goal: Criar PR opt-in somente após sucesso global, sem publicar branch automaticamente.
boundaries:
  inScope:
    - behaviorType=vertical
    - owns=preflight e criação opcional de PR
    - invariant=PR exige SUCCEEDED e nenhum argv contém push
    - allowedDependencies=spec-automated-pipeline-step-15
  outOfScope:
    - doesNotOwn=push, merge, deploy, credenciais e proteção de branch
  maxLogicalFiles: 5
dependsOn: [spec-automated-pipeline-step-15]
predictedFiles: [scripts/workflow/lib/pr.cjs, scripts/workflow/lib/orchestrator.cjs, scripts/workflow/test-pr.cjs]
allowedAreas: [scripts/workflow]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/automated-spec-pipeline.md, stepPath: specs/steps/automated-spec-pipeline-step-16.md, baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4, implementationNoteIds: [NOTE-01, NOTE-02, NOTE-03]}
acceptanceCriteria:
  - id: AC-19
    evidence:
      - {id: EVIDENCE-24, kind: automated-test, description: Gate verify-pack valida preconditions e ausência de push em todo argv., gateId: verify-pack, resultRef: spec-automated-pipeline-step-16/attempt-1/gate-verify-pack, testSelector: scripts/workflow/test-pr.cjs}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [verify-pack, revalidation]}
revalidation:
  triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, on-resume, before-pull-request]
  driftPolicy: block
documentationImpact: {kind: none, justification: Operação de PR sem push será documentada no Step 17.}
testing: {required: true, gateIds: [verify-pack], rationale: Branches e gh são testados com fakes sem rede.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 16: PR opcional sem push

## Goal

Criar PR opt-in somente após sucesso global, sem publicar branch automaticamente.

## Assumptions

- O operador publica a branch fora do pipeline e configura `gh` quando deseja PR.

## Risks

- Pipeline tentar push como conveniência; mitigar não expondo essa operação e inspecionando argv.

## Edge cases

- Branch local-only, upstream divergente, `gh` ausente/desautenticado, PR existente e API indisponível.

## Acceptance Criteria

- PR só é tentado após `SUCCEEDED`; pré-condição ausente é acionável e nenhum caminho executa push.

## Tarefas

1. Criar `scripts/workflow/lib/pr.cjs` com preflight read-only e chamada `gh` catalogada sem push.
2. Integrar opção/resultado em `scripts/workflow/lib/orchestrator.cjs` sem reclassificar acceptance.
3. Criar `scripts/workflow/test-pr.cjs` cobrindo defaults, pré-condições, PR existente e argv sem push.

## Paths afetados (limite absoluto)

- `scripts/workflow/lib/pr.cjs`
- `scripts/workflow/lib/orchestrator.cjs`
- `scripts/workflow/test-pr.cjs`

## Fora de Escopo

- Push, merge, deploy, credenciais ou proteção de branch.

## Critério de Pronto

- Testes provam que nenhuma execução inclui `push` e falha de PR fica separada do aceite global.

## Dependências

- Passos 13 e 14; ADR 018.

## Checklist pré-handoff

- [ ] ≤ 5 arquivos afetados?
- [ ] PR exige sucesso global e opt-in?
- [ ] Ausência de push comprovada por argv?

---

## Prompt de handoff

```text
Implemente APENAS o Passo 16.
Files: @scripts/workflow/lib/pr.cjs @scripts/workflow/lib/orchestrator.cjs @scripts/workflow/test-pr.cjs
Out of scope: push, merge, deploy, credenciais e proteção de branch.
Done criteria: PR opt-in pós-sucesso sem push, com pré-condições e outcomes separados.
---
@specs/steps/automated-spec-pipeline-step-16.md
@specs/automated-spec-pipeline.md
```
