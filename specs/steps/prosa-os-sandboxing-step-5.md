---
schemaVersion: 1.0.0
id: spec-prosa-os-sandboxing-step-5
sequence: 5
specId: spec-prosa-os-sandboxing
source: {path: specs/steps/prosa-os-sandboxing-step-5.md, hash: 194af1bb3150e2a97123a1ff2bc69cec100241145cfab3abc1b72e3fead19433, baseSha: 7fb3c4b5659e5e8a69ceb032a27a25307d4f5ced}
goal: Evoluir o state para provar qual policy protegeu cada chamada e reaplicá-la sem regeneração permissiva.
boundaries:
  inScope:
    - behaviorType=vertical
    - owns=state, runtime e adapter local para vínculo policy-step-attempt
    - invariant=policy persiste antes do spawn e drift bloqueia resume
    - allowedDependencies=spec-prosa-os-sandboxing-step-4
  outOfScope:
    - doesNotOwn=wiring OpenCode ou Cursor, catálogo, gates, MCP e migração de runs antigos
  maxLogicalFiles: 5
dependsOn: [spec-prosa-os-sandboxing-step-4]
predictedFiles: [schemas/state.schema.json, scripts/workflow/lib/runtime.cjs, scripts/workflow/test-state.cjs, scripts/workflow/lib/local-adapter.cjs, scripts/workflow/test-adapter.cjs]
allowedAreas: [schemas/state.schema.json, scripts/workflow]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-os-sandboxing.md, stepPath: specs/steps/prosa-os-sandboxing-step-5.md, baseSha: 7fb3c4b5659e5e8a69ceb032a27a25307d4f5ced, implementationNoteIds: [NOTE-01]}
acceptanceCriteria:
  - id: AC-06
    evidence:
      - {id: EVIDENCE-10, kind: contract-test, description: "Gate workflow-tests comprova policy normalizada por papel e sandboxPolicyHash por attempt.", gateId: workflow-tests, resultRef: spec-prosa-os-sandboxing-step-5/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-state.cjs}
  - id: AC-07
    evidence:
      - {id: EVIDENCE-11, kind: automated-test, description: "Gate workflow-tests comprova bloqueio de drift no resume e reconciliação conservadora.", gateId: workflow-tests, resultRef: spec-prosa-os-sandboxing-step-5/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-adapter.cjs}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation:
  triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, on-resume]
  driftPolicy: block
documentationImpact: {kind: none, justification: State e resume serão documentados de forma durável no Step 9.}
testing: {required: true, gateIds: [workflow-tests], rationale: "Persistência, crash windows, referências e drift exigem testes de contrato e integração local."}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 5: Persistir policy-step-attempt e bloquear drift no resume

## Goal

Evoluir o state para provar qual policy protegeu cada chamada e reaplicá-la sem regeneração permissiva.

## Assumptions

- A evolução de schema é incompatível; runs 1.0.0 sem prova de sandbox não são migrados implicitamente.

## Risks

- Persistir depois do spawn ou compartilhar um hash entre papéis; gravar e validar antes de cada efeito.

## Edge cases

- Crash antes/depois do spawn, reviewer e diagnostician no mesmo ciclo, attempt sem artifact,
  resource/path/domínio/versão alterado e state antigo.

## Acceptance Criteria

- O schema registra engine/backend/plataforma e policies normalizadas por papel nas applications do
  step; cada attempt de execução referencia seu hash; artifacts conservam operation ID e hash.
- Resume compara policy persistida com catálogo/base/runtime atuais e retorna
  `SANDBOX_POLICY_DRIFT` em qualquer divergência, sem default ou fallback.

## Tarefas

1. Evoluir `schemas/state.schema.json` com versão incompatível, policy por step e
   `sandboxPolicyHash` obrigatório por attempt de agente.
2. Atualizar `scripts/workflow/lib/runtime.cjs` e `scripts/workflow/test-state.cjs` para validar
   unicidade, hash, referências step-attempt-artifact e rejeição de state antigo/drift.
3. Atualizar `scripts/workflow/lib/local-adapter.cjs` para persistir a policy antes da chamada,
   representar chamadas por papel sem confundir o número de retry do executor e revalidar no resume.
4. Expandir `scripts/workflow/test-adapter.cjs` com crash windows, policy drift e reconciliação conservadora.

## Paths afetados (limite absoluto)

- `schemas/state.schema.json`
- `scripts/workflow/lib/runtime.cjs`
- `scripts/workflow/test-state.cjs`
- `scripts/workflow/lib/local-adapter.cjs`
- `scripts/workflow/test-adapter.cjs`

## Fora de Escopo

- Wiring específico de OpenCode/Cursor, policy do catálogo, gates, MCP e migração de runs antigos.

## Critério de Pronto

- State é gravado antes do spawn, referências são íntegras e resume só continua com policy idêntica comprovada.

## Dependências

- Passo 4.

## Checklist pré-handoff

- [ ] Cinco arquivos afetados?
- [ ] Cada papel aponta para seu próprio hash?
- [ ] State antigo e drift bloqueiam sem migração implícita?

## Prompt de handoff

```text
Implemente APENAS o Passo 5.
Files: @schemas/state.schema.json @scripts/workflow/lib/runtime.cjs @scripts/workflow/test-state.cjs @scripts/workflow/lib/local-adapter.cjs @scripts/workflow/test-adapter.cjs
Out of scope: adapters OpenCode/Cursor, catálogo, gates, MCP e migração de runs antigos.
Done criteria: policy-step-attempt persiste antes do spawn; artifacts/references são íntegros; resume bloqueia qualquer drift.
---
@specs/steps/prosa-os-sandboxing-step-5.md
@specs/prosa-os-sandboxing.md
```
