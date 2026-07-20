---
schemaVersion: 1.0.0
id: spec-prosa-os-sandboxing-step-8
sequence: 8
specId: spec-prosa-os-sandboxing
source: {path: specs/steps/prosa-os-sandboxing-step-8.md, hash: f70a4309e8c51bc5f1d0b3e38413eaf5eed202291345c5e59a1654549f4e9c01, baseSha: 7fb3c4b5659e5e8a69ceb032a27a25307d4f5ced}
goal: Provar no backend macOS real os controles do sandbox e executar regressão/audit sem criar gates novos.
boundaries:
  inScope:
    - behaviorType=vertical
    - owns=teste macOS real, E2E, verify e atualização do relatório de medição
    - invariant=regressão usa gates existentes e não cria modo produtivo sem sandbox
    - allowedDependencies=spec-prosa-os-sandboxing-step-7
  outOfScope:
    - doesNotOwn=novos gates, workflow/gates.yaml, sandbox de gates, MCP, notificadores e Linux
  maxLogicalFiles: 5
dependsOn: [spec-prosa-os-sandboxing-step-7]
predictedFiles: [scripts/workflow/test-sandbox-runtime-macos.cjs, scripts/workflow/test-e2e.cjs, scripts/verify.sh, docs/audits/prosa-os-sandboxing-macos-prototype-2026-07-18.md]
allowedAreas: [scripts/workflow, scripts/verify.sh, docs/audits]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-os-sandboxing.md, stepPath: specs/steps/prosa-os-sandboxing-step-8.md, baseSha: 7fb3c4b5659e5e8a69ceb032a27a25307d4f5ced, implementationNoteIds: [NOTE-01]}
acceptanceCriteria:
  - id: AC-11
    evidence:
      - {id: EVIDENCE-16, kind: automated-test, description: "Gate workflow-tests executa os vetores adversariais no backend macOS real quando disponível.", gateId: workflow-tests, resultRef: spec-prosa-os-sandboxing-step-8/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-sandbox-runtime-macos.cjs}
  - id: AC-12
    evidence:
      - {id: EVIDENCE-17, kind: artifact, description: "O relatório registra 15 amostras comparáveis, baseline e overhead da repetição.", resultRef: docs/audits/prosa-os-sandboxing-macos-prototype-2026-07-18.md}
  - id: AC-14
    evidence:
      - {id: EVIDENCE-18, kind: automated-test, description: "Gate verify-pack comprova regressão dos contratos anteriores fora do encapsulamento.", gateId: verify-pack, resultRef: spec-prosa-os-sandboxing-step-8/attempt-1/gate-verify-pack, testSelector: scripts/verify.sh}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, verify-pack, revalidation]}
revalidation:
  triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, on-resume, before-final-review, before-global-acceptance]
  driftPolicy: block
documentationImpact:
  kind: paths
  paths: [docs/audits/prosa-os-sandboxing-macos-prototype-2026-07-18.md]
testing: {required: true, gateIds: [workflow-tests, verify-pack], rationale: "Isolamento real, E2E, audit, lock integrity e regressão exigem a suíte workflow e verify-pack."}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 8: Validar isolamento real e regressões

## Goal

Provar no backend macOS real os controles do sandbox e executar regressão/audit sem criar gates novos.

## Assumptions

- Em plataforma não macOS, o teste real reporta skip explícito; isso não declara o backend suportado.

## Risks

- Teste flakey por rede/host ou benchmark mascarar regressão funcional; usar fixtures locais e reportar amostras raw.

## Edge cases

- `.env` dentro do target, reviewer write, allowlist vazia, Unix socket `listen`, argv adversarial,
  runtime ausente/degradado, cleanup falho e execução de suíte sem rede.

## Acceptance Criteria

- Teste macOS real reproduz `EPERM` para `.env` via `credentials.files` deny, write do reviewer e
  Unix socket `listen`; rede vazia bloqueia; argv com espaços/metacaracteres é preservado.
- Harness de 15 amostras reproduz e atualiza baseline raw 51,97 ms, sandbox 247,14 ms e overhead
  195,17 ms/375,6%, ou registra nova medição comparável sem apagar o baseline do protótipo.
- `npm audit --audit-level=high`, lock integrity, workflow tests e verify passam; gates/MCP não são sandboxados.

## Tarefas

1. Criar `scripts/workflow/test-sandbox-runtime-macos.cjs` com fixtures reais e modo benchmark de 15 amostras.
2. Expandir `scripts/workflow/test-e2e.cjs` para OpenCode/Cursor fake, três papéis, fail-closed,
   policy-step-attempt e resume drift sem serviços externos.
3. Atualizar `scripts/verify.sh` somente se necessário para pré-requisito/audit/execução da suíte
   existente; não adicionar gate ou caminho sem sandbox.
4. Atualizar `docs/audits/prosa-os-sandboxing-macos-prototype-2026-07-18.md` com resultado da
   repetição, audit e diferenças do ambiente.

## Paths afetados (limite absoluto)

- `scripts/workflow/test-sandbox-runtime-macos.cjs`
- `scripts/workflow/test-e2e.cjs`
- `scripts/verify.sh`
- `docs/audits/prosa-os-sandboxing-macos-prototype-2026-07-18.md`

## Fora de Escopo

- Criar gates, alterar `workflow/gates.yaml`, sandboxar MCP, gates ou notificadores, suportar Linux.

## Critério de Pronto

- Bateria real, E2E, audit e verify passam; resultados e skips são reproduzíveis e nenhum contrato anterior regrediu.

## Dependências

- Passos 6 e 7.

## Checklist pré-handoff

- [ ] Quatro arquivos afetados?
- [ ] Todos os cinco vetores macOS e 15 amostras cobertos?
- [ ] Nenhum gate/MCP entrou no escopo?

## Prompt de handoff

```text
Implemente APENAS o Passo 8.
Files: @scripts/workflow/test-sandbox-runtime-macos.cjs @scripts/workflow/test-e2e.cjs @scripts/verify.sh @docs/audits/prosa-os-sandboxing-macos-prototype-2026-07-18.md
Out of scope: novos gates, workflow/gates.yaml, sandbox de gates/MCP/notificadores e Linux.
Done criteria: testes reais macOS, E2E, audit e verify passam; cinco vetores e benchmark de 15 amostras ficam registrados.
---
@specs/steps/prosa-os-sandboxing-step-8.md
@specs/prosa-os-sandboxing.md
```
