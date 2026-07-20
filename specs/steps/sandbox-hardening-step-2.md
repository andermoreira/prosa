---
schemaVersion: 1.0.0
id: spec-sandbox-hardening-step-2
sequence: 2
specId: spec-sandbox-hardening
source: {path: specs/steps/sandbox-hardening-step-2.md, hash: f6b25c0d1e88b9b28f07edaa170b09da90f85971d2d460a61a44b5c6141ecad3, baseSha: a19887da2b0b63746e61eb82a36e4a2e4b8f04c3}
goal: Provar por teste adversarial real no macOS que denyWrite por glob e hardlink não reabrem acesso a arquivos sensíveis.
boundaries:
  inScope:
    - behaviorType=test
    - owns=provas adversariais macOS de criação de arquivo sensível e de hardlink escape
    - invariant=probe que revela acesso indevido falha o teste em vez de suprimir
    - allowedDependencies=spec-sandbox-hardening-step-1
  outOfScope:
    - doesNotOwn=marcador de poison, local-adapter, sandbox.cjs, policy e correção de backend
  maxLogicalFiles: 5
dependsOn: [spec-sandbox-hardening-step-1]
predictedFiles: [scripts/workflow/test-sandbox-runtime-macos.cjs]
allowedAreas: [scripts/workflow]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/sandbox-hardening.md, stepPath: specs/steps/sandbox-hardening-step-2.md, baseSha: a19887da2b0b63746e61eb82a36e4a2e4b8f04c3, implementationNoteIds: [NOTE-02]}
acceptanceCriteria:
  - id: AC-04
    evidence:
      - {id: EVIDENCE-05, kind: automated-test, description: "Gate workflow-tests comprova que criar .env, secrets/ e *.pem em área gravável é negado pelo backend real.", gateId: workflow-tests, resultRef: spec-sandbox-hardening-step-2/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-sandbox-runtime-macos.cjs}
  - id: AC-05
    evidence:
      - {id: EVIDENCE-06, kind: automated-test, description: "Gate workflow-tests comprova que hardlink em área gravável não dá leitura a arquivo fora do allowRead.", gateId: workflow-tests, resultRef: spec-sandbox-hardening-step-2/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-sandbox-runtime-macos.cjs}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation:
  triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, on-resume]
  driftPolicy: block
documentationImpact: {kind: none, justification: Prova adversarial coberta pela documentação de sandbox já existente; nenhuma doc durável muda neste step.}
testing: {required: true, gateIds: [workflow-tests], rationale: "Os dois probes adversariais precisam rodar sob o backend real sandbox-exec e falhar caso o acesso seja possível."}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 2: Provas adversariais de denyWrite e hardlink

## Goal

Provar por teste adversarial real no macOS que denyWrite por glob e hardlink não reabrem acesso a
arquivos sensíveis.

## Assumptions

- Os probes usam fixtures descartáveis, nunca credenciais reais (NOTE-02).
- O teste roda sob o backend real `sandbox-exec` (já usado por `test-sandbox-runtime-macos.cjs`),
  com `skip: !MACOS` no mesmo padrão dos testes existentes.
- O alvo do hardlink fica no mesmo filesystem que a área gravável; o teste garante isso criando
  ambos sob a mesma raiz temporária.

## Risks

- Probe frágil a updates de macOS: mitigado por usar apenas paths de fixture próprios, sem depender
  da lista de supressão de violações.

## Edge cases

- Criação negada em qualquer das duas operações do hardlink (link ou read) satisfaz a prova.
- Filesystem sem suporte a hardlink no tmpdir: o teste falha explicitamente pedindo ambiente válido,
  nunca passa em silêncio.
- Hardlink cujo alvo está dentro do allowRead: fora do escopo (não é escape) e não é exercido.

## Acceptance Criteria

- Um teste real prova que criar `.env`, `.env.local`, `secrets/` e `x.pem` em área gravável
  permitida é negado pelo `denyWrite`.
- Um teste real prova que um hardlink criado em área gravável não concede leitura de um arquivo de
  fixture fora do `allowRead`; se ambas as operações forem permitidas, o teste falha.

## Tarefas

1. Adicionar em `scripts/workflow/test-sandbox-runtime-macos.cjs` um teste que executa o processo
   sandboxado tentando criar `.env`, `secrets/` e `x.pem` na área gravável e afirma a negação pelo
   backend real.
2. Adicionar um teste que cria uma fixture sensível fora do target, no mesmo filesystem, tenta um
   hardlink dentro da área gravável e afirma que a leitura pelo novo path é impossível; sucesso do
   acesso falha o teste como bloqueio de rollout.

## Paths afetados (limite absoluto)

- `scripts/workflow/test-sandbox-runtime-macos.cjs`

## Fora de Escopo

- Marcador de poison (Passo 1), `local-adapter.cjs`, `sandbox.cjs`, mudança de policy e correção do
  backend caso o probe revele escape.

## Critério de Pronto

- Os dois testes rodam sob o backend real no macOS e provam a negação; comportamento de escape, se
  houver, falha o teste em vez de ser suprimido.

## Dependências

- Passo 1.

## Checklist pré-handoff

- [ ] Um arquivo afetado?
- [ ] Probes usam fixtures descartáveis, nunca credencial real?
- [ ] Escape possível falha o teste em vez de suprimir?
- [ ] `skip: !MACOS` segue o padrão dos testes existentes?

## Prompt de handoff

```text
Implemente APENAS o Passo 2.
Files: @scripts/workflow/test-sandbox-runtime-macos.cjs
Out of scope: marcador de poison, local-adapter.cjs, sandbox.cjs, policy e correção de backend.
Done criteria: testes reais macOS provam denyWrite por glob (criação de .env/secrets/pem negada) e hardlink sem leitura fora do allowRead; escape falha o teste.
Siga as convenções do repositório.
---
@specs/steps/sandbox-hardening-step-2.md
@specs/sandbox-hardening.md
```
