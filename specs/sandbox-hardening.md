---
schemaVersion: 1.0.0
id: spec-sandbox-hardening
title: Hardening do sandbox — poison persistido e provas adversariais
status: approved
source:
  path: specs/sandbox-hardening.md
  hash: 132fedab2a35c3eaea8b6f67f2f61e1172804b902630f529ff1c099571e8c0d2
  baseSha: a19887da2b0b63746e61eb82a36e4a2e4b8f04c3
approval:
  approvedBy: user
  approvedAt: 2026-07-19
  baseSha: a19887da2b0b63746e61eb82a36e4a2e4b8f04c3
goal: Fazer a falha de cleanup do sandbox sobreviver ao processo com bloqueio fail-closed auditável e provar por teste adversarial real que denyWrite por glob e hardlink não reabrem acesso a arquivos sensíveis.
nonGoals:
  - Sandboxear gates, MCP servers, Git, notificações ou o próprio processo do pipeline.
  - Alterar a policy normalizada, o formato do policy hash ou o contrato do SRT 0.0.66.
  - Automatizar a verificação do host após cleanup falho ou remover o marcador automaticamente.
  - Adicionar flags de CLI, mudar o state schema ou migrar runs persistidos.
  - Corrigir o backend do SRT caso o probe de hardlink revele escape; a evidência bloqueia e escala.
acceptanceCriteria:
  - id: AC-01
    description: Cleanup falho persiste marcador sanitizado em .workflow-runtime antes de propagar SANDBOX_CLEANUP_FAILED.
  - id: AC-02
    description: Run, resume e review falham fechado com SANDBOX_POISONED enquanto o marcador existir, antes de qualquer spawn de agente.
  - id: AC-03
    description: Nenhum caminho do pipeline remove o marcador; remoção é ação manual documentada no runbook.
  - id: AC-04
    description: Teste real macOS prova que criar .env, secrets/ e *.pem em área gravável permitida é negado pelo denyWrite.
  - id: AC-05
    description: Teste real macOS prova que hardlink criado em área gravável não dá leitura a arquivo fora do allowRead.
  - id: AC-06
    description: Runbook documenta a verificação do host e o procedimento de remoção do marcador.
implementationNotes:
  - id: NOTE-01
    content: O marcador vive fora do state do run porque o dano é do host; o adapter local o persiste ao capturar SANDBOX_CLEANUP_FAILED e o verifica no preflight e no openReviewSnapshot, mantendo sandbox.cjs sem conhecimento de runtime paths.
    approvedBy: user
    approvedAt: 2026-07-19
    baseSha: a19887da2b0b63746e61eb82a36e4a2e4b8f04c3
  - id: NOTE-02
    content: O probe de hardlink usa fixture descartável no mesmo filesystem, nunca credencial real; se o backend permitir a leitura, o teste falha e o achado escala para decisão upstream em vez de ser suprimido.
    approvedBy: user
    approvedAt: 2026-07-19
    baseSha: a19887da2b0b63746e61eb82a36e4a2e4b8f04c3
documentationImpact:
  kind: paths
  paths:
    - docs/workflows/automated-spec-pipeline-runbook.md
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
# Hardening do sandbox — poison persistido e provas adversariais

**Status:** aguardando aprovação da spec
**Data:** 2026-07-19
**Origem:** revisão profunda do sandbox (achados 2 e 3), sobre a base do [ADR 021](../adr/021-sandbox-de-so-para-chamadas-de-agentes.md) e da spec [prosa-os-sandboxing](prosa-os-sandboxing.md)

## User stories

### Cleanup falho bloqueia o host, não só o processo

**Given** uma chamada de agente cujo cleanup do SRT falhou (`SANDBOX_CLEANUP_FAILED`),
**When** o processo da CLI termina e o operador invoca `run`, `resume` ou `review` novamente,
**Then** o pipeline encontra o marcador persistido em `.workflow-runtime/`, falha fechado com
`SANDBOX_POISONED` antes de adquirir lock ou spawnar qualquer agente, e aponta o procedimento do
runbook.

### Operador libera o host após verificação

**Given** um marcador de poison presente e o runbook seguido (nenhum processo remanescente do SRT,
proxy encerrado, scratch removido),
**When** o operador remove manualmente o marcador e invoca `resume`,
**Then** a execução prossegue pelo fluxo normal de lock, revalidation e reconciliação, sem nenhum
caminho automático ter removido o marcador.

### Criação de arquivo sensível é negada na prática

**Given** um executor sandboxado com área gravável permitida,
**When** o processo tenta criar `.env`, `.env.local`, `secrets/` ou `x.pem` dentro dessa área,
**Then** o backend real `sandbox-exec` nega a operação e o teste adversarial registra a negação —
provando que os globs de `denyWrite` têm a semântica assumida pela policy.

### Hardlink não reabre leitura

**Given** um arquivo sensível de fixture fora do target, no mesmo filesystem,
**When** o processo sandboxado cria (ou tenta criar) um hardlink para ele dentro da área gravável e
lê pelo novo path,
**Then** a criação do link ou a leitura é negada; se ambas forem permitidas, o teste falha e o
resultado é tratado como bloqueio de rollout, não como flake.

## Assumptions

- O runner em memória (`poisoned` em `createSandboxRunner`) permanece como primeira defesa; o
  marcador persistido cobre exclusivamente a janela entre processos.
- Todos os spawns de agente passam pelo adapter local (`invoke`, `reviewerCall`); não existe caminho
  de agente fora dele, então a checagem no `preflight` e no `openReviewSnapshot` cobre run, resume e
  review.
- `.workflow-runtime/` é local, ignorado pelo Git e descartável — o marcador não precisa de schema
  versionado nem de migração; um marcador ilegível é tratado como poison (fail-closed).
- A remoção manual do marcador é a autorização do operador; não há flag de CLI nesta etapa porque a
  prova exigida (host limpo) não é automatizável pela própria CLI.
- O teste de hardlink usa `os.tmpdir()` para garantir mesmo filesystem entre alvo e área gravável;
  se o ambiente montar tmpdirs distintos, o teste cria ambos sob a mesma raiz temporária.
- A semântica de `denyWrite` com glob no SRT 0.0.66 é a premissa sob teste; nenhuma outra proteção
  nova é introduzida por esta spec.

## Risks

| Risco | Mitigação |
|---|---|
| Marcador virar bloqueio permanente por falso positivo | Conteúdo sanitizado indica causa e runbook define verificação curta; remoção é um `rm` consciente. |
| Crash entre a falha de cleanup e a escrita do marcador | Escrita atômica imediatamente ao capturar o erro, antes de propagá-lo; o runner em memória já bloqueou o processo corrente. |
| Probe de hardlink falhar por semântica do backend, não por vulnerabilidade | Asserção aceita negação em qualquer das duas operações (link ou read); só passa se o acesso ao conteúdo for impossível. |
| Teste adversarial frágil a updates de macOS | Probes usam paths de fixture próprios, não paths do sistema; nenhuma dependência da lista de supressão. |
| Marcador removido sem verificação real | Risco residual aceito do escopo single-user (NOTE-03 da spec risk-hitl); runbook torna o custo da negligência explícito. |

## Data model

Marcador `.workflow-runtime/sandbox-poison.json`, escrito atomicamente, fora do state do run:

```json
{
  "schemaVersion": "1.0.0",
  "createdAt": "2026-07-19T00:00:00.000Z",
  "runId": "run-sandbox-hardening",
  "operationId": "run-...-executor-1",
  "policyHash": "<sha256>",
  "cause": "<mensagem sanitizada>"
}
```

Invariantes: nenhum valor de credencial ou conteúdo de arquivo; `cause` passa pela sanitização
existente; presença do arquivo — legível ou não — significa poison. O `state.json` não muda.

## Error handling

| Código | Condição | Resultado |
|---|---|---|
| `SANDBOX_POISONED` | Marcador presente no preflight de run/resume ou no openReviewSnapshot | Bloqueia antes de lock e de qualquer agente; mensagem aponta o runbook. |
| `SANDBOX_CLEANUP_FAILED` | Já existente; agora também dispara a persistência do marcador | Comportamento atual preservado; erro original nunca é substituído por falha ao escrever o marcador. |

Falha ao *escrever* o marcador é reportada junto ao erro original (mesmo padrão de
`preserveSandboxViolation`), sem mascarar o `SANDBOX_CLEANUP_FAILED`.

## Observability

- O marcador registra `runId`, `operationId`, `policyHash` e causa sanitizada — correlacionáveis com
  os artifacts do attempt.
- `SANDBOX_POISONED` aparece no outcome da CLI com o path do marcador e a referência do runbook.
- Os novos testes adversariais registram as negações observadas como evidência nos seus asserts;
  nenhuma telemetria nova é criada.

## Threat model

| Ameaça | Controle |
|---|---|
| Estado global do SRT (proxy, perfil) sobrevive ao crash e afeta chamadas futuras | Marcador persistido bloqueia novos spawns até verificação humana do host. |
| Processo do mesmo usuário remove o marcador sem verificar | Residual aceito no escopo atual (autoridade = usuário local); documentado no runbook. |
| Executor cria arquivo sensível para colher segredos em runs futuros | AC-04 prova a negação de criação pelos globs de `denyWrite`. |
| Hardlink em área gravável dá alias legível a arquivo fora do allowRead | AC-05 prova a negação; sucesso do probe bloqueia rollout e escala para decisão upstream. |
| Marcador forjado para travar o pipeline (DoS local) | Mesmo ator já pode apagar `.workflow-runtime/` inteiro; sem mudança de superfície. |

## Edge cases

- Marcador presente com JSON inválido, truncado ou permissões erradas: poison mesmo assim.
- Cleanup falha nas três frentes (reset, scratch, chmod): um único marcador, causa composta.
- Poison durante `review` (modo read-only): bloqueia igualmente — o reviewer também spawna agente.
- Marcador criado por versão futura (`schemaVersion` desconhecida): poison; nunca ignorar.
- Hardlink cujo alvo está *dentro* do allowRead: fora do escopo do probe (não é escape).
- Filesystem sem suporte a hardlink no tmpdir do teste: o teste falha explicitamente pedindo
  ambiente válido, não passa em silêncio.

## Rollout / Rollback

Mudança local de robustez e teste; sem fases. Rollback é reverter o commit — o marcador
eventualmente presente continua inerte (nenhuma versão anterior o lê) e pode ser removido com o
`.workflow-runtime/` como sempre. Nenhum state persistido muda de formato.

## Open questions

- **Semântica real de link no `sandbox-exec`:** se o probe de hardlink provar escape, a mitigação
  (bloquear `file-link` via SRT, staging sem hardlinks ou novo backend) exige decisão própria e
  provavelmente novo ADR. Responsável: operador, ao rodar o step 2 no macOS suportado.
- **Flag de CLI para liberar poison:** se a remoção manual se mostrar propensa a erro na prática,
  uma flag com prova (à la `--remove-orphan-lock`) pode ser especificada depois; fora deste escopo.

## Implementation plan

1. Persistir o marcador de poison no cleanup falho e bloquear run, resume e review no preflight.
2. Adicionar provas adversariais reais de denyWrite por glob e de hardlink no macOS.
