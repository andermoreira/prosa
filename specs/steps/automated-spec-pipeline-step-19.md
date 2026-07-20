---
schemaVersion: 1.0.0
id: spec-automated-pipeline-step-19
sequence: 19
specId: spec-automated-pipeline
source:
  path: specs/steps/automated-spec-pipeline-step-19.md
  hash: f2e6a32a3e59e762991c0b1b0fcef9ffdfd15aa45e818c557debca6fbb97109b
  baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4
goal: Alinhar lifecycle, handoff, índice de steps, catálogo de commands e plugin manifest com o pipeline executável e o limite de arquivos lógicos.
boundaries:
  inScope:
    - behaviorType=vertical
    - owns=processo canônico, template, README de steps, catálogo de commands e manifest do plugin
    - invariant=todos os arquivos contam no limite de cinco e rename inequívoco conta um
    - allowedDependencies=spec-automated-pipeline-step-18
  outOfScope:
    - doesNotOwn=implementação do runtime, builders de commands ou mudança no catálogo funcional
  maxLogicalFiles: 5
dependsOn: [spec-automated-pipeline-step-18]
predictedFiles:
  - docs/workflows/spec-process.md
  - docs/workflows/templates/step-handoff.md
  - specs/steps/README.md
  - .cursor/commands/COMMANDS.md
  - .cursor-plugin/plugin.json
allowedAreas: [docs/workflows, specs/steps, .cursor/commands, .cursor-plugin]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/automated-spec-pipeline.md, stepPath: specs/steps/automated-spec-pipeline-step-19.md, baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4, implementationNoteIds: [NOTE-01, NOTE-02, NOTE-03]}
acceptanceCriteria:
  - id: AC-22
    evidence:
      - {id: EVIDENCE-28, kind: static-check, description: "Gate plugin-manifest-check valida a distribuição gerada dos commands aprovados.", gateId: plugin-manifest-check, resultRef: spec-automated-pipeline-step-19/attempt-1/gate-plugin-manifest-check, testSelector: .cursor-plugin/plugin.json}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [specs-lint, commands-opencode-check, plugin-manifest-check, plugin-manifest-lint, revalidation]}
revalidation:
  triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, on-resume]
  driftPolicy: block
documentationImpact:
  kind: paths
  paths: [docs/workflows/spec-process.md, docs/workflows/templates/step-handoff.md, specs/steps/README.md, .cursor/commands/COMMANDS.md]
testing: {required: true, gateIds: [specs-lint, commands-opencode-check, plugin-manifest-check, plugin-manifest-lint], rationale: "Índices e manifest gerado exigem checks anti-drift e lint estrutural."}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 19: Lifecycle e distribuição

## Goal

Alinhar o lifecycle e os artefatos distribuídos ao pipeline executável e à regra absoluta de cinco arquivos lógicos.

## Assumptions

- Os três commands canônicos já existem e o plugin manifest é artefato gerado/versionado.

## Risks

- Documentação continuar dizendo que testes não contam; mitigar revisando processo, template e índice no mesmo step.

## Edge cases

- Rename inequívoco, delete+add ambíguo, command ausente do índice e manifest gerado em drift.

## Acceptance Criteria

- Processo, handoff e README contam todos os arquivos lógicos; commands aparecem no catálogo e o manifest gerado inclui os três sem drift.

## Tarefas

1. Atualizar `docs/workflows/spec-process.md` com limite absoluto de cinco arquivos lógicos, incluindo produção, testes, docs e config; rename Git inequívoco conta um.
2. Atualizar `docs/workflows/templates/step-handoff.md` para exigir a mesma contagem e frontmatter executável quando aplicável.
3. Atualizar `specs/steps/README.md` para remover a regra antiga de arquivos de produção e registrar execução pipeline/sequência.
4. Atualizar `.cursor/commands/COMMANDS.md` com `/run-spec`, `/resume-spec` e `/review-spec`.
5. Atualizar `.cursor-plugin/plugin.json` pelo fluxo de manifest gerado para distribuir os três commands.

## Paths afetados (limite absoluto)

- `docs/workflows/spec-process.md`
- `docs/workflows/templates/step-handoff.md`
- `specs/steps/README.md`
- `.cursor/commands/COMMANDS.md`
- `.cursor-plugin/plugin.json`

## Fora de Escopo

- Alterar runtime, builder de commands ou inventário funcional além dos três commands já aprovados.

## Critério de Pronto

- Não resta regra ativa dizendo que testes não contam; catálogo e manifest incluem os commands e checks anti-drift passam.

## Dependências

- Passo 18.

## Checklist pré-handoff

- [ ] ≤ 5 arquivos afetados?
- [ ] Todos os tipos de arquivo contam e rename inequívoco conta um?
- [ ] Catálogo e manifest gerado estão alinhados?

---

## Prompt de handoff

```text
Implemente APENAS o Passo 19.
Files: @docs/workflows/spec-process.md @docs/workflows/templates/step-handoff.md @specs/steps/README.md @.cursor/commands/COMMANDS.md @.cursor-plugin/plugin.json
Out of scope: runtime, builders e mudanças de catálogo além dos três commands.
Done criteria: lifecycle usa cinco arquivos lógicos e distribuição inclui run/resume/review sem drift.
---
@specs/steps/automated-spec-pipeline-step-19.md
@specs/automated-spec-pipeline.md
```
