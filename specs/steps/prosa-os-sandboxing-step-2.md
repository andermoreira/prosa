---
schemaVersion: 1.0.0
id: spec-prosa-os-sandboxing-step-2
sequence: 2
specId: spec-prosa-os-sandboxing
source: {path: specs/steps/prosa-os-sandboxing-step-2.md, hash: 9abc58e49aff3992e946b27864484fbce949307f0d504dc94196f5eb674925e0, baseSha: 7fb3c4b5659e5e8a69ceb032a27a25307d4f5ced}
goal: Validar o ADR 021 como restrição normativa antes de qualquer wiring do sandbox.
boundaries:
  inScope:
    - behaviorType=vertical
    - owns=validação normativa do ADR 021
    - invariant=ADR Accepted não é editado e mudança futura exige ADR superseding
    - allowedDependencies=spec-prosa-os-sandboxing-step-1
  outOfScope:
    - doesNotOwn=código, ADR 017, gates e MCP
  maxLogicalFiles: 5
dependsOn: [spec-prosa-os-sandboxing-step-1]
predictedFiles:
  - adr/021-sandbox-de-so-para-chamadas-de-agentes.md
allowedAreas:
  - adr/021-sandbox-de-so-para-chamadas-de-agentes.md
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context:
  specPath: specs/prosa-os-sandboxing.md
  stepPath: specs/steps/prosa-os-sandboxing-step-2.md
  baseSha: 7fb3c4b5659e5e8a69ceb032a27a25307d4f5ced
  implementationNoteIds: [NOTE-01]
acceptanceCriteria:
  - id: AC-15
    evidence:
      - id: EVIDENCE-03
        kind: documentation
        description: O ADR registra trust boundary, camada anticorrupção, fail-closed e vínculo policy-step-attempt.
        resultRef: adr/021-sandbox-de-so-para-chamadas-de-agentes.md
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [specs-lint, revalidation]}
revalidation:
  triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, on-resume]
  driftPolicy: block
documentationImpact:
  kind: paths
  paths: [adr/021-sandbox-de-so-para-chamadas-de-agentes.md]
testing:
  required: false
  gateIds: []
  rationale: O aceite deste step é documental e normativo; não há comportamento executável novo.
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 2: Ratificar a nova trust boundary

## Goal

Validar o ADR 021 como restrição normativa antes de qualquer wiring do sandbox.

## Assumptions

- O ADR 017 permanece válido para catálogos, gates, argv e aceite, exceto nos pontos explicitamente superados.

## Risks

- Interpretar o shell interno do SRT como autorização geral; manter a exceção restrita à camada anticorrupção.

## Edge cases

- Upgrade do SRT, backend não macOS, cleanup inconclusivo ou tentativa de incluir gates/MCP.

## Acceptance Criteria

- O ADR cobre camada anticorrupção, pin 0.0.66, policy por resource, fail-closed por papel,
  policy-step-attempt e shell interno encapsulado, além de assumptions, risks e edge cases.

## Tarefas

1. Revisar `adr/021-sandbox-de-so-para-chamadas-de-agentes.md` contra a spec aprovada e registrar
   qualquer mudança futura somente por ADR superseding, sem editar ADR Accepted.

## Paths afetados (limite absoluto)

- `adr/021-sandbox-de-so-para-chamadas-de-agentes.md`

## Fora de Escopo

- Implementar código, modificar o ADR 017, sandboxar gates ou MCP.

## Critério de Pronto

- A decisão Accepted é autônoma, não contradiz os non-goals e orienta os passos seguintes.

## Dependências

- Passo 1.

## Checklist pré-handoff

- [ ] Um arquivo afetado?
- [ ] A supersessão é parcial e o ADR 017 permaneceu imutável?

## Prompt de handoff

```text
Implemente APENAS o Passo 2.
Files: @adr/021-sandbox-de-so-para-chamadas-de-agentes.md
Out of scope: código, ADR 017, gates e MCP.
Done criteria: ADR 021 permanece Accepted, completo e consistente com a spec e o protótipo.
---
@specs/steps/prosa-os-sandboxing-step-2.md
@specs/prosa-os-sandboxing.md
```
