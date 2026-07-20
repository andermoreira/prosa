---
schemaVersion: 1.0.0
id: spec-gate-sandboxing-step-1
sequence: 1
specId: spec-gate-sandboxing
source: {path: specs/steps/gate-sandboxing-step-1.md, hash: 9268d20599e91ebd2af74715fa3971a70837079a29e53f164101cc9fde9d66f9, baseSha: 73d0bbd224043b4f4ff8b33f58d4bf3525b0906c}
goal: Introduzir e validar o contrato da policy de gate assimétrica no sandbox e no catálogo, sem rotear execução.
boundaries:
  inScope:
    - behaviorType=refactor
    - owns=role gate no normalizador do sandbox, policy de gate no catálogo e sua validação semântica
    - invariant=policy de gate exige rede vazia e escrita confinada ao worktree, sem deny-read agressivo
    - allowedDependencies=[]
  outOfScope:
    - doesNotOwn=roteamento de runGate, prova adversarial macOS, gates MCP e documentação durável
  maxLogicalFiles: 5
dependsOn: []
predictedFiles: [scripts/workflow/lib/sandbox.cjs, scripts/workflow/lib/catalogs.cjs, workflow/resources.yaml, scripts/workflow/test-sandbox.cjs, scripts/workflow/test-catalogs.cjs]
allowedAreas: [scripts/workflow, workflow]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/gate-sandboxing.md, stepPath: specs/steps/gate-sandboxing-step-1.md, baseSha: 73d0bbd224043b4f4ff8b33f58d4bf3525b0906c, implementationNoteIds: [NOTE-01, NOTE-02]}
acceptanceCriteria:
  - id: AC-01
    evidence:
      - {id: EVIDENCE-01, kind: automated-test, description: "Gate workflow-tests comprova que a policy de gate permite leitura ampla, nega escrita externa, rede e sockets.", gateId: workflow-tests, resultRef: spec-gate-sandboxing-step-1/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-sandbox.cjs}
  - id: AC-02
    evidence:
      - {id: EVIDENCE-02, kind: automated-test, description: "Gate workflow-tests comprova que a validação de catálogo bloqueia policy de gate com rede não vazia ou escrita externa.", gateId: workflow-tests, resultRef: spec-gate-sandboxing-step-1/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-catalogs.cjs}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation:
  triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, on-resume]
  driftPolicy: block
documentationImpact: {kind: none, justification: Prefactoring de contrato; a documentação durável da policy de gate é atualizada no Step 2 junto ao roteamento.}
testing: {required: true, gateIds: [workflow-tests], rationale: "Normalização da policy de gate e validação semântica do catálogo precisam de prova automatizada antes do roteamento."}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 1: Contrato e validação da policy de gate

## Goal

Introduzir e validar o contrato da policy de gate assimétrica no sandbox e no catálogo, sem rotear
execução.

## Assumptions

- Este step é prefactoring explícito (NOTE-02): não entrega roteamento de gate, mas é pré-requisito
  do Step 2, que passa a executar os gates pela porta.
- A leitura ampla é deliberada e mantém a lista de supressão pequena (NOTE-01); a fronteira do gate é
  contenção de saída, não sigilo de entrada.

## Risks

- Reaproveitar `normalizeSandboxPolicy` sem separar o role `gate` reintroduzir deny-read agressivo; o
  role `gate` deve pular `sensitivePaths`/`sensitiveWritePatterns` e manter apenas a contenção de escrita.

## Edge cases

- Policy de gate com `allowedDomains` não vazio: `SANDBOX_POLICY_INVALID`.
- Policy de gate declarando escrita fora do worktree: `SANDBOX_POLICY_INVALID`.
- Resource de gate sem bloco de sandbox de gate no catálogo: bloqueia na validação.
- `node_modules` ancestral fora do target: entra em `readPaths`, nunca em `writePaths`.

## Acceptance Criteria

- `normalizeSandboxPolicy` aceita o role `gate` com leitura ampla, escrita confinada ao worktree,
  `allowedDomains` vazio e sockets negados, sem aplicar deny-read agressivo, com `policyHash` determinístico.
- A validação de catálogo em `catalogs.cjs` exige rede vazia e escrita confinada para a policy de
  gate e bloqueia o contrário.

## Tarefas

1. Em `scripts/workflow/lib/sandbox.cjs`, adicionar o role `gate` ao normalizador: leitura ampla
   (worktree, `node_modules` ancestral, toolchain), escrita confinada ao worktree, `allowedDomains`
   vazio, sockets negados, sem `sensitivePaths`/`sensitiveWritePatterns`.
2. Em `scripts/workflow/lib/catalogs.cjs`, validar a policy de gate declarada por resource: rede
   vazia obrigatória, escrita confinada, opções fracas proibidas.
3. Em `workflow/resources.yaml`, declarar a sandbox de gate para `node-runtime` e `bash-runtime`.
4. Cobrir a normalização em `scripts/workflow/test-sandbox.cjs` e a validação em
   `scripts/workflow/test-catalogs.cjs`.

## Paths afetados (limite absoluto)

- `scripts/workflow/lib/sandbox.cjs`
- `scripts/workflow/lib/catalogs.cjs`
- `workflow/resources.yaml`
- `scripts/workflow/test-sandbox.cjs`
- `scripts/workflow/test-catalogs.cjs`

## Fora de Escopo

- Roteamento de `runGate`, prova adversarial macOS, gates MCP e documentação durável (Step 2).

## Critério de Pronto

- Testes provam a normalização da policy de gate e a validação de catálogo; nenhum roteamento muda.

## Dependências

- Nenhuma.

## Checklist pré-handoff

- [ ] Cinco arquivos afetados?
- [ ] Role `gate` não aplica deny-read agressivo?
- [ ] Rede vazia e escrita confinada são obrigatórias na validação?
- [ ] `runGate` permanece inalterado neste step?

## Prompt de handoff

```text
Implemente APENAS o Passo 1.
Files: @scripts/workflow/lib/sandbox.cjs @scripts/workflow/lib/catalogs.cjs @workflow/resources.yaml @scripts/workflow/test-sandbox.cjs @scripts/workflow/test-catalogs.cjs
Out of scope: roteamento de runGate, prova adversarial macOS, gates MCP e documentação durável.
Done criteria: role gate normaliza com leitura ampla, escrita confinada, rede/sockets negados e sem deny-read agressivo; catálogo valida rede vazia e escrita confinada; nada de roteamento muda.
Siga as convenções do repositório.
---
@specs/steps/gate-sandboxing-step-1.md
@specs/gate-sandboxing.md
```
