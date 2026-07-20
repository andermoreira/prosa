---
schemaVersion: 1.0.0
id: spec-prosa-os-sandboxing-step-3
sequence: 3
specId: spec-prosa-os-sandboxing
source: {path: specs/steps/prosa-os-sandboxing-step-3.md, hash: 8e54ab57ea93e3ff11f5b3dbd8d138666b08911ce33dff511e6e3de2aca9f910, baseSha: 7fb3c4b5659e5e8a69ceb032a27a25307d4f5ced}
goal: Adicionar a dependência pinada e uma porta única que execute comando estruturado via SRT sem fallback.
boundaries:
  inScope:
    - behaviorType=vertical
    - owns=dependência SRT, porta sandboxada e testes contratuais
    - invariant=execução estruturada falha fechada sem spawn direto
    - allowedDependencies=spec-prosa-os-sandboxing-step-2
  outOfScope:
    - doesNotOwn=policies de resources, state, resume, adapters, gates, MCP e backend real
  maxLogicalFiles: 5
dependsOn: [spec-prosa-os-sandboxing-step-2]
predictedFiles: [package.json, package-lock.json, scripts/workflow/lib/sandbox.cjs, scripts/workflow/test-sandbox.cjs]
allowedAreas: [package.json, package-lock.json, scripts/workflow]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-os-sandboxing.md, stepPath: specs/steps/prosa-os-sandboxing-step-3.md, baseSha: 7fb3c4b5659e5e8a69ceb032a27a25307d4f5ced, implementationNoteIds: [NOTE-01]}
acceptanceCriteria:
  - id: AC-08
    evidence:
      - {id: EVIDENCE-04, kind: contract-test, description: "Gate workflow-tests comprova falha fechada para runtime ausente, degradado e lifecycle inválido.", gateId: workflow-tests, resultRef: spec-prosa-os-sandboxing-step-3/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-sandbox.cjs}
  - id: AC-09
    evidence:
      - {id: EVIDENCE-05, kind: static-check, description: "Gate verify-pack comprova pin exato e integridade da dependência SRT.", gateId: verify-pack, resultRef: spec-prosa-os-sandboxing-step-3/attempt-1/gate-verify-pack, testSelector: dependency-gate}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, verify-pack, revalidation]}
revalidation:
  triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, on-resume]
  driftPolicy: block
documentationImpact: {kind: none, justification: A documentação operacional e os notices serão consolidados no Step 9.}
testing: {required: true, gateIds: [workflow-tests, verify-pack], rationale: "A porta e o pin exigem testes contratuais, audit e verificação de integridade."}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 3: Criar a camada anticorrupção fail-closed

## Goal

Adicionar a dependência pinada e uma porta única que execute comando estruturado via SRT sem fallback.

## Assumptions

- `@anthropic-ai/sandbox-runtime@0.0.66` é dependência runtime, não ferramenta opcional de desenvolvimento.

## Risks

- Expor command strings ou aceitar modo degradado; manter serializer e API do fornecedor privados.

## Edge cases

- Pacote/backend ausente, init parcial, timeout, output limit, sinal, cleanup falho e argv com
  espaço, aspas, newline, `$()`, `;` ou glob.

## Acceptance Criteria

- A porta recebe executable+argv, policy normalizada e limites; somente ela serializa para o shell
  interno do SRT; qualquer falha gera código `SANDBOX_*` e nenhum spawn direto.
- Manifest e lock pinam exatamente `0.0.66` e testes contratuais cobrem argv e lifecycle.

## Tarefas

1. Adicionar `@anthropic-ai/sandbox-runtime` exatamente em `0.0.66` a `package.json` e atualizar
   `package-lock.json` com scripts ignorados e integridade preservada.
2. Criar `scripts/workflow/lib/sandbox.cjs` com policy canônica, hash determinístico, tradução SRT,
   serializer argv privado, init/exec/cleanup e erros estáveis fail-closed.
3. Criar `scripts/workflow/test-sandbox.cjs` com fake do SRT para contrato, opções proibidas,
   ausência/degradação/cleanup e round-trip de argv adversarial.

## Paths afetados (limite absoluto)

- `package.json`
- `package-lock.json`
- `scripts/workflow/lib/sandbox.cjs`
- `scripts/workflow/test-sandbox.cjs`

## Fora de Escopo

- Policies de resources, state/resume, adapters, gates, MCP e teste real do backend.

## Critério de Pronto

- Testes da camada passam, `npm ls` mostra somente 0.0.66 e não existe API de fallback ou command string pública.

## Dependências

- Passo 2.

## Checklist pré-handoff

- [ ] Quatro arquivos afetados?
- [ ] O shell está encapsulado e argv adversarial preservado?
- [ ] Init e cleanup falham fechado?

## Prompt de handoff

```text
Implemente APENAS o Passo 3.
Files: @package.json @package-lock.json @scripts/workflow/lib/sandbox.cjs @scripts/workflow/test-sandbox.cjs
Out of scope: catálogo, state/resume, adapters, gates, MCP e backend real.
Done criteria: SRT 0.0.66 pinado; porta estruturada, testada e sem fallback; shell interno privado preserva argv.
---
@specs/steps/prosa-os-sandboxing-step-3.md
@specs/prosa-os-sandboxing.md
```
