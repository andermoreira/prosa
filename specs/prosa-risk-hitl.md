---
schemaVersion: 1.0.0
id: spec-prosa-risk-hitl
title: Política de human-in-the-loop por risco na prosa
status: approved
source:
  path: specs/prosa-risk-hitl.md
  hash: 9ab299bdb4613fc91073a2e5aa45a8d8b8789356ee91221e26cc60e9ebf4dd3c
  baseSha: f24be0c353e28b370018b65ea3163908fa72e2cb
approval:
  approvedBy: user
  approvedAt: 2026-07-19
  baseSha: f24be0c353e28b370018b65ea3163908fa72e2cb
goal: Controlar a autonomia de cada step da prosa por uma política de risco versionada, com pausas recuperáveis, decisões humanas auditáveis e um contrato genérico para sinais que só podem elevar o risco.
nonGoals:
  - Implementar drift spec-código, vetting de dependências ou observabilidade geral do pipeline.
  - Substituir severidade, acceptance, gates, sandbox ou autorização Git por decisão humana.
  - Criar plataforma externa de aprovação, RBAC, múltiplos aprovadores ou identidade criptográfica.
  - Permitir redução automática de risco, override narrativo ou correção automática.
acceptanceCriteria:
  - {id: AC-01, description: "Step v2 exige changeType; step v1 aceito recebe restricted e sinal legado auditável."}
  - {id: AC-02, description: "Risk policy legível vem do baseSha aprovado e não possui fallback permissivo."}
  - {id: AC-03, description: "Autonomous não adiciona pausa de risco nem altera autorização Git."}
  - {id: AC-04, description: "Approval required pausa antes do primeiro efeito e apresenta contexto sanitizado."}
  - {id: AC-05, description: "Restricted exige aprovação prévia e reaprovação do diff pós-review."}
  - {id: AC-06, description: "Finding high escala automaticamente um step originalmente autônomo."}
  - {id: AC-07, description: "Segunda tentativa eleva risco e o maior nível observado não diminui."}
  - {id: AC-08, description: "Produtor fictício usa o envelope sem alterar pausa ou state machine."}
  - {id: AC-09, description: "Requests e decisões possuem timestamps, bindings e consumo auditável."}
  - {id: AC-10, description: "Resume registra decisão de arquivo ou stdin atomicamente após revalidation."}
  - {id: AC-11, description: "Decisão stale ou aplicada a outro checkpoint falha fechado."}
  - {id: AC-12, description: "Rejeição exige retry, replan ou abort sem correction automática."}
  - {id: AC-13, description: "Contexto contém resumo e diff completo sem logs brutos ou dados sensíveis."}
  - {id: AC-14, description: "Autorizações de risco, commit e PR permanecem independentes."}
  - {id: AC-15, description: "Crash e resume não repetem agente, review, decisão ou efeito Git."}
  - {id: AC-16, description: "Policy drift, sinal inválido e adulteração detectada bloqueiam com diagnóstico."}
  - {id: AC-17, description: "Teste manual demonstra escalonamento por finding high e retomada válida."}
  - {id: AC-18, description: "Documentação explica schemas v1/v2, níveis, policy, sinais, decisões e troubleshooting."}
implementationNotes:
  - id: NOTE-01
    content: Restricted usa aprovação reforçada antes da execução e após o review local do step, vinculada ao diff exato.
    approvedBy: user
    approvedAt: 2026-07-19
    baseSha: f24be0c353e28b370018b65ea3163908fa72e2cb
  - id: NOTE-02
    content: Resume permanece não interativo e recebe decision file; autorização de risco nunca autoriza commit ou PR.
    approvedBy: user
    approvedAt: 2026-07-19
    baseSha: f24be0c353e28b370018b65ea3163908fa72e2cb
  - id: NOTE-03
    content: O usuário local é a autoridade nesta etapa; identidade forte e defesa contra processo malicioso do mesmo usuário permanecem fora de escopo.
    approvedBy: user
    approvedAt: 2026-07-19
    baseSha: f24be0c353e28b370018b65ea3163908fa72e2cb
documentationImpact:
  kind: paths
  paths:
    - docs/workflows/automated-spec-pipeline.md
    - docs/workflows/automated-spec-pipeline-runbook.md
    - docs/workflows/prosa-development.md
    - .cursor/commands/resume-spec.md
budgets:
  maxAttemptsPerStep: 3
  maxAttemptsTotal: 42
  maxAgentCallsPerStep: 6
  maxAgentCallsTotal: 84
  maxReviewCyclesPerStep: 2
  maxReviewCyclesTotal: 28
  maxDiagnosisCyclesPerStep: 2
  maxDiagnosisCyclesTotal: 28
  maxElapsedMinutesPerStep: 120
  maxElapsedMinutesTotal: 1680
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
globalGates: [workflow-tests, commands-opencode-check, commands-claude-check, specs-lint, verify-pack]
---
# Política de human-in-the-loop por risco na prosa

**Status:** aprovada para implementação
**Data:** 2026-07-19
**Roadmap:** etapa 2 de 5

## Goal

Controlar a autonomia de cada step da prosa por uma política de risco versionada, com pausas
recuperáveis, decisões humanas auditáveis e um contrato genérico para sinais que só podem elevar o
risco.

## Non-goals

- Implementar drift spec-código, vetting de dependências ou a observabilidade geral das etapas 3,
  4 e 5 do roadmap.
- Substituir severidade, acceptance, gates, sandbox ou autorização Git por decisão humana.
- Criar serviço externo, ticketing, RBAC, múltiplos aprovadores ou identidade criptográfica do
  operador local.
- Permitir redução automática de risco, override narrativo, correção automática ou retry sem
  decisão explícita.
- Alterar o limite absoluto de cinco arquivos lógicos por step.
- Sandboxed gates, MCP servers, Git, notificações ou o próprio processo do pipeline nesta etapa.

## User stories

### Step autônomo

**Given** um step schema v2 com `changeType` mapeado para `autonomous`, policy válida e nenhum sinal de
escalonamento,
**When** a prosa classifica o DAG antes da execução,
**Then** o nível base e efetivo aparecem no `state.json` e o step não recebe pausa adicional por
risco, sem alterar as autorizações independentes de commit e PR.

### Aprovação antes da execução

**Given** um step classificado como `approval_required`,
**When** ele se torna o próximo step executável,
**Then** a prosa persiste uma solicitação vinculada às entradas aprovadas, pausa sem consumir tempo
ativo e apresenta resumo, razão e ação de retomada sem iniciar worktree, attempt ou agente.

### Aprovação reforçada

**Given** um step classificado como `restricted`,
**When** o operador aprova sua execução com justificativa,
**Then** a prosa executa o step no sandbox vigente, revisa o resultado e pausa novamente antes de
acceptance/commit, apresentando o diff completo sanitizado e exigindo aprovação vinculada aos bytes
e ao review exatos.

### Escalonamento tardio

**Given** um step inicialmente `autonomous`,
**When** o reviewer produz finding `high`, começa uma segunda tentativa ou um produtor futuro emite
um sinal válido de risco,
**Then** o agregador eleva monotonicamente o nível efetivo, persiste o sinal e aplica o próximo
checkpoint exigido sem permitir que a decisão de risco substitua a correção técnica necessária.

### Decisão após pausa

**Given** uma solicitação de aprovação pendente,
**When** o operador executa `resume-spec --decision-file <path|->` com o request ID, decisão e
justificativa,
**Then** a prosa readquire o lock, revalida entradas e bindings, registra e consome a decisão uma
única vez e retoma exatamente do checkpoint persistido.

### Rejeição acionável

**Given** uma solicitação pendente,
**When** o operador rejeita e escolhe `retry`, `replan` ou `abort`,
**Then** a prosa não continua o caminho aprovado, registra a razão e executa somente a ação humana
selecionada, sem auto-reconciliação.

### Decisão obsoleta

**Given** uma aprovação emitida para uma policy, assessment, attempt, review ou diff anterior,
**When** qualquer binding diverge no resume ou antes do efeito autorizado,
**Then** a decisão é marcada como stale, o step permanece em espera e uma nova solicitação é
necessária.

## Assumptions

- O processo atual é CLI one-shot e não interativo; pausas encerram o processo e são retomadas por
  nova invocação de `resume-spec`.
- O usuário do sistema operacional que invoca a CLI é a autoridade humana. Autenticação forte e
  não repúdio permanecem fora de escopo.
- O step schema v2 exige `changeType` estruturado. O schema v1 permanece aceito para compatibilidade
  concreta com os 37 steps ativos, sempre classificado como `restricted` com o sinal auditável
  `legacy-step-without-change-type`; isso não é fallback permissivo.
- A migração v1→v2 ocorre gradualmente quando uma spec ou step for naturalmente alterado. Esta
  feature não faz migração em massa nem autoedita seus próprios handoffs durante revalidation.
- Os 14 handoffs desta feature permanecem v1 no `baseSha` atual e, após o rollout, entram no caminho
  `restricted` conservador até uma alteração natural promover cada documento para v2.
- O nível pós-review se refere ao review local do step, antes de acceptance e commit. O final review
  global não será reordenado.
- A policy de risco vem exclusivamente do `baseSha` aprovado, como os catálogos vigentes. Worktree,
  prompt e output de agente não definem classificação ou autorização.
- `autonomous` significa ausência de pausa adicional por risco. `autoCommit`, `--allow-commit`, PR e
  demais autorizações Git continuam independentes conforme o ADR 018.
- A espera humana pausa o budget de elapsed; parse, lock, revalidation e persistência da decisão
  voltam a consumir o segmento ativo normal.
- O sandbox de agentes da etapa 1 permanece obrigatório e sua evidência pode ser referenciada por
  sinais, mas não será reimplementado.
- Runs persistidos no schema anterior não serão migrados automaticamente; retomada incompatível
  falha fechado com instrução operacional.

## Architecture and contracts

### Níveis canônicos

Os identificadores e sua semântica são estáveis; a policy configura quais tipos e áreas chegam a
cada nível.

| Nível | Rank | Checkpoint | Comportamento |
|---|---:|---|---|
| `autonomous` | 0 | nenhum por risco | Prossegue; autorização Git continua separada. |
| `approval_required` | 1 | antes da primeira ação mutável | Exige decisão humana vinculada ao assessment. |
| `restricted` | 2 | antes da execução e após review local | Exige justificativa e reaprovação do diff/review exatos. |

Nenhuma policy, sinal ou decisão reduz o rank efetivo durante o run. Novo attempt conserva o maior
nível já observado para o step.

### Entrada autoral do step

`schemas/step.schema.json` passa a representar dois contratos explícitos. O schema v1 existente
continua aceito sem `changeType`; o schema v2 exige `changeType` com formato estável e validação
semântica contra `workflow/risk-policy.yaml`. Em nenhum dos dois o autor declara `riskLevel`.

Todo step v1 recebe efetivamente `restricted`, com razão e sinal
`legacy-step-without-change-type` persistidos no assessment. Um documento v1 não pode ser
interpretado como v2 com campo opcional, nem cair em `autonomous` por ausência do campo.

Para commits, v2 usa mapeamento explícito de `changeType`. A leitura legada de
`behaviorType=<valor>` permanece somente para steps v1 durante a compatibilidade; ela não participa
da classificação de risco. A migração para v2 remove essa convenção apenas no documento
naturalmente alterado.

### Policy legível

`workflow/risk-policy.yaml` é configuração versionada, fechada e carregada do `baseSha`. Ela contém:

- `schemaVersion` e escala canônica.
- Mapeamento `changeType -> baseLevel` para steps v2.
- Regra normativa `step schema v1 -> restricted` com sinal
  `legacy-step-without-change-type`, independente de `behaviorType`.
- Regras ordenadas por prefixos de `predictedFiles`/`allowedAreas` com `minimumLevel`.
- Versão da semântica de decisão e limites de tamanho para razões/sinais.

Taxonomia inicial mínima:

| Tipo de mudança | Nível base |
|---|---|
| `bugfix`, `test`, `vetted_dependency`, `documentation` | `autonomous` |
| `feature`, `api_contract`, `database_migration` | `approval_required` |
| `architecture`, `security`, `irreversible`, `infrastructure`, `permissions` | `restricted` |

Regras de área sempre podem elevar o resultado do tipo. Policy ausente, inválida, alterada ou sem
mapeamento v2 bloqueia antes de qualquer efeito. Step v1 válido segue a regra conservadora
`restricted`; nenhum caso cai para `autonomous` por default.

### Envelope genérico de sinal

Produtores internos entregam sinais por uma única porta estruturada. O agregador não conhece uma
lista fechada de fontes:

```json
{
  "schemaVersion": "1.0.0",
  "source": { "type": "reviewer", "id": "local-review" },
  "kind": "high-finding",
  "minimumLevel": "restricted",
  "reason": "Finding high no review local",
  "evidenceRefs": ["artifact-review-..."],
  "observedAt": "2026-07-19T00:00:00.000Z",
  "fingerprint": "<sha256>"
}
```

O contrato é fechado, limitado e tratado como dado não confiável. `source.type`, `source.id` e
`kind` aceitam novos identificadores sem alteração na lógica de pausa. `minimumLevel` só participa
de `effectiveLevel = max(baseLevel, validSignals.minimumLevel)`. Sinal não aprova, reduz risco,
altera `changeType` ou define próxima ação.

Produtores iniciais:

- Finding `high` ou `critical` do reviewer: sinal `restricted`; a acceptance técnica continua
  bloqueante e não pode ser sobrescrita por aprovação humana.
- Segunda tentativa ou posterior: sinal com mínimo `approval_required`.
- Path permitido, mas não previsto: substitui a espera incompleta atual por sinal com mínimo
  `approval_required` e contexto do diff.
- Violação registrada pelo sandbox: sinal `restricted` para auditoria, preservando o bloqueio
  coercitivo já existente.

Um produtor fictício nos testes prova que uma nova fonte é ingerida sem editar agregação, state
machine ou lógica de pausa/retomada. Drift e vetting futuros apenas implementarão produtores desse
envelope.

### Avaliação e módulos

O desenho mínimo separa:

- `risk-policy`: carrega/valida policy, distingue step v1/v2, aplica v1→`restricted`, classifica
  `changeType` v2 e áreas, normaliza sinais e calcula assessment/hash. É puro e não persiste.
- `hitl-decision`: cria requests, valida bindings e classifica decisão como `satisfied`, `stale` ou
  `rejected`. É puro e não executa efeitos.
- Adapter local: coleta sinais, persiste assessment/requests/decisions e cria artifacts
  sanitizados.
- Orchestrator: chama os checkpoints e pausa/retoma; não contém tabela de classificação.

Não haverá engine de plugins, DSL ou carregamento dinâmico de código. Futuras fontes entram pela
porta de sinais e por wiring explícito de produtor confiável.

### Checkpoints

1. No início do run, classificar todos os steps e persistir nível base/efetivo antes de executar o
   primeiro; v1 produz assessment `restricted` com o sinal legado auditável.
2. Antes de criar attempt/worktree ou chamar agente, coletar sinais atuais e exigir pre-approval
   para `approval_required`/`restricted`.
3. Após cada produtor de sinal e revalidation, recalcular monotonicamente o assessment.
4. Após review local e revalidation, exigir aprovação do diff para qualquer step que tenha chegado
   a `restricted`; se a primeira escalada ocorreu nessa fase, a aprovação do diff é o primeiro gate
   aplicável.
5. Antes de acceptance e antes de commit, revalidar que request, decision, assessment e bytes ainda
   coincidem.
6. Antes do final review/global acceptance, confirmar que nenhum request obrigatório está pendente,
   stale ou rejeitado.

### Estado e máquina de estados

O state schema evolui de forma incompatível e cada step registra:

```text
risk:
  assessment: policy version/hash, step schema version, changeType quando v2, base/effective level,
              signals, hash, evaluatedAt
  requests[]: id, checkpoint, status, contextArtifactRef, binding, createdAt
  decisions[]: id, requestId, outcome, nextAction, actor, justification, binding, recordedAt,
               consumedAt, consumedByTransitionId
```

Bindings pré-execução incluem repo/run/base/spec/steps/step/policy/assessment. Bindings pós-review
acrescentam attempt, parent, worktree factual identity, diff artifact/hash, snapshot source hash e
review artifact/hash. Qualquer novo sinal muda o assessment hash, mesmo quando o rank já é máximo.

Estados reais são necessários porque a espera possui decisão, expiração por drift e transições
próprias:

```text
READY -> AWAITING_PRE_APPROVAL -> READY -> WORKTREE_READY
REVIEWING -> AWAITING_DIFF_APPROVAL -> ACCEPTING
AWAITING_* -> RETRY_PENDING | BLOCKED | CANCELLED
```

O run permanece `RUNNING` enquanto o step aguarda e projeta `AWAITING_APPROVAL` na saída. Isso evita
misturar espera esperada com falha `BLOCKED`. Diferentemente de `AWAITING_COMMIT`, estes estados não
são aliases de um estado sem comportamento próprio.

### Contrato de decisão

`resume-spec` aceita exclusivamente `--decision-file <path|->` para o payload fechado. `-` lê stdin
de forma não interativa; arquivo deve ser regular, não symlink, e ter permissão restrita quando
contiver justificativa. Razão não entra diretamente em argv.

Campos mínimos:

```json
{
  "schemaVersion": "1.0.0",
  "requestId": "approval-...",
  "outcome": "approved",
  "actor": "local-user",
  "justification": "Risco revisado e aceito",
  "nextAction": null
}
```

`outcome: rejected` exige exatamente uma `nextAction`:

- `retry`: descarta o attempt não commitado, registra a justificativa como orientação humana não
  executável e inicia novo attempt dentro do budget. O nível efetivo não diminui e novas aprovações
  são necessárias.
- `replan`: descarta o attempt não commitado, cancela o run atual preservando artifacts e orienta o
  operador a revisar spec/step e iniciar novo run.
- `abort`: cancela o run e não cria nova tentativa.

A decisão é validada sob lock, persistida junto da transição e consumida uma única vez. Repetição
idempotente da mesma decisão retorna o resultado registrado; decisão contraditória, request errado
ou binding stale falha fechado. Aprovação de risco nunca define `allowCommit`, `createPr` ou
qualquer autorização Git.

### Contexto apresentado ao humano

Toda pausa produz um artifact sanitizado e uma saída curta contendo:

- `runId`, `stepId`, goal, versão do step, `changeType` quando v2, nível base e efetivo.
- Regras e sinais que elevaram o risco, com refs de finding/drift/vetting quando existirem.
- Checkpoint, request ID e bindings relevantes.
- Antes da execução: arquivos previstos, áreas permitidas e resumo do step.
- Pós-review: diff completo dos no máximo cinco arquivos lógicos, review/finding resumido e hashes
  vinculados.
- Comando exato para aprovar ou rejeitar e ações válidas para o checkpoint.

Logs brutos, chain-of-thought e payload sensível não entram no contexto. Razões e sinais têm limite
de tamanho, sanitização, caracteres de controle rejeitados e nunca são interpolados como instrução
para agentes.

## Data model

- `StepV1`: contrato legado aceito e conservadoramente classificado como `restricted`.
- `StepV2.changeType`: identificador autoral obrigatório validado contra a policy.
- `RiskPolicy`: tabela confiável e versionada de tipos/áreas para níveis mínimos.
- `RiskSignal`: fato estruturado, com provenance/evidence e efeito monotônico.
- `RiskAssessment`: snapshot hasheado da policy, step e sinais usados na decisão.
- `ApprovalRequest`: desafio single-use de um checkpoint, ligado ao contexto sanitizado.
- `ApprovalDecision`: decisão e próxima ação explícitas, ligada ao request e consumida por uma
  transição.

O `specSnapshot` recebe `riskPolicyHash` dedicado; não reutiliza `policyHash`, `catalogsHash` ou
`sandboxPolicyHash`. Artifacts grandes, como diff e review, permanecem no store existente; o state
mantém refs e hashes.

## Error handling

- Policy ausente/inválida, `changeType` v2 desconhecido ou sinal malformado bloqueia antes do efeito
  com código estável e ação recomendada; step v1 válido não bloqueia por ausência de `changeType`,
  mas exige o fluxo `restricted`.
- Request pendente encerra o processo com outcome `AWAITING_APPROVAL`, sem ser classificado como
  falha retryable.
- Decisão stale gera novo request; não reaproveita aprovação nem resolve `BLOCKED` genericamente.
- Rejeição não entra na classificação de falha transitória e não aciona diagnostician.
- `retry` rejeitado pelo budget permanece bloqueado e oferece `replan` ou `abort`.
- Crash antes de persistir decisão não a consome; crash depois da persistência reconcilia pelo
  transition ID sem repetir efeito.
- Mutação inesperada de state/artifacts por subprocesso entre checkpoints bloqueia. A CLI continua
  sendo a única escritora cooperante de decisões.

## Observability

Nesta etapa, a trilha necessária à futura observabilidade fica estruturada no state:

- assessment criado/alterado, nível anterior/novo e fingerprints de sinais;
- request criado, checkpoint e artifact de contexto;
- decisão, ator local declarado, timestamp, próxima ação e consumo;
- decisão stale/rejeitada e razão sanitizada;
- tempo de espera separado de elapsed ativo.

Relatório e retrospective projetam apenas resumo sanitizado e refs. Não será criado backend de
métricas, dashboard ou telemetria remota nesta tarefa.

## Quality attributes

- **Determinismo:** mesmas policy, entradas e sinais válidos produzem o mesmo nível e assessment
  hash.
- **Monotonicidade:** nenhum sinal ou retry reduz o maior risco observado no run.
- **Recuperabilidade:** toda pausa ocorre após persistência e resume não repete agent call, review
  ou decisão consumida.
- **Auditabilidade:** cada autorização aponta para policy, assessment, evidence e, quando aplicável,
  diff/review exatos.
- **Fail closed:** entrada inválida, versão desconhecida, `changeType` v2 ausente/desconhecido,
  decisão stale ou dado adulterado não prossegue; v1 válido segue `restricted` explícito.
- **Extensibilidade limitada:** nova fonte produz o envelope existente; não altera a state machine
  nem a lógica dos checkpoints.

## Threat model

| Ameaça | Controle |
|---|---|
| Step se declara menos arriscado | V2 declara tipo e policy deriva nível; v1 ignora `behaviorType` para risco e fica `restricted`. |
| Sinal reduz risco ou aprova | Schema separado e agregação exclusiva por `max`; autorização usa contrato distinto. |
| Aprovação é reutilizada | Request single-use, bindings completos, consumo por transition ID e revalidation. |
| Diff muda após aprovação | Hash do diff/snapshot/worktree/review e nova checagem antes de acceptance/commit. |
| Aprovação de risco autoriza Git | Namespaces, flags e precondições independentes; testes cobrem a matriz. |
| Reason injeta instruções | Campo limitado/sanitizado tratado como dado; decisão vem de enum, nunca de prosa. |
| Segredo/PII aparece na decisão | stdin/arquivo restrito, sanitização pré-persistência e artifact de acesso restrito. |
| Gate/agente altera runtime | Comparação do state esperado ao redor de subprocessos e revalidation fail-closed. |
| Processo com a mesma identidade local forja decisão | Risco residual aceito pelo escopo individual; identidade forte exige decisão futura. |

## Risks

| Risco | Mitigação |
|---|---|
| Taxonomia crescer sem controle | IDs pequenos na policy, revisão versionada e ausência de DSL. |
| Excesso de pausas tornar o pipeline impraticável | Nível base explícito, razões legíveis e uma pausa apenas onde o checkpoint exige. |
| `restricted` duplicar autorização de commit | Eixos e precondições separados, sem propagação de flags. |
| Approval stale passar no crash recovery | Binding factual, consumo atômico e reconciliação por transition ID. |
| Compatibilidade v1 virar fallback permissivo | Regra única v1→`restricted`, sinal auditável e testes que proíbem `autonomous`. |
| Migração em massa causar autoedição e drift | Migração gradual somente quando o documento for naturalmente alterado. |
| Rejeição virar correction loop | Próxima ação enum e escolhida pelo humano; sem ação default. |
| Future signal exigir alteração central | Teste com produtor fictício pelo envelope estável. |
| Gate não sandboxado adulterar runtime | Guard de integridade durante subprocessos; risco residual de mesmo usuário documentado. |

## Edge cases

- Dois steps v2 com mesmo `changeType`, mas paths elevando apenas um deles.
- Step v1 com `behaviorType=vertical`: o marcador afeta apenas commit legado e nunca reduz
  `restricted`.
- Run misto com steps v1 conservadores e steps v2 classificados pela policy.
- Sinais duplicados, fora de ordem, com mesmo fingerprint ou novo sinal após aprovação.
- Escalada de `autonomous` para `restricted` somente depois do review.
- Finding `high` que simultaneamente bloqueia acceptance e eleva risco.
- Segunda tentativa após rejeição, falha transitória ou crash.
- Aprovação pré-exec válida e aprovação pós-review stale por mudança de um byte.
- Retry que gera diff idêntico, mas possui novo attempt/review e portanto novo request.
- Decisão duplicada idêntica, decisão contraditória e request de outro run/step.
- `--decision-file -` vazio, JSON inválido, symlink, arquivo permissivo ou conteúdo acima do limite.
- Rejeição com `retry` sem budget, `replan` com worktree sujo e `abort` após review.
- Policy muda entre pausa e resume; `changeType` v2 é removido da taxonomia.
- Run antigo no state schema anterior e worktree remanescente.
- `autoCommit: false`, `--allow-commit` ausente e aprovação de risco já consumida.

## Rollout / Rollback

1. Introduzir contratos versionados, mantendo v1 aceito e provando v1→`restricted` antes de efeitos.
2. Habilitar v2 com `changeType` obrigatório e policy do `baseSha`, sem migrar em massa os 37 steps.
3. Habilitar pausas com `autoCommit: false`, exercitando v1 conservador, aprovação, rejeição e resume.
4. Executar teste manual de step v2 autônomo escalado por finding `high` e produtor fictício.
5. Migrar cada step v1 somente quando seu documento for naturalmente alterado; risco e Git
   continuam eixos separados.

Rollback desabilita novos runs, preserva state/artifacts para auditoria e limpa worktrees apenas após
inspeção. Não converte state novo para versão anterior nem rebaixa steps para autônomos.

## Acceptance criteria

1. Step v2 válido exige `changeType`; step v1 válido permanece aceito e recebe `restricted` com
   razão/sinal `legacy-step-without-change-type`; todos são classificados antes da execução e nenhum
   caso ausente recebe fallback autônomo.
2. `workflow/risk-policy.yaml` contém a tabela legível de tipos/áreas e é carregado/hasheado do
   `baseSha` aprovado.
3. `autonomous` não adiciona pausa de risco e não altera autorização Git.
4. `approval_required` pausa antes do primeiro efeito e apresenta contexto sanitizado suficiente
   para decisão.
5. `restricted` exige aprovação pré-execução e aprovação pós-review vinculada ao diff completo dos
   no máximo cinco arquivos.
6. Finding `high` eleva automaticamente um step originalmente autônomo, sem permitir override da
   falha técnica do reviewer.
7. Segunda tentativa eleva risco e conserva o maior nível observado no run.
8. Um produtor fictício adiciona nova fonte pelo envelope de sinal sem alterar agregador, state
   machine ou lógica de pausa/retomada.
9. Requests e decisões registram timestamps, actor local, razão, bindings, consumo e artifacts no
   `state.json` validado.
10. `resume-spec --decision-file <path|->` registra e consome decisão atomicamente depois de lock e
    revalidation.
11. Aprovação stale, repetida em outro checkpoint ou vinculada a outro diff/attempt falha fechado e
    exige novo request.
12. Rejeição exige `retry`, `replan` ou `abort`; nenhuma opção cria correction automática ou deixa o
    run sem próxima ação explícita.
13. Contexto de decisão inclui resumo, razões/sinais, refs de achados e diff completo quando existe,
    sem log bruto, chain-of-thought, segredo ou PII conhecido.
14. Aprovação de risco e autorização de commit/PR permanecem independentes em testes de matriz.
15. Crash antes/depois da persistência da decisão retoma sem repetir agent call, review, decisão ou
    efeito Git.
16. State incompatível, policy drift, signal inválido e adulteração detectada bloqueiam com código e
    ação operacional documentados.
17. Teste manual demonstra finding `high` escalando step autônomo e retomada após decisão válida.
18. Documentação curta explica schemas v1/v2, compatibilidade conservadora, níveis, taxonomia,
    sinais, ajuste da policy, decisão/rejeição e troubleshooting.

## Open questions

Não há questão funcional bloqueante. A autenticidade forte da identidade local e o sandbox de
gates/MCP permanecem riscos conhecidos fora desta etapa; qualquer exigência futura de não repúdio
ou defesa contra processo malicioso do mesmo usuário requer nova decisão arquitetural.

## Implementation plan

1. Definir contratos versionados de step v1/v2 e schemas fechados de sinais e decisões.
2. Implementar policy confiável e agregação monotônica de risco.
3. Vincular a trust root ao `baseSha` e classificar inicialmente todos os steps, incluindo v1→`restricted`.
4. Derivar commit de `changeType` em v2, preservando compatibilidade `behaviorType` somente em v1.
5. Persistir assessments, requests, decisions e bindings single-use.
6. Adicionar estados HITL reais e precondições de transição.
7. Pausar antes da execução quando o nível efetivo exigir aprovação.
8. Implementar aprovação reforçada pós-review vinculada ao diff exato.
9. Estender `resume-spec` com decision file e ações explícitas de rejeição.
10. Integrar produtores de sinais de reviewer, retrabalho, escopo e sandbox.
11. Cobrir replay, crash, staleness, compatibilidade v1 e matriz de autorizações em testes.
12. Atualizar o command canônico de retomada e sua geração multi-adapter.
13. Atualizar documentação durável e troubleshooting operacional.
14. Registrar evidência manual do rollout e dos escalonamentos.
