---
schemaVersion: 1.0.0
id: spec-sandbox-hardening-step-1
sequence: 1
specId: spec-sandbox-hardening
source: {path: specs/steps/sandbox-hardening-step-1.md, hash: 7839427e28b7a3539eb65f19a107f859320e4bf103d3f3c5c9262005ea5b0724, baseSha: a19887da2b0b63746e61eb82a36e4a2e4b8f04c3}
goal: Persistir um marcador de poison ao falhar o cleanup do sandbox e bloquear run, resume e review fail-closed até a remoção manual.
boundaries:
  inScope:
    - behaviorType=vertical
    - owns=persistência do marcador de poison e bloqueio SANDBOX_POISONED no adapter local
    - invariant=nenhum caminho do pipeline remove o marcador nem spawna agente com marcador presente
    - allowedDependencies=[]
  outOfScope:
    - doesNotOwn=sandbox.cjs, provas adversariais macOS, flags de CLI, state schema e gates
  maxLogicalFiles: 5
dependsOn: []
predictedFiles: [scripts/workflow/lib/local-adapter.cjs, scripts/workflow/test-adapter.cjs, docs/workflows/automated-spec-pipeline-runbook.md]
allowedAreas: [scripts/workflow, docs/workflows]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/sandbox-hardening.md, stepPath: specs/steps/sandbox-hardening-step-1.md, baseSha: a19887da2b0b63746e61eb82a36e4a2e4b8f04c3, implementationNoteIds: [NOTE-01]}
acceptanceCriteria:
  - id: AC-01
    evidence:
      - {id: EVIDENCE-01, kind: automated-test, description: "Gate workflow-tests comprova que SANDBOX_CLEANUP_FAILED persiste o marcador sanitizado antes de propagar.", gateId: workflow-tests, resultRef: spec-sandbox-hardening-step-1/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-adapter.cjs}
  - id: AC-02
    evidence:
      - {id: EVIDENCE-02, kind: automated-test, description: "Gate workflow-tests comprova que run, resume e review bloqueiam com SANDBOX_POISONED antes de qualquer spawn.", gateId: workflow-tests, resultRef: spec-sandbox-hardening-step-1/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-adapter.cjs}
  - id: AC-03
    evidence:
      - {id: EVIDENCE-03, kind: automated-test, description: "Gate workflow-tests comprova que nenhum caminho do adapter remove o marcador.", gateId: workflow-tests, resultRef: spec-sandbox-hardening-step-1/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-adapter.cjs}
  - id: AC-06
    evidence:
      - {id: EVIDENCE-04, kind: documentation, description: "Runbook documenta a verificação do host e o procedimento manual de remoção do marcador.", resultRef: docs/workflows/automated-spec-pipeline-runbook.md#sandbox-poison}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation:
  triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, on-resume]
  driftPolicy: block
documentationImpact: {kind: paths, paths: [docs/workflows/automated-spec-pipeline-runbook.md]}
testing: {required: true, gateIds: [workflow-tests], rationale: "Persistência do marcador e bloqueio fail-closed em run, resume e review precisam de prova automatizada."}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 1: Marcador de poison persistido e bloqueio fail-closed

## Goal

Persistir um marcador de poison ao falhar o cleanup do sandbox e bloquear run, resume e review
fail-closed até a remoção manual.

## Assumptions

- O flag `poisoned` em memória de `createSandboxRunner` permanece a primeira defesa; o marcador cobre
  apenas a janela entre processos.
- Todo spawn de agente passa pelo adapter local (`invoke`, `reviewerCall`), que já captura
  `SANDBOX_CLEANUP_FAILED`; por isso o adapter é o dono da persistência e da verificação, mantendo
  `sandbox.cjs` sem conhecimento de runtime paths (NOTE-01).
- `.workflow-runtime/sandbox-poison.json` vive na raiz do runtime, fora de `runs/<runId>/`, porque o
  dano é do host e deve bloquear qualquer run.

## Risks

- Escrita do marcador falhar e mascarar o `SANDBOX_CLEANUP_FAILED` original; a falha de escrita deve
  ser reportada junto, nunca no lugar do erro original.

## Edge cases

- Marcador com JSON inválido, truncado ou permissão errada: tratado como poison.
- Cleanup falho nas três frentes (reset, scratch, chmod): um único marcador com causa composta.
- Poison durante `review` read-only: bloqueia igualmente, pois o reviewer também spawna agente.
- Marcador com `schemaVersion` desconhecida: poison; nunca ignorar.

## Acceptance Criteria

- Ao capturar `SANDBOX_CLEANUP_FAILED`, o adapter escreve `.workflow-runtime/sandbox-poison.json`
  atomicamente, com `runId`, `operationId`, `policyHash` e causa sanitizada, antes de propagar o erro.
- `preflight` (run/resume) e `openReviewSnapshot` (review) detectam o marcador e lançam
  `SANDBOX_POISONED` antes de adquirir lock ou spawnar agente.
- Nenhum caminho do adapter remove o marcador.

## Tarefas

1. Em `scripts/workflow/lib/local-adapter.cjs`, ao capturar `SANDBOX_CLEANUP_FAILED` em `invoke` e
   `reviewerCall`, persistir o marcador atômico em `.workflow-runtime/sandbox-poison.json` com causa
   sanitizada; a falha de escrita acompanha o erro original sem substituí-lo.
2. Em `preflight` e `openReviewSnapshot`, verificar a presença do marcador (legível ou não) e lançar
   `SANDBOX_POISONED` com o path do marcador e a referência do runbook, antes de lock ou spawn.
3. Expandir `scripts/workflow/test-adapter.cjs` com a persistência do marcador, o bloqueio em run,
   resume e review, e a prova de que nenhum caminho o remove.
4. Documentar em `docs/workflows/automated-spec-pipeline-runbook.md` a verificação do host e o
   procedimento manual de remoção.

## Paths afetados (limite absoluto)

- `scripts/workflow/lib/local-adapter.cjs`
- `scripts/workflow/test-adapter.cjs`
- `docs/workflows/automated-spec-pipeline-runbook.md`

## Fora de Escopo

- `sandbox.cjs`, provas adversariais macOS (Passo 2), flags de CLI, mudança de state schema e gates.

## Critério de Pronto

- Testes provam persistência do marcador no cleanup falho e bloqueio `SANDBOX_POISONED` em run,
  resume e review; o runbook descreve a liberação manual.

## Dependências

- Nenhuma.

## Checklist pré-handoff

- [ ] Três arquivos afetados?
- [ ] `sandbox.cjs` permanece sem conhecer runtime paths?
- [ ] Falha de escrita do marcador nunca substitui o `SANDBOX_CLEANUP_FAILED`?
- [ ] Nenhum caminho remove o marcador automaticamente?

## Prompt de handoff

```text
Implemente APENAS o Passo 1.
Files: @scripts/workflow/lib/local-adapter.cjs @scripts/workflow/test-adapter.cjs @docs/workflows/automated-spec-pipeline-runbook.md
Out of scope: sandbox.cjs, provas adversariais macOS, flags de CLI, state schema e gates.
Done criteria: cleanup falho persiste o marcador; run, resume e review bloqueiam com SANDBOX_POISONED antes de spawn; runbook documenta a remoção manual.
Siga as convenções do repositório.
---
@specs/steps/sandbox-hardening-step-1.md
@specs/sandbox-hardening.md
```
