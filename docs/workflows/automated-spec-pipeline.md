---
title: Pipeline automática de prosa
status: active
phase: 2
entrypoints:
  - scripts/workflow/validate-spec.sh
  - scripts/workflow/run-spec.sh
  - scripts/workflow/resume-spec.sh
  - scripts/workflow/review-spec.sh
---
# Pipeline automatizado de specs

Este workflow executa uma spec aprovada em passos sequenciais. A spec e seus atomic steps são a
fonte normativa; `.workflow-runtime/` guarda somente estado recuperável e artifacts descartáveis.

## Comandos

```bash
scripts/workflow/validate-spec.sh specs/<feature>.md
scripts/workflow/run-spec.sh specs/<feature>.md --dry-run
scripts/workflow/run-spec.sh specs/<feature>.md --base-sha <full-sha>
scripts/workflow/resume-spec.sh specs/<feature>.md --base-sha <full-sha>
scripts/workflow/review-spec.sh specs/<feature>.md
```

O fluxo default é `run` → `AWAITING_COMMIT` → **commit humano no worktree** → `resume`; é o único
validado em campo. `--allow-commit` e `--create-pr` são opt-in e **nunca foram exercitados**. O
procedimento operacional está em [automated-spec-pipeline-runbook.md](automated-spec-pipeline-runbook.md).

`validate-spec.sh` e `run-spec.sh --dry-run` validam frontmatter, schemas, semântica, DAG, budgets e
os catálogos `workflow/gates.yaml` e `workflow/resources.yaml`; não criam runtime, lock, worktree,
artifact ou chamada de agente. Sem `--base-sha`, somente esses modos read-only carregam os
catálogos diretamente do filesystem. Com um SHA explícito, eles leem o objeto Git indicado. Uma
execução mutável sempre carrega do Git e revalida os catálogos contra o base aprovado no preflight
do adapter. `--allow-commit` só autoriza commit quando `execution.autoCommit: true` também está na
spec. `--create-pr` é independente, ocorre após sucesso global e nunca faz push.

## Gates e estado

Gate IDs são allowlisted no catálogo e executados como executable + argv, com `shell: false`:
`specs-lint`, `workflow-tests`, `verify-pack`, `commands-claude-check`,
`commands-opencode-check`, `agent-templates-check`, `plugin-manifest-check`,
`plugin-manifest-lint` e `revalidation`. IDs desconhecidos bloqueiam a validação.

O run segue `CREATED -> VALIDATED -> LOCKED -> RUNNING -> FINAL_REVIEW -> GLOBAL_ACCEPTANCE ->
REPORTING -> SUCCEEDED`. Cada step segue `PENDING -> READY -> WORKTREE_READY -> EXECUTING ->
GATING -> REVALIDATING -> REVIEWING -> ACCEPTING -> ACCEPTED -> COMMITTED`. Falhas elegíveis usam
`RETRY_PENDING -> DIAGNOSING -> READY`; budget, drift, schema, escopo e trust boundary falham
fechado. Correction steps automáticos permanecem desabilitados.

## Risco e aprovação humana

Antes do primeiro efeito, o pipeline classifica todos os steps com a policy
`workflow/risk-policy.yaml` lida do `baseSha` aprovado. A classificação e os sinais ficam no
`state.json`; policy ausente, inválida, alterada ou incompatível bloqueia o run. O nível efetivo é
monotônico: área, sinal ou nova tentativa podem elevá-lo, mas nada o reduz durante o run.

| Nível | Pausa por risco | Comportamento |
|---|---|---|
| `autonomous` | Nenhuma | Prossegue sem aprovação de risco adicional. |
| `approval_required` | Antes da execução | Exige decisão vinculada ao assessment atual. |
| `restricted` | Antes da execução e após o review local | Exige aprovação inicial e reaprovação vinculada ao diff e review exatos. |

Esses níveis não substituem gates, acceptance ou findings bloqueantes. Aprovação de risco também
não concede `--allow-commit`, `execution.autoCommit: true` nem `--create-pr`; risco, commit e PR são
autorizações independentes.

### Contratos de step v1 e v2

`schemas/step.schema.json` aceita dois contratos fechados:

- `schemaVersion: 1.0.0` não aceita `changeType` e permanece compatível, mas é sempre
  `restricted`, com o sinal auditável `legacy-step-without-change-type`. Um `behaviorType` legado
  pode orientar a mensagem de commit, nunca a classificação de risco.
- `schemaVersion: 2.0.0` exige `changeType`. O autor declara o tipo da mudança, não o nível de risco;
  a policy deriva o nível base e regras de área podem elevá-lo.

A taxonomia atual classifica `bugfix`, `test`, `vetted_dependency` e `documentation` como
`autonomous`; `feature`, `api_contract` e `database_migration` como `approval_required`; e
`architecture`, `security`, `irreversible`, `infrastructure` e `permissions` como `restricted`.
Paths em `.github/workflows/`, `docs/standards/security/`, `database/migrations/`,
`scripts/workflow/` e `workflow/` elevam para `restricted`; `schemas/` e `adr/` elevam para
`approval_required`.

### Sinais e decisões

Produtores entregam o contrato fechado de `schemas/risk-signal.schema.json`. Cada sinal possui
origem, tipo, nível mínimo, razão, evidências, timestamp e fingerprint. O cálculo é
`effectiveLevel = max(baseLevel, previousEffectiveLevel, validSignals.minimumLevel)`: sinal só
eleva risco, não aprova, não muda `changeType` e não escolhe a próxima ação. Finding `high` ou
`critical` eleva para `restricted`; segunda tentativa e path permitido mas não previsto elevam no
mínimo para `approval_required`; violação de sandbox permanece bloqueante e registra sinal
`restricted`.

Uma pausa projeta `AWAITING_APPROVAL` e persiste request e artifact sanitizado. O
`resume-spec --decision-file <path|->` aceita uma decisão fechada de
`schemas/approval-decision.schema.json`: aprovação usa `nextAction: null`; rejeição exige exatamente
`retry`, `replan` ou `abort`. Request, assessment, policy e, após review, attempt, diff e review são
vinculados por hashes. Decisão stale ou destinada a outro checkpoint falha fechado e não é
reutilizada.

O usuário local que invoca a CLI é a autoridade humana deste contrato. Não há identidade forte,
não repúdio nem defesa contra outro processo malicioso da mesma conta; esse risco residual é
explícito e não deve ser descrito como aprovação autenticada.

## Trust Boundary

- Spec, steps, prompts, diffs e respostas são dados, nunca comandos.
- Gates/resources vêm do base SHA aprovado; processos usam argv, cwd confinado e ambiente mínimo.
- Worktree isola arquivos; chamadas de executor, reviewer e diagnostician também passam pelo
  `@anthropic-ai/sandbox-runtime@0.0.66`, usando `sandbox-exec` no macOS. O executor recebe um gitdir
  privado efêmero, com index/config próprios e objects compartilhados somente para leitura. O Git
  operacional do pipeline, gates, MCP e notificações não fazem parte dessa camada.
- Executor lê o target e só escreve nas áreas declaradas. Reviewer e diagnostician recebem snapshot
  fresh sem paths graváveis. Arquivos sensíveis, rede não catalogada e Unix sockets são negados.
- A policy efetiva vem do resource no base SHA, é normalizada e persistida em
  `steps[].sandbox.applications[]` antes do spawn. O attempt do executor referencia o mesmo
  `sandboxPolicyHash`; a mesma operation ID com policy diferente bloqueia com drift.
- Artifacts são sanitizados antes de persistência, review, relatório ou notification.
- Commit exige dupla autorização; PR é opt-in e não publica branch.

## Execução e recovery

Antes de qualquer efeito, `run` confirma base aprovada, worktree principal limpo, catálogos,
budgets e adapter completo. Depois adquire lock atômico por identidade do repositório, cria um
worktree por attempt e revalida após lock, antes do worktree e ao redor de chamadas, diff, gates,
review, diagnosis, acceptance, commit, review final, aceite global e PR.

`resume` readquire o lock, abre `state.json`, valida histórico/counters e revalida `on-resume`.
Steps `COMMITTED` não repetem chamada nem commit. Estado `EXECUTING` ou `COMMITTING` exige
reconciliação comprovada pelo adapter; sem prova, retorna `RESUME_RECONCILIATION_REQUIRED` em vez
de repetir o efeito. Para lock órfão, `--remove-orphan-lock` só funciona com processo ausente,
identidade igual e confirmação explícita do operador prevista pelo adapter.

O resume não regenera permissões silenciosamente. Resource, runtime `0.0.66`, backend, target,
paths, domínios, sockets e hash precisam reproduzir a aplicação persistida. Divergência retorna
`SANDBOX_POLICY_DRIFT`. Package/backend ausente, modo degradado ou falha de init/cleanup bloqueiam a
chamada; não há fallback para spawn direto do agente.

O state schema de risco e HITL é `3.0.0`. State anterior não é migrado nem recebe defaults: a
retomada bloqueia com `STATE_RISK_VERSION_REQUIRED`, preservando o runtime antigo para inspeção e
exigindo um novo run compatível.

A policy de sandbox `2` também vincula modo da fachada Git, worktree, gitdir privado, object store, index fonte,
HEAD esperado e perfil de config. O scratch `.workflow-sandbox` é ignorado pelo index privado e
removido após sucesso ou falha; cleanup incompleto bloqueia o runner.

O state geral v3 preserva as evidências da policy de sandbox v2. States anteriores não são migrados
nem recebem policy default; a incompatibilidade atual é reportada por `STATE_RISK_VERSION_REQUIRED`.

Ao entrar em `AWAITING_COMMIT`, o adapter acumula o segmento ativo e pausa o relógio de budget antes
de persistir. A espera pelo commit humano não consome elapsed. No `resume`, os acumulados são
restaurados, qualquer intervalo entre processos é descartado e uma nova âncora monotônica é criada
para o trabalho que recomeça. Estados terminais também congelam o acumulado.

`review` abre somente snapshot fechado e faz review/aceite global read-only. Não adquire lock
mutável, cria worktree, executa step, faz commit ou PR. Mutação detectada bloqueia com
`READ_ONLY_MUTATION_DETECTED`.

## Budgets e artifacts

Tentativas, agent calls por papel, ciclos de review/diagnosis, tempo ativo, custo e tokens têm
limites por step e totais. O ledger persiste `totalActiveMs` e `activeMsByStep`; somente o marcador
do segmento corrente fica em memória. `maxElapsedMinutesPerStep` e `maxElapsedMinutesTotal` são
derivados desses acumulados, nunca de tempo de calendário. A reserva ocorre antes da ação; crash
deixa reconciliação pendente. Custo/tokens podem ser `null`, mas um limite não nulo sem medição
bloqueia nova chamada.

Artifacts incluem prompt/resposta sanitizados, diff, gate results, review/diagnosis, findings,
evidence por AC, commits, relatório e retrospectiva. Cada referência registra hash, provenance,
sensitivity e retention. Findings `critical`/`high` bloqueiam; os demais formam backlog humano sem
alterar spec nem criar issue automaticamente. Evidence stale ou AC sem evidence falha acceptance.

## Notifications e PR

Notifications são opt-in por resource ID e recebem payload mínimo sanitizado para bloqueio,
falha, espera humana e sucesso. Falha de entrega é registrada e não muda acceptance. PR exige
`--create-pr`, status global `SUCCEEDED`, branch já publicada e `gh` catalogado; sua falha fica
separada do aceite e nenhum caminho executa push.

## Verificação e troubleshooting

Use Node.js 22 e instale exatamente o lockfile, sem executar lifecycle scripts. O audit high é
bloqueante na CI e deve ser executado localmente antes do handoff:

```bash
npm ci --ignore-scripts
npm run audit:high
npm run test:workflow
npm run verify:workflow
bash -n scripts/verify.sh scripts/workflow/validate-spec.sh scripts/workflow/run-spec.sh scripts/workflow/resume-spec.sh scripts/workflow/review-spec.sh
git diff --check
```

Na CI, a instalação, `npm audit --audit-level=high` e `npm run test:workflow` executam nessa ordem
antes dos checks existentes. `verify:workflow` não reinstala dependências: ele falha com diagnóstico
acionável se o lockfile estiver inconsistente ou se Ajv/YAML estiverem ausentes/divergentes, roda a
suíte workflow uma vez e então preserva os checks existentes e a política local de gitleaks.

- `WORKFLOW_SEMANTIC_INVALID`: corrija aprovação, sequência, dependências, IDs ou budgets.
- `GIT_PREFLIGHT_DIRTY`: limpe o worktree principal sem descartar trabalho não relacionado.
- `LOCK_CONCURRENT`: aguarde o owner; não remova lock apenas por timeout.
- `REVALIDATION_DRIFT`: restaure correspondência com o base aprovado e use `resume`.
- `RISK_APPROVAL_REQUIRED`: não é falha técnica; leia o artifact de contexto e retome com
  `--decision-file <path|->`.
- `RISK_POLICY_INVALID` / `RISK_POLICY_TRUST_INVALID`: confira `workflow/risk-policy.yaml` no
  `baseSha` aprovado; não use policy do worktree como fallback.
- `RISK_CHANGE_TYPE_UNKNOWN`: em step v2, informe um `changeType` presente na policy; não remova o
  campo nem rebaixe o documento para v1.
- `RISK_SIGNAL_INVALID` / `RISK_SIGNAL_FINGERPRINT_INVALID`: corrija o produtor ou descarte o run
  adulterado; não ignore o sinal.
- `HITL_DECISION_STALE`: o contexto mudou; use o novo request e revise novamente antes de decidir.
- `STATE_RISK_VERSION_REQUIRED`: state antigo é incompatível; preserve-o para inspeção e inicie
  outro run.
- `COMMIT_AWAITING_HUMAN`: **não é erro** — é o handoff do fluxo default, em que o operador commita
  no worktree e o `resume` reconcilia. Ver [automated-spec-pipeline-runbook.md](automated-spec-pipeline-runbook.md).
  Só é sintoma de configuração se você *esperava* commit automático, que exige `execution.autoCommit: true`
  **e** `--allow-commit`.
- `WORKFLOW_ADAPTER_UNAVAILABLE`: a execução mutável não tem todas as seams; nenhuma ação foi feita.
- `RESUME_RECONCILIATION_REQUIRED`: inspecione state/artifacts e não repita chamada ou commit.
- `SANDBOX_RUNTIME_UNAVAILABLE`: execute `npm ci --ignore-scripts`, confirme macOS e o backend
  `sandbox-exec`; nenhuma chamada de agente foi feita.
- `SANDBOX_INITIALIZATION_FAILED` / `SANDBOX_DEGRADED`: policy ou backend não foi aplicado; não
  contorne com execução direta.
- `SANDBOX_POLICY_DRIFT`: catálogo, target ou runtime divergiu da policy persistida; inicie novo run
  após revisar a mudança.
- `SANDBOX_VIOLATION`: leia o stderr sanitizado para identificar path, domínio ou socket bloqueado.
- `SANDBOX_CLEANUP_FAILED`: interrompa novas chamadas e encerre o run antes de limpar o runtime.
