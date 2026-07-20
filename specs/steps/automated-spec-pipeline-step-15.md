---
schemaVersion: 1.0.0
id: spec-automated-pipeline-step-15
sequence: 15
specId: spec-automated-pipeline
source: {path: specs/steps/automated-spec-pipeline-step-15.md, hash: 09d1631e40f860aa8e76217a9aa1b09f8a91ce31318eefb442fd6aa130fec260, baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4}
goal: Disponibilizar run-spec, resume-spec e review-spec a partir da fonte canônica .cursor/commands.
boundaries:
  inScope:
    - behaviorType=vertical
    - owns=três commands canônicos e teste de geração OpenCode
    - invariant=Markdown encaminha aos entrypoints e não duplica orchestration
    - allowedDependencies=spec-automated-pipeline-step-14
  outOfScope:
    - doesNotOwn=configuração pessoal OpenCode, segunda fonte e lógica no Markdown
  maxLogicalFiles: 5
dependsOn: [spec-automated-pipeline-step-14]
predictedFiles: [.cursor/commands/run-spec.md, .cursor/commands/resume-spec.md, .cursor/commands/review-spec.md, scripts/workflow/test-commands.cjs]
allowedAreas: [.cursor/commands, scripts/workflow]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/automated-spec-pipeline.md, stepPath: specs/steps/automated-spec-pipeline-step-15.md, baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4, implementationNoteIds: [NOTE-01, NOTE-02, NOTE-03]}
acceptanceCriteria:
  - id: AC-09
    evidence:
      - {id: EVIDENCE-23, kind: static-check, description: Gate commands-opencode-check valida geração OpenCode a partir da fonte Cursor., gateId: commands-opencode-check, resultRef: spec-automated-pipeline-step-15/attempt-1/gate-commands-opencode-check, testSelector: .cursor/commands/run-spec.md}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [commands-opencode-check, commands-claude-check, revalidation]}
revalidation:
  triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, on-resume]
  driftPolicy: block
documentationImpact:
  kind: paths
  paths: [.cursor/commands/run-spec.md, .cursor/commands/resume-spec.md, .cursor/commands/review-spec.md]
testing: {required: true, gateIds: [commands-opencode-check, commands-claude-check], rationale: Geração deve ocorrer em destino temporário sem drift.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 15: Commands canônicos para OpenCode

## Goal

Disponibilizar `/run-spec`, `/resume-spec` e `/review-spec` a partir da fonte canônica `.cursor/commands/`.

## Assumptions

- O builder OpenCode existente descobre automaticamente commands canônicos novos.

## Risks

- Command duplicar state/orchestration; mitigar fazendo-o chamar somente os entrypoints aprovados.

## Edge cases

- Command sem argumento, flags mutáveis, geração para diretório temporário e marker de artefato gerado.

## Acceptance Criteria

- Os três commands orientam autorização/limites corretamente e o builder materializa equivalentes OpenCode sem fonte paralela.

## Tarefas

1. Criar `.cursor/commands/run-spec.md` apontando para `scripts/workflow/run-spec.sh` e os preflights obrigatórios.
2. Criar `.cursor/commands/resume-spec.md` apontando para `scripts/workflow/resume-spec.sh`, lock/revalidation e reconciliação.
3. Criar `.cursor/commands/review-spec.md` apontando para `scripts/workflow/review-spec.sh` e snapshot read-only.
4. Criar `scripts/workflow/test-commands.cjs` que invoque o builder existente em destino temporário e valide geração/semântica OpenCode.

## Paths afetados (limite absoluto)

- `.cursor/commands/run-spec.md`
- `.cursor/commands/resume-spec.md`
- `.cursor/commands/review-spec.md`
- `scripts/workflow/test-commands.cjs`

## Fora de Escopo

- Editar configuração pessoal OpenCode, criar segunda fonte ou implementar lógica no Markdown.

## Critério de Pronto

- Fonte Cursor e saída OpenCode gerada ficam semanticamente alinhadas e testes não escrevem no home real.

## Dependências

- Passos 4, 5, 8 e 13.

## Checklist pré-handoff

- [ ] ≤ 5 arquivos afetados?
- [ ] `.cursor/commands/` é a única fonte?
- [ ] Build/test usa destino temporário?

---

## Prompt de handoff

```text
Implemente APENAS o Passo 15.
Files: @.cursor/commands/run-spec.md @.cursor/commands/resume-spec.md @.cursor/commands/review-spec.md @scripts/workflow/test-commands.cjs
Out of scope: config pessoal OpenCode, segunda fonte e lógica de workflow no Markdown.
Done criteria: builder existente gera os três commands OpenCode a partir dos canônicos e o teste usa destino temporário.
---
@specs/steps/automated-spec-pipeline-step-15.md
@specs/automated-spec-pipeline.md
```
