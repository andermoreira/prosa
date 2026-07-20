---
schemaVersion: 1.0.0
id: spec-automated-pipeline-step-3
sequence: 3
specId: spec-automated-pipeline
source:
  path: specs/steps/automated-spec-pipeline-step-3.md
  hash: f6aa51320c7baa851ec0a53ae00c2c986027779b7d2ecdc2c12b163968a9156c
  baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4
goal: Resolver gates e recursos do base SHA e executar somente argv catalogado sem shell.
boundaries:
  inScope:
    - behaviorType=vertical
    - owns=catálogos confiáveis e fronteira única de subprocessos
    - invariant=somente IDs do base SHA geram argv com shell false
    - allowedDependencies=spec-automated-pipeline-step-2
  outOfScope:
    - doesNotOwn=comandos livres, catálogo remoto e sandbox
  maxLogicalFiles: 5
dependsOn: [spec-automated-pipeline-step-2]
predictedFiles:
  - workflow/gates.yaml
  - workflow/resources.yaml
  - scripts/workflow/lib/catalogs.cjs
  - scripts/workflow/lib/process.cjs
  - scripts/workflow/test-catalogs.cjs
allowedAreas:
  - workflow
  - scripts/workflow
resources:
  executor: opencode
  reviewer: opencode-reviewer
  diagnostician: opencode-diagnostician
  notifications: []
context:
  specPath: specs/automated-spec-pipeline.md
  stepPath: specs/steps/automated-spec-pipeline-step-3.md
  baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4
  implementationNoteIds: [NOTE-01, NOTE-02, NOTE-03]
acceptanceCriteria:
  - id: AC-06
    evidence:
      - id: EVIDENCE-03
        kind: contract-test
        description: Gate workflow-tests valida catálogos, resources e spawn sem shell.
        gateId: workflow-tests
        resultRef: spec-automated-pipeline-step-3/attempt-1/gate-workflow-tests
        testSelector: scripts/workflow/test-catalogs.cjs
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification:
  gateIds: [workflow-tests, revalidation]
revalidation:
  triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, on-resume]
  driftPolicy: block
documentationImpact:
  kind: none
  justification: Catálogos são configuração executável; uso operacional será documentado no Step 17.
testing:
  required: true
  gateIds: [workflow-tests]
  rationale: Trust boundary e injeção exigem fixtures positivas e negativas.
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 3: Catálogos e spawn seguro

## Goal

Resolver gates e recursos do base SHA e executar somente argv catalogado sem shell.

## Assumptions

- Git consegue ler `workflow/*.yaml` do base SHA aprovado.

## Risks

- Resource catalogado ainda ser perigoso; mitigar com capabilities mínimas, ambiente explícito e review do base.

## Edge cases

- ID duplicado/desconhecido, YAML abusivo, capability incompatível, cwd por symlink, timeout/sinal e saída excessiva.

## Acceptance Criteria

- Gate/resource inválido bloqueia antes do spawn; toda execução usa argv, `shell: false`, cwd confinado e ambiente mínimo.

## Tarefas

1. Criar `workflow/gates.yaml` com gates fase 1 por IDs estáveis.
2. Criar `workflow/resources.yaml` com OpenCode roles, Git/GitHub/notifier permitidos, capabilities e limites.
3. Criar `scripts/workflow/lib/catalogs.cjs` para carregar ambos do base SHA, validar e hashear.
4. Criar `scripts/workflow/lib/process.cjs` como única fronteira de subprocesso seguro.
5. Criar `scripts/workflow/test-catalogs.cjs` cobrindo trust boundary e injeção.

## Paths afetados (limite absoluto)

- `workflow/gates.yaml`
- `workflow/resources.yaml`
- `scripts/workflow/lib/catalogs.cjs`
- `scripts/workflow/lib/process.cjs`
- `scripts/workflow/test-catalogs.cjs`

## Fora de Escopo

- Comando livre em spec/step, shell, catálogo remoto ou sandbox.

## Critério de Pronto

- Somente IDs do base SHA resultam em spawn seguro; cópia adulterada no worktree é ignorada/reportada.

## Dependências

- Passos 1 e 2; ADR 017.

## Checklist pré-handoff

- [ ] ≤ 5 arquivos afetados?
- [ ] Gates e resources separados?
- [ ] Nenhuma string shell ou input textual executável?

---

## Prompt de handoff

```text
Implemente APENAS o Passo 3.
Files: @workflow/gates.yaml @workflow/resources.yaml @scripts/workflow/lib/catalogs.cjs @scripts/workflow/lib/process.cjs @scripts/workflow/test-catalogs.cjs
Out of scope: shell, comandos livres, catálogo remoto e sandbox.
Done criteria: catálogos do base SHA e spawn por argv falham fechado nos casos inválidos.
---
@specs/steps/automated-spec-pipeline-step-3.md
@specs/automated-spec-pipeline.md
```
