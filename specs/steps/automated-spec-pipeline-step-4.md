---
schemaVersion: 1.0.0
id: spec-automated-pipeline-step-4
sequence: 4
specId: spec-automated-pipeline
source:
  path: specs/steps/automated-spec-pipeline-step-4.md
  hash: 8142588d48e92de06dee4ba43ac5c5a7839011c10d763ae813dd2300e97dafe4
  baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4
goal: Fornecer entrypoints shell finos e parsing comum sem duplicar lógica de workflow.
boundaries:
  inScope:
    - behaviorType=vertical
    - owns=entrypoints run, resume, review e parsing fechado
    - invariant=scripts shell apenas encaminham argv e defaults mutáveis são false
    - allowedDependencies=spec-automated-pipeline-step-3
  outOfScope:
    - doesNotOwn=state machine, OpenCode, commit e commands Cursor
  maxLogicalFiles: 5
dependsOn: [spec-automated-pipeline-step-3]
predictedFiles:
  - scripts/workflow/run-spec.sh
  - scripts/workflow/resume-spec.sh
  - scripts/workflow/review-spec.sh
  - scripts/workflow/lib/cli.cjs
  - scripts/workflow/test-cli.cjs
allowedAreas: [scripts/workflow]
resources:
  executor: opencode
  reviewer: opencode-reviewer
  diagnostician: opencode-diagnostician
  notifications: []
context:
  specPath: specs/automated-spec-pipeline.md
  stepPath: specs/steps/automated-spec-pipeline-step-4.md
  baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4
  implementationNoteIds: [NOTE-01, NOTE-02, NOTE-03]
acceptanceCriteria:
  - id: AC-09
    evidence:
      - id: EVIDENCE-04
        kind: contract-test
        description: Gate verify-pack comprova parsing e forwarding seguro dos três modos.
        gateId: verify-pack
        resultRef: spec-automated-pipeline-step-4/attempt-1/gate-verify-pack
        testSelector: scripts/workflow/test-cli.cjs
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification:
  gateIds: [verify-pack, revalidation]
revalidation:
  triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, on-resume]
  driftPolicy: block
documentationImpact:
  kind: none
  justification: Entry points internos serão descritos na documentação operacional do Step 17.
testing:
  required: true
  gateIds: [verify-pack]
  rationale: Quoting, flags e defaults exigem teste automatizado.
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 4: Entrypoints run, resume e review

## Goal

Fornecer entrypoints shell finos e parsing comum sem duplicar lógica de workflow.

## Assumptions

- Toda capacidade executável é resolvida pelos catálogos do Passo 3.

## Risks

- Quoting shell alterar argumentos; mitigar com scripts mínimos e arrays/argv no núcleo Node.

## Edge cases

- Flag desconhecida, combinações incompatíveis, path com espaço, sinal e command invocado fora de repo.

## Acceptance Criteria

- Os três entrypoints encaminham argv fielmente, validam modo/flags e não executam lógica mutável própria.

## Tarefas

1. Criar `scripts/workflow/run-spec.sh`, `resume-spec.sh` e `review-spec.sh`.
2. Criar `scripts/workflow/lib/cli.cjs` para parsing fechado de config, base, runId, `--allow-commit` e PR opt-in.
3. Criar `scripts/workflow/test-cli.cjs` para contrato dos três modos e quoting.

## Paths afetados (limite absoluto)

- `scripts/workflow/run-spec.sh`
- `scripts/workflow/resume-spec.sh`
- `scripts/workflow/review-spec.sh`
- `scripts/workflow/lib/cli.cjs`
- `scripts/workflow/test-cli.cjs`

## Fora de Escopo

- State machine, OpenCode, commit ou commands `.cursor`.

## Critério de Pronto

- Testes provam forwarding sem shell injection e falha para flags/modos inválidos.

## Dependências

- Passo 3.

## Checklist pré-handoff

- [ ] ≤ 5 arquivos afetados?
- [ ] Shell scripts são adapters finos?
- [ ] Flags mutáveis têm default seguro?

---

## Prompt de handoff

```text
Implemente APENAS o Passo 4.
Files: @scripts/workflow/run-spec.sh @scripts/workflow/resume-spec.sh @scripts/workflow/review-spec.sh @scripts/workflow/lib/cli.cjs @scripts/workflow/test-cli.cjs
Out of scope: state machine, agentes, commit e commands Cursor.
Done criteria: três modos encaminham argv com parsing fechado e defaults seguros.
---
@specs/steps/automated-spec-pipeline-step-4.md
@specs/automated-spec-pipeline.md
```
