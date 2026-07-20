---
schemaVersion: 1.0.0
id: spec-prosa-os-sandboxing-step-6
sequence: 6
specId: spec-prosa-os-sandboxing
source: {path: specs/steps/prosa-os-sandboxing-step-6.md, hash: 00583729b39adb8d77747c3e65a88d8750460c14cdd0d285d90ade0982f1c2b2, baseSha: 7fb3c4b5659e5e8a69ceb032a27a25307d4f5ced}
goal: Executar OpenCode executor, reviewer e diagnostician exclusivamente pela porta sandboxada.
boundaries:
  inScope:
    - behaviorType=vertical
    - owns=wiring OpenCode sandboxado e testes dos três papéis
    - invariant=nenhuma rota produtiva OpenCode usa spawn direto
    - allowedDependencies=spec-prosa-os-sandboxing-step-5
  outOfScope:
    - doesNotOwn=Cursor, gates, MCP, reviewer JSON, severidades, acceptance e budgets
  maxLogicalFiles: 5
dependsOn: [spec-prosa-os-sandboxing-step-5]
predictedFiles: [scripts/workflow/lib/opencode.cjs, scripts/workflow/lib/local-adapter.cjs, scripts/workflow/test-opencode.cjs, scripts/workflow/test-adapter.cjs]
allowedAreas: [scripts/workflow]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-os-sandboxing.md, stepPath: specs/steps/prosa-os-sandboxing-step-6.md, baseSha: 7fb3c4b5659e5e8a69ceb032a27a25307d4f5ced, implementationNoteIds: [NOTE-01]}
acceptanceCriteria:
  - id: AC-01
    evidence:
      - {id: EVIDENCE-12, kind: automated-test, description: "Gate workflow-tests comprova sandbox obrigatório nos três papéis OpenCode.", gateId: workflow-tests, resultRef: spec-prosa-os-sandboxing-step-6/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-opencode.cjs}
  - id: AC-10
    evidence:
      - {id: EVIDENCE-13, kind: automated-test, description: "Gate workflow-tests comprova sanitização legível de violações e stderr OpenCode.", gateId: workflow-tests, resultRef: spec-prosa-os-sandboxing-step-6/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-adapter.cjs}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation:
  triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, on-resume]
  driftPolicy: block
documentationImpact: {kind: none, justification: O encapsulamento OpenCode será documentado junto ao contrato operacional no Step 9.}
testing: {required: true, gateIds: [workflow-tests], rationale: "Todas as rotas e papéis OpenCode precisam provar policy correta, zero fallback e sanitização."}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 6: Encapsular OpenCode nos três papéis

## Goal

Executar OpenCode executor, reviewer e diagnostician exclusivamente pela porta sandboxada.

## Assumptions

- Permissões deny-first do OpenCode permanecem defesa em profundidade, não substituto do sandbox.

## Risks

- Version check ou reviewer global contornar a porta; toda invocação do executable deve usar a mesma policy.

## Edge cases

- Version check falho, snapshot read-only, diagnóstico após falha, provider bloqueado, violação
  `credentials.files`, timeout e stderr com secret.

## Acceptance Criteria

- Nenhum spawn de `opencode` usa `runProcess` direto; version check e execução estão sob a policy do resource.
- Executor escreve somente em allowed areas; reviewer/diagnostician recebem snapshot read-only;
  violações e `SANDBOX_*` são sanitizados, legíveis e classificados como trust-boundary.

## Tarefas

1. Atualizar `scripts/workflow/lib/opencode.cjs` para depender da porta sandboxada estruturada e
   remover qualquer seam que permita execução direta produtiva.
2. Atualizar `scripts/workflow/lib/local-adapter.cjs` para fornecer policy OpenCode persistida nos
   fluxos executor, review local/global e diagnosis.
3. Expandir `scripts/workflow/test-opencode.cjs` e `scripts/workflow/test-adapter.cjs` com os três
   papéis, zero fallback, policy hash e sanitização de violações.

## Paths afetados (limite absoluto)

- `scripts/workflow/lib/opencode.cjs`
- `scripts/workflow/lib/local-adapter.cjs`
- `scripts/workflow/test-opencode.cjs`
- `scripts/workflow/test-adapter.cjs`

## Fora de Escopo

- Cursor, gates, MCP, mudanças de reviewer JSON, severidade, acceptance ou budgets.

## Critério de Pronto

- Testes provam que todas as rotas OpenCode usam a policy correta e falham antes do agente quando o sandbox falha.

## Dependências

- Passo 5.

## Checklist pré-handoff

- [ ] Quatro arquivos afetados?
- [ ] Version check, executor, reviews e diagnosis estão sandboxados?
- [ ] Contratos existentes fora do spawn permanecem iguais?

## Prompt de handoff

```text
Implemente APENAS o Passo 6.
Files: @scripts/workflow/lib/opencode.cjs @scripts/workflow/lib/local-adapter.cjs @scripts/workflow/test-opencode.cjs @scripts/workflow/test-adapter.cjs
Out of scope: Cursor, gates, MCP, reviewer JSON, severidades, acceptance e budgets.
Done criteria: todas as chamadas OpenCode e papéis usam a porta/policy persistida, sem fallback, com violações sanitizadas.
---
@specs/steps/prosa-os-sandboxing-step-6.md
@specs/prosa-os-sandboxing.md
```
