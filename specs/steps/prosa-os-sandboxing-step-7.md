---
schemaVersion: 1.0.0
id: spec-prosa-os-sandboxing-step-7
sequence: 7
specId: spec-prosa-os-sandboxing
source: {path: specs/steps/prosa-os-sandboxing-step-7.md, hash: ec44f7c43fdd03539acd8a16a344b56eba56b92004485dcb97821a57fd6dc522, baseSha: 7fb3c4b5659e5e8a69ceb032a27a25307d4f5ced}
goal: Executar Cursor executor, reviewer e diagnostician pela mesma trust boundary coercitiva do OpenCode.
boundaries:
  inScope:
    - behaviorType=vertical
    - owns=wiring Cursor sandboxado e testes dos três papéis
    - invariant=nenhuma rota produtiva Cursor usa runner direto
    - allowedDependencies=spec-prosa-os-sandboxing-step-6
  outOfScope:
    - doesNotOwn=OpenCode, gates, MCP, modelos, reviewer JSON, severidades e acceptance
  maxLogicalFiles: 5
dependsOn: [spec-prosa-os-sandboxing-step-6]
predictedFiles: [scripts/workflow/lib/cursor.cjs, scripts/workflow/lib/local-adapter.cjs, scripts/workflow/test-cursor.cjs, scripts/workflow/test-adapter.cjs]
allowedAreas: [scripts/workflow]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-os-sandboxing.md, stepPath: specs/steps/prosa-os-sandboxing-step-7.md, baseSha: 7fb3c4b5659e5e8a69ceb032a27a25307d4f5ced, implementationNoteIds: [NOTE-01]}
acceptanceCriteria:
  - id: AC-01
    evidence:
      - {id: EVIDENCE-14, kind: automated-test, description: "Gate workflow-tests comprova sandbox obrigatório nos três papéis Cursor.", gateId: workflow-tests, resultRef: spec-prosa-os-sandboxing-step-7/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-cursor.cjs}
  - id: AC-10
    evidence:
      - {id: EVIDENCE-15, kind: automated-test, description: "Gate workflow-tests comprova sanitização de credencial, violações e erros Cursor.", gateId: workflow-tests, resultRef: spec-prosa-os-sandboxing-step-7/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-adapter.cjs}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation:
  triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, on-resume]
  driftPolicy: block
documentationImpact: {kind: none, justification: O encapsulamento Cursor será documentado junto ao contrato operacional no Step 9.}
testing: {required: true, gateIds: [workflow-tests], rationale: "Os três papéis, credencial mínima, NDJSON e falhas Cursor exigem testes automatizados."}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 7: Encapsular Cursor nos três papéis

## Goal

Executar Cursor executor, reviewer e diagnostician pela mesma trust boundary coercitiva do OpenCode.

## Assumptions

- `CURSOR_API_KEY` continua vindo do ambiente mínimo catalogado; HOME real não é disponibilizado.

## Risks

- Credencial ou endpoint específico do Cursor induzir relaxamento global; exceções permanecem no resource Cursor.

## Edge cases

- Chave ausente, endpoint não catalogado, stream NDJSON parcial, snapshot read-only, diagnóstico,
  version check e erro do provider contendo token.

## Acceptance Criteria

- Nenhum spawn do executable `agent` usa runner direto; version check e execução dos três papéis
  usam policy Cursor específica e hash persistido.
- Cursor deixa de depender apenas do prompt para read-only, filesystem, rede e sockets; falhas são
  fail-closed e sanitizadas sem alterar seu contrato NDJSON.

## Tarefas

1. Atualizar `scripts/workflow/lib/cursor.cjs` para consumir somente a porta sandboxada estruturada.
2. Atualizar `scripts/workflow/lib/local-adapter.cjs` para resolver e fornecer policies Cursor nos
   fluxos executor, review local/global e diagnosis.
3. Criar `scripts/workflow/test-cursor.cjs` para contrato dos três papéis, credencial mínima,
   version check, output e falhas sandboxadas.
4. Expandir `scripts/workflow/test-adapter.cjs` com roteamento Cursor e policy hash correto.

## Paths afetados (limite absoluto)

- `scripts/workflow/lib/cursor.cjs`
- `scripts/workflow/lib/local-adapter.cjs`
- `scripts/workflow/test-cursor.cjs`
- `scripts/workflow/test-adapter.cjs`

## Fora de Escopo

- OpenCode, gates, MCP, mudar modelos, reviewer JSON, severidades ou acceptance.

## Critério de Pronto

- Testes provam sandbox obrigatório nos três papéis Cursor, sem vazamento de credencial nem fallback.

## Dependências

- Passo 5.

## Checklist pré-handoff

- [ ] Quatro arquivos afetados?
- [ ] Cursor executor/reviewer/diagnostician e version check cobertos?
- [ ] Endpoint/credencial específicos não ampliaram outras policies?

## Prompt de handoff

```text
Implemente APENAS o Passo 7.
Files: @scripts/workflow/lib/cursor.cjs @scripts/workflow/lib/local-adapter.cjs @scripts/workflow/test-cursor.cjs @scripts/workflow/test-adapter.cjs
Out of scope: OpenCode, gates, MCP, modelos, reviewer JSON, severidades e acceptance.
Done criteria: três papéis Cursor e version check usam policy persistida obrigatória; contrato NDJSON e sanitização permanecem válidos.
---
@specs/steps/prosa-os-sandboxing-step-7.md
@specs/prosa-os-sandboxing.md
```
