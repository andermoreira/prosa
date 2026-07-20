---
schemaVersion: 1.0.0
id: spec-automated-pipeline-step-6
sequence: 6
specId: spec-automated-pipeline
source:
  path: specs/steps/automated-spec-pipeline-step-6.md
  hash: 8fbd9dc30066997826d42cd85af9ded6e07b50ddcece81a6d62f2904418ade2b
  baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4
goal: Validar base, worktree e diff e impor cinco arquivos lógicos com rename inequívoco contado uma vez.
boundaries:
  inScope:
    - behaviorType=vertical
    - owns=base, worktree, diff estruturado e escopo lógico
    - invariant=rename Git inequívoco conta um e ambíguo conta dois
    - allowedDependencies=spec-automated-pipeline-step-5
  outOfScope:
    - doesNotOwn=commit, agents, retries e integração global
  maxLogicalFiles: 5
dependsOn: [spec-automated-pipeline-step-5]
predictedFiles:
  - scripts/workflow/lib/git.cjs
  - scripts/workflow/lib/scope.cjs
  - scripts/workflow/test-git.cjs
allowedAreas: [scripts/workflow]
resources:
  executor: opencode
  reviewer: opencode-reviewer
  diagnostician: opencode-diagnostician
  notifications: []
context:
  specPath: specs/automated-spec-pipeline.md
  stepPath: specs/steps/automated-spec-pipeline-step-6.md
  baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4
  implementationNoteIds: [NOTE-01, NOTE-02, NOTE-03]
acceptanceCriteria:
  - id: AC-13
    evidence:
      - id: EVIDENCE-09
        kind: automated-test
        description: Gate verify-pack cobre rename inequívoco, ambíguo, untracked e sexto arquivo lógico.
        gateId: verify-pack
        resultRef: spec-automated-pipeline-step-6/attempt-1/gate-verify-pack
        testSelector: scripts/workflow/test-git.cjs
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification:
  gateIds: [verify-pack, revalidation]
revalidation:
  triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, on-resume]
  driftPolicy: block
documentationImpact:
  kind: none
  justification: Política Git já está na spec e será consolidada na documentação do Step 17.
testing:
  required: true
  gateIds: [verify-pack]
  rationale: Casos de rename e path boundary exigem repositórios temporários.
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 6: Git, worktree e arquivos lógicos

## Goal

Validar base/worktree/diff e impor cinco arquivos lógicos com rename inequívoco contado uma vez.

## Assumptions

- O Git fornece status/diff estruturado e o lock do Passo 5 está ativo.

## Risks

- Heurística própria classificar rename; mitigar usando exclusivamente a classificação inequívoca do Git.

## Edge cases

- Rename com edição, case-only, delete+add ambíguo, untracked, deleção, symlink, submodule e sexto arquivo lógico.

## Acceptance Criteria

- Rename inequívoco conta um e preserva dois paths na evidência; ambíguo conta dois; sexto arquivo/path não previsto bloqueia.

## Tarefas

1. Criar `scripts/workflow/lib/git.cjs` para base aprovada, worktree, parent, diff estruturado e cleanup.
2. Criar `scripts/workflow/lib/scope.cjs` para paths previstos e contagem de arquivos lógicos sem override.
3. Criar `scripts/workflow/test-git.cjs` com todos os casos de rename/escopo, worktree não-sandbox e base dirty.

## Paths afetados (limite absoluto)

- `scripts/workflow/lib/git.cjs`
- `scripts/workflow/lib/scope.cjs`
- `scripts/workflow/test-git.cjs`

## Fora de Escopo

- Commit, agents, retries ou integração global.

## Critério de Pronto

- Contagem segue o ADR 018 e nenhuma heurística paralela de similaridade é usada.

## Dependências

- Passo 5; ADR 018.

## Checklist pré-handoff

- [ ] ≤ 5 arquivos afetados?
- [ ] Rename inequívoco=1 e ambíguo=2 testados?
- [ ] Worktree não foi tratado como sandbox?

---

## Prompt de handoff

```text
Implemente APENAS o Passo 6.
Files: @scripts/workflow/lib/git.cjs @scripts/workflow/lib/scope.cjs @scripts/workflow/test-git.cjs
Out of scope: commit, agents, retries e integração global.
Done criteria: base/worktree/diff seguros e limite lógico conforme ADR 018 testado.
---
@specs/steps/automated-spec-pipeline-step-6.md
@specs/automated-spec-pipeline.md
```
