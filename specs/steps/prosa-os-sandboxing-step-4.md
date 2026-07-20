---
schemaVersion: 1.0.0
id: spec-prosa-os-sandboxing-step-4
sequence: 4
specId: spec-prosa-os-sandboxing
source: {path: specs/steps/prosa-os-sandboxing-step-4.md, hash: 6eb95b11e5b6efcd53cb4eae4ac2d679646073d587f62388e9e68e582fbf457a, baseSha: 7fb3c4b5659e5e8a69ceb032a27a25307d4f5ced}
goal: Fazer cada resource de agente resolver uma policy deny-first fechada e validada do base SHA.
boundaries:
  inScope:
    - behaviorType=vertical
    - owns=schema, catálogo e testes de policies por resource
    - invariant=filesystem, rede e sockets são deny-first por papel
    - allowedDependencies=spec-prosa-os-sandboxing-step-3
  outOfScope:
    - doesNotOwn=gates, MCP, wiring de adapters e persistência de state
  maxLogicalFiles: 5
dependsOn: [spec-prosa-os-sandboxing-step-3]
predictedFiles: [scripts/workflow/lib/catalogs.cjs, workflow/resources.yaml, scripts/workflow/test-catalogs.cjs]
allowedAreas: [scripts/workflow, workflow/resources.yaml]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-os-sandboxing.md, stepPath: specs/steps/prosa-os-sandboxing-step-4.md, baseSha: 7fb3c4b5659e5e8a69ceb032a27a25307d4f5ced, implementationNoteIds: [NOTE-01]}
acceptanceCriteria:
  - id: AC-02
    evidence:
      - {id: EVIDENCE-06, kind: contract-test, description: "Gate workflow-tests rejeita escrita fora das áreas permitidas e em papéis read-only.", gateId: workflow-tests, resultRef: spec-prosa-os-sandboxing-step-4/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-catalogs.cjs}
  - id: AC-03
    evidence:
      - {id: EVIDENCE-07, kind: contract-test, description: "Gate workflow-tests valida a negação dos padrões de arquivos sensíveis.", gateId: workflow-tests, resultRef: spec-prosa-os-sandboxing-step-4/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-catalogs.cjs}
  - id: AC-04
    evidence:
      - {id: EVIDENCE-08, kind: contract-test, description: "Gate workflow-tests rejeita Unix sockets e opções fracas no catálogo.", gateId: workflow-tests, resultRef: spec-prosa-os-sandboxing-step-4/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-catalogs.cjs}
  - id: AC-05
    evidence:
      - {id: EVIDENCE-09, kind: contract-test, description: "Gate workflow-tests valida allowlists exatas por resource e rede deny-by-default.", gateId: workflow-tests, resultRef: spec-prosa-os-sandboxing-step-4/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-catalogs.cjs}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation:
  triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, on-resume]
  driftPolicy: block
documentationImpact: {kind: none, justification: O contrato operacional das policies será documentado no Step 9.}
testing: {required: true, gateIds: [workflow-tests], rationale: As invariantes deny-first do catálogo exigem fixtures positivas e negativas.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 4: Catalogar policies por resource

## Goal

Fazer cada resource de agente resolver uma policy deny-first fechada e validada do base SHA.

## Assumptions

- Os seis resources existentes de OpenCode e Cursor são a autoridade para papel e provider.

## Risks

- Wildcard de rede ou path amplo neutralizar o isolamento; rejeitar valores não exatos e opções fracas.

## Edge cases

- Resource sem policy, papel divergente, domínio duplicado/wildcard, path relativo/por symlink,
  write em papel read-only, sockets liberados ou endpoint observado mas não aprovado.

## Acceptance Criteria

- `opencode`, `opencode-reviewer`, `opencode-diagnostician`, `cursor-cli`,
  `cursor-cli-reviewer` e `cursor-cli-diagnostician` têm policy explícita.
- Reviewer/diagnostician têm escrita vazia e somente rede exata do provider; executor acrescenta
  apenas endpoints aprovados de GitHub/npm; rede e Unix sockets são deny-by-default.
- Padrões sensíveis incluem `.env*`, credenciais, HOME privado, PEM/key e equivalentes, traduzíveis
  para `credentials.files` deny.

## Tarefas

1. Estender `scripts/workflow/lib/catalogs.cjs` com schema e invariantes semânticas fechadas da policy.
2. Atualizar `workflow/resources.yaml` com policies específicas para os seis resources, levantando
   os endpoints exatos dos providers em ambiente controlado; endpoint apenas observado não autoriza wildcard.
3. Expandir `scripts/workflow/test-catalogs.cjs` com fixtures válidas e rejeições de privilégio.

## Paths afetados (limite absoluto)

- `scripts/workflow/lib/catalogs.cjs`
- `workflow/resources.yaml`
- `scripts/workflow/test-catalogs.cjs`

## Fora de Escopo

- Alterar gates, `workflow/gates.yaml`, MCP, wiring dos adapters ou persistência de state.

## Critério de Pronto

- Catálogo válido resolve policy normalizada por resource; ausência ou ampliação indevida bloqueia antes do agente.

## Dependências

- Passo 3.

## Checklist pré-handoff

- [ ] Três arquivos afetados?
- [ ] Nenhum wildcard, socket ou opção fraca configurável?
- [ ] OpenCode e Cursor cobertos nos três papéis?

## Prompt de handoff

```text
Implemente APENAS o Passo 4.
Files: @scripts/workflow/lib/catalogs.cjs @workflow/resources.yaml @scripts/workflow/test-catalogs.cjs
Out of scope: gates, workflow/gates.yaml, MCP, adapters e state.
Done criteria: seis resources têm policy deny-first validada; domínios são exatos; read-only, credentials.files deny e sockets vazios são invariantes.
---
@specs/steps/prosa-os-sandboxing-step-4.md
@specs/prosa-os-sandboxing.md
```
