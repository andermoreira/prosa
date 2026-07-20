---
schemaVersion: 1.0.0
id: spec-gate-sandboxing
title: Sandbox de gates de execução de worktree
status: approved
source:
  path: specs/gate-sandboxing.md
  hash: 6b4e449b19a67e336958ad278309b6a86b463ab39c22324995e68183f181d250
  baseSha: 73d0bbd224043b4f4ff8b33f58d4bf3525b0906c
approval:
  approvedBy: user
  approvedAt: 2026-07-19
  baseSha: 73d0bbd224043b4f4ff8b33f58d4bf3525b0906c
goal: Fechar o bypass do sandbox de agente executando os gates de worktree sob uma policy assimétrica que corta rede e escrita externa sem herdar a fragilidade do deny-read agressivo.
nonGoals:
  - Sandboxear gates MCP, que acessam servidores externos por design e mantêm seus controles atuais.
  - Aplicar deny-read agressivo aos gates ou ocultar segredos do processo do gate.
  - Elevar o threat model além de single-user nem cobrir CI ou máquina compartilhada.
  - Reordenar gate e review, mudar acceptance, budgets, severidades ou o limite de cinco arquivos.
  - Permitir fallback ou execução direta de gate fora do sandbox.
acceptanceCriteria:
  - id: AC-01
    description: A policy de gate normalizada permite leitura ampla, nega escrita fora do worktree, nega rede e nega Unix sockets.
  - id: AC-02
    description: A policy de gate vem do catálogo do baseSha e é validada semanticamente; rede não vazia ou escrita externa declarada bloqueia.
  - id: AC-03
    description: Gates executáveis não-MCP executam pela porta sandboxada; nenhum caminho roda gate de worktree por runProcess direto.
  - id: AC-04
    description: Gates MCP permanecem fora do sandbox de gate e mantêm o roteamento atual.
  - id: AC-05
    description: Falha de runtime, backend, init ou cleanup do gate bloqueia com código estável e zero fallback.
  - id: AC-06
    description: Teste real macOS prova que um gate sem rede não exfiltra e não escreve fora do worktree, mas ainda roda os testes do worktree.
  - id: AC-07
    description: Documentação durável registra a policy de gate assimétrica, o gatilho de reabertura e a fronteira com gates MCP.
implementationNotes:
  - id: NOTE-01
    content: A leitura ampla é deliberada e mantém a lista de supressão de violações pequena; a fronteira do gate é contenção de saída (rede e escrita externa), não sigilo de entrada, e vale somente sob o threat model single-user.
    approvedBy: user
    approvedAt: 2026-07-19
    baseSha: 73d0bbd224043b4f4ff8b33f58d4bf3525b0906c
  - id: NOTE-02
    content: O primeiro step é prefactoring explícito — introduz e valida o contrato da policy de gate sem rotear execução; o roteamento e a prova adversarial ficam no segundo step.
    approvedBy: user
    approvedAt: 2026-07-19
    baseSha: 73d0bbd224043b4f4ff8b33f58d4bf3525b0906c
documentationImpact:
  kind: paths
  paths:
    - docs/workflows/automated-spec-pipeline.md
budgets:
  maxAttemptsPerStep: 3
  maxAttemptsTotal: 6
  maxAgentCallsPerStep: 6
  maxAgentCallsTotal: 12
  maxReviewCyclesPerStep: 2
  maxReviewCyclesTotal: 4
  maxDiagnosisCyclesPerStep: 2
  maxDiagnosisCyclesTotal: 4
  maxElapsedMinutesPerStep: 120
  maxElapsedMinutesTotal: 240
  maxEstimatedCostPerStep: null
  maxEstimatedCostTotal: null
  maxTokensPerStep: null
  maxTokensTotal: null
execution:
  adapter: opencode
  autoCommit: false
  pullRequest: false
  correctionStep: false
  notificationResourceIds: []
isolation:
  strategy: git-worktree
  operatingSystemSandbox: true
  shell: false
  reviewerReadOnly: true
  diagnosticianReadOnly: true
review:
  local: true
  final: true
  globalAcceptance: true
  freshSessions: true
  blockingSeverities: [critical, high]
globalGates: [workflow-tests]
---
# Sandbox de gates de execução de worktree

**Status:** aguardando aprovação da spec
**Data:** 2026-07-19
**ADR:** [028](../adr/028-sandbox-de-gates-de-execucao-de-worktree.md)
**Origem:** achado 1 da revisão profunda do sandbox

## Goal

Fechar o bypass do sandbox de agente executando os gates de worktree sob uma policy assimétrica que
corta rede e escrita externa sem herdar a fragilidade do deny-read agressivo.

## User stories

### Gate de worktree confinado

**Given** um step cujo gate `workflow-tests` executa código que o executor escreveu,
**When** a prosa roda esse gate,
**Then** o processo roda pela porta sandboxada com leitura ampla, escrita confinada ao worktree, rede
vazia e sockets negados, e ainda assim executa os testes normalmente.

### Exfiltração cortada

**Given** um teste hostil no worktree que tenta abrir conexão de saída ou escrever fora do worktree,
**When** o gate o executa,
**Then** a rede e a escrita externa são negadas pelo backend real, e a prova adversarial registra a
negação sem que o pipeline dependa da lista de supressão de violações.

### Gate MCP intacto

**Given** um gate `type: mcp`,
**When** a prosa o executa,
**Then** ele mantém o roteamento atual por `runMcpGate` com acesso ao servidor catalogado, fora do
sandbox de gate.

### Falha segura do gate

**Given** runtime ausente, backend indisponível, init inválida ou cleanup não comprovado no gate,
**When** o gate seria executado,
**Then** o pipeline bloqueia com código estável de trust boundary e nenhum gate roda fora do sandbox.

## Assumptions

- O código executado por um gate de worktree é não confiável na mesma medida que o output do executor.
- `verify.sh` usa `npm ci --dry-run` (offline) e os testes de workflow são unitários com mocks;
  nenhum gate de worktree precisa de rede real. Um teste que exija rede real é tratado como smell,
  não como motivo para afrouxar a policy.
- `node_modules` fica na raiz do repo, acima do worktree; a leitura ampla da policy de gate o cobre.
- O threat model permanece single-user (NOTE-03 da spec risk-hitl); a leitura ampla é aceitável
  somente sob essa premissa.
- A engine e a versão do SRT do ADR 021 são reutilizadas; nenhuma dependência nova.

## Risks

| Risco | Mitigação |
|---|---|
| Policy de gate ampla demais reabrir escrita externa | Validação semântica do catálogo exige rede vazia e escrita confinada ao worktree; falha fechado. |
| Overhead do sandbox por gate degradar a operação | Reuso da engine já medida; leitura ampla reduz probes e custo de startup relativo ao agente. |
| Leitura ampla mascarar exfiltração via diff | Conteúdo escrito entra no worktree e no diff revisado pelo humano com `autoCommit: false`. |
| Teste adversarial frágil a updates de macOS | Probe usa fixtures próprios e não depende da lista de supressão. |
| Gate que legitimamente precise de rede quebrar | Rede real em gate de worktree é smell; MCP cobre acesso externo intencional por outro caminho. |

## Data model

A policy de gate reutiliza o contrato normalizado do ADR 021 com um perfil próprio:

```json
{
  "policyVersion": "2",
  "role": "gate",
  "filesystem": {
    "readPaths": ["<worktree>", "<node_modules-ancestral>", "<toolchain>"],
    "writePaths": ["<worktree>"],
    "denyWrite": ["<fora-do-worktree>"]
  },
  "network": { "mode": "allowlist", "allowedDomains": [] },
  "unixSockets": []
}
```

Invariantes: `allowedDomains` vazio; escrita confinada ao worktree; sem deny-read agressivo de
arquivos sensíveis (a contenção é de saída, não de leitura); `policyHash` determinístico como no
ADR 021. A policy é catalogada por resource de gate (`node-runtime`, `bash-runtime`), não pelo step.

## Error handling

| Código | Condição | Resultado |
|---|---|---|
| `SANDBOX_POLICY_INVALID` | Policy de gate com rede não vazia, escrita externa ou role inválido | Bloqueia antes do gate. |
| `SANDBOX_RUNTIME_UNAVAILABLE` / `SANDBOX_INITIALIZATION_FAILED` / `SANDBOX_DEGRADED` / `SANDBOX_CLEANUP_FAILED` | Reutilizados do ADR 021 para o gate | Bloqueia; zero fallback. |
| `SANDBOX_VIOLATION` | Gate tenta rede ou escrita externa | Falha o gate com regra sanitizada. |

## Observability

- Cada execução de gate registra `policyHash`, role `gate`, engine/backend/plataforma e duração,
  correlacionados ao artifact do gate.
- Violações do gate aparecem sanitizadas, no mesmo formato do ADR 021.
- Nenhuma telemetria nova é criada; os sinais alimentam a observabilidade prevista na etapa 5.

## Threat model

| Ameaça | Controle |
|---|---|
| Teste hostil exfiltra credencial via rede | `allowedDomains` vazio nega toda saída. |
| Teste hostil planta artefato fora do worktree | Escrita confinada ao worktree; fora dele é negado. |
| Teste hostil grava segredo no worktree para vazar via diff | Diff revisado pelo humano com `autoCommit: false` e limite de cinco arquivos. |
| Gate abre Docker ou IPC local | `unixSockets: []` e sem modos fracos. |
| Worktree define a policy do gate | Origem exclusiva no catálogo do baseSha. |
| Processo local do mesmo usuário | Residual aceito no escopo single-user; gatilho de reabertura documentado. |

## Edge cases

- Gate `type: mcp` no mesmo run: roteado por `runMcpGate`, sem sandbox de gate.
- Gate global (final) sobre o worktree integrado: mesma policy de gate.
- `node_modules` ausente ou divergente: o gate falha por dependência, não por sandbox.
- Teste que tenta rede real: negado; tratado como smell a corrigir, não como policy a afrouxar.
- Escrita em `.workflow-sandbox` do worktree: permitida como área de scratch, como no ADR 021.
- Runtime do SRT ausente no host: bloqueia todos os gates de worktree, sem fallback.

## Rollout / Rollback

Duas fases internas: primeiro o contrato e a validação da policy de gate (prefactoring, sem
roteamento); depois o roteamento de `runGate` e a prova adversarial. Não há rollback para execução de
gate sem sandbox; reverter é interromper runs novos e reverter o código. Runs com a policy de gate
persistida não são retomados por versão anterior.

## Acceptance criteria

- **AC-01:** A policy de gate normalizada permite leitura ampla, nega escrita fora do worktree, nega
  rede e nega Unix sockets, com `policyHash` determinístico.
- **AC-02:** A policy de gate é carregada e hasheada do catálogo do baseSha; rede não vazia ou escrita
  externa declarada falha a validação semântica.
- **AC-03:** Todo gate executável não-MCP executa pela porta sandboxada; nenhum caminho roda gate de
  worktree por `runProcess` direto.
- **AC-04:** Gates `type: mcp` permanecem fora do sandbox de gate e mantêm o roteamento por `runMcpGate`.
- **AC-05:** Runtime ausente, backend, init ou cleanup falho do gate bloqueiam com código estável e
  zero fallback.
- **AC-06:** Um teste real macOS prova que um gate sem rede não abre conexão de saída e não escreve
  fora do worktree, e ainda assim executa os testes do worktree com sucesso.
- **AC-07:** A documentação durável registra a policy assimétrica, o gatilho de reabertura para CI ou
  máquina compartilhada e a fronteira com gates MCP.

## Open questions

- **Toolchain mínimo de leitura:** confirmar no macOS suportado o conjunto exato de paths de leitura
  que `node --test` e `verify.sh` exigem, mantendo a leitura ampla porém catalogada. Responsável:
  implementador do step 2.
- **Escrita fora do worktree por ferramentas legítimas:** verificar se alguma etapa do `verify.sh`
  escreve fora do worktree; se sim, catalogar o destino mínimo em vez de afrouxar a policy.

## Implementation plan

1. Introduzir e validar o contrato da policy de gate assimétrica no sandbox e no catálogo, sem rotear execução.
2. Rotear os gates executáveis não-MCP pela porta sandboxada e provar a contenção por teste adversarial real.
