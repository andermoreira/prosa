---
schemaVersion: 1.0.0
id: spec-automated-pipeline
title: Pipeline automática de prosa
status: approved
source:
  path: specs/automated-spec-pipeline.md
  hash: f8f2bf02bd67c09a73f2793ecbb7e84b9ced50f60b7ffce4d091a1c0ee060b83
  baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4
approval:
  approvedBy: user
  approvedAt: 2026-07-16
  baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4
goal: Permitir que uma spec aprovada seja executada localmente com limites previsíveis, evidência auditável e autorização explícita para efeitos Git, sem criar uma segunda fonte de verdade.
nonGoals:
  - Manter manifesto DAG, backlog externo ou estado runtime como fonte normativa.
  - Tratar worktree como sandbox de filesystem, processos, rede ou credenciais.
  - Fazer push, merge, deploy, correção automática ou alteração de proteção de branch.
  - Paralelizar steps ou suportar executor diferente de OpenCode na fase 1.
  - Permitir comandos shell livres, retries ilimitados, override de budget ou aceite por narrativa de agente.
acceptanceCriteria:
  - id: AC-01
    description: DAG derivado de spec, steps e notes aprovadas, sem manifesto paralelo.
  - id: AC-02
    description: Lock atômico exclusivo protege toda execução mutável.
  - id: AC-03
    description: State machine rejeita transições inválidas e persiste counters atomicamente.
  - id: AC-04
    description: Runtime é ignorado, descartável e não contém requisitos autorais.
  - id: AC-05
    description: Schemas separados validam spec, step, review, diagnosis, state e retrospective.
  - id: AC-06
    description: Gates e resources confiáveis executam argv sem shell.
  - id: AC-07
    description: Budgets por step e total bloqueiam antes de exceder limites.
  - id: AC-08
    description: Retries finitos exigem diagnosis após falha repetida elegível.
  - id: AC-09
    description: OpenCode e os três commands usam as fontes e entrypoints canônicos.
  - id: AC-10
    description: Revalidation usa a base CLI explícita e invalida evidência sob drift em todos os triggers.
  - id: AC-11
    description: Artifacts têm provenance e sanitização antes de persistência ou compartilhamento.
  - id: AC-12
    description: Notifications opt-in recebem somente payload sanitizado.
  - id: AC-13
    description: Limite de cinco arquivos lógicos trata rename inequívoco como um.
  - id: AC-14
    description: Reviewer e diagnostician são fresh e read-only com severidades critical, high, medium e low.
  - id: AC-15
    description: Cada AC possui evidence e cada step declara documentation impact.
  - id: AC-16
    description: Acceptance local é determinística; o default aguarda commit humano e commit automático exige dupla autorização.
  - id: AC-17
    description: Global gates exatos, final review e global acceptance são obrigatórios sem correction step automático.
  - id: AC-18
    description: Relatório e retrospective registram outcomes sem secrets.
  - id: AC-19
    description: PR opt-in após sucesso global nunca executa push.
  - id: AC-20
    description: Suíte cobre fluxo completo, concorrência, crash, budgets e trust boundary.
  - id: AC-21
    description: Adapter local monta por default o runtime de produção completo para run, resume, review e validate.
  - id: AC-22
    description: Lifecycle, handoff, índice de steps, catálogo de commands e plugin manifest refletem o pipeline e o limite lógico.
  - id: AC-23
    description: CI instala dependências sem scripts, bloqueia audit high e executa a suíte workflow com gate local explícito.
implementationNotes:
  - id: NOTE-01
    content: A execução é sequential, exige Git limpo, usa worktree sem fallback, produz retrospective e mantém corrections automáticas desabilitadas.
    approvedBy: user
    approvedAt: 2026-07-16
    baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4
  - id: NOTE-02
    content: Os steps usam comportamento vertical; boundaries.inScope registra ownership e invariants, boundaries.outOfScope registra doesNotOwn, e dependsOn registra allowedDependencies compatíveis com o schema vigente.
    approvedBy: user
    approvedAt: 2026-07-16
    baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4
  - id: NOTE-03
    content: Os campos legados source.baseSha, approval.baseSha, implementationNotes.baseSha e context.baseSha registram provenance informativa; somente --base-sha explícito na CLI autoriza run ou resume mutável. Validate sem base continua read-only.
    approvedBy: user
    approvedAt: 2026-07-16
    baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4
documentationImpact:
  kind: paths
  paths:
    - docs/workflows/automated-spec-pipeline.md
    - docs/workflows/spec-process.md
    - docs/workflows/templates/step-handoff.md
    - specs/steps/README.md
    - .cursor/commands/COMMANDS.md
budgets:
  maxAttemptsPerStep: 3
  maxAttemptsTotal: 60
  maxAgentCallsPerStep: 6
  maxAgentCallsTotal: 120
  maxReviewCyclesPerStep: 2
  maxReviewCyclesTotal: 40
  maxDiagnosisCyclesPerStep: 2
  maxDiagnosisCyclesTotal: 40
  maxElapsedMinutesPerStep: 120
  maxElapsedMinutesTotal: 2400
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
  blockingSeverities:
    - critical
    - high
globalGates:
  - workflow-tests
  - commands-opencode-check
  - commands-claude-check
  - specs-lint
  - plugin-manifest-check
  - plugin-manifest-lint
  - verify-pack
---
# Pipeline automática de prosa

**Status:** ativa, aprovada para implementação
**Data:** 2026-07-16
**ADRs:** [015](../adr/015-integracao-do-pipeline-ao-lifecycle-e-ssot.md), [017](../adr/017-execucao-segura-por-catalogo-e-trust-boundary.md), [018](../adr/018-politica-git-worktree-lock-e-commit.md)
**Superseded:** o [ADR 016](../adr/016-politica-git-worktree-e-commit.md) permanece histórico e é substituído pelo ADR 018.

## Goal

Pipeline automática de prosa — executar specs aprovadas com limites previsíveis, evidência auditável e autorização explícita para efeitos Git. O SSOT é o Markdown da spec e seus steps; o DAG é derivado a cada execução.

## Non-goals

- Manter manifesto DAG, backlog externo ou estado runtime como fonte normativa.
- Tratar worktree como sandbox de filesystem, processos, rede ou credenciais.
- Fazer `push`, merge, deploy, correção automática ou alteração de proteção de branch.
- Paralelizar steps ou suportar executor diferente de OpenCode na fase 1.
- Permitir comandos shell livres, retries ilimitados, override de budget ou aceite por narrativa de agente.

## User stories

### Execução completa

**Given** uma spec aprovada, implementation notes aprovadas, base SHA limpa e catálogos válidos,
**When** o operador usa `/run-spec`,
**Then** o pipeline deriva o DAG, adquire lock, cria worktrees, executa steps dentro dos budgets, coleta e sanitiza artifacts, revalida, revisa, aceita deterministicamente, executa final review/acceptance global e gera relatório/retrospectiva.

### Retomada segura

**Given** uma execução interrompida com estado persistido,
**When** o operador usa `/resume-spec`,
**Then** o pipeline adquire o lock do repositório, valida a state machine, reconcilia Git e revalida todos os triggers antes de reutilizar evidência.

### Review sem execução

**Given** um run ou snapshot completo,
**When** o operador usa `/review-spec`,
**Then** um reviewer fresh e read-only executa sobre artifacts sanitizados e produz findings estruturados sem corrigir o worktree.

### Budget esgotado

**Given** qualquer limite de tentativas, agent calls, ciclos, tempo, custo estimado ou tokens alcançado,
**When** a próxima ação consumiria budget,
**Then** a reserva é negada antes da chamada, o bloqueio é persistido e o run não avança.

### Falha repetida

**Given** uma tentativa repetida que falhou e ainda há budget,
**When** a política exige diagnóstico,
**Then** um diagnostician fresh e read-only analisa artifacts sanitizados; ele não edita, não aceita e não habilita correction step automático.

### Commit e PR

**Given** acceptance local/global aprovada,
**When** `autoCommit: true` e `--allow-commit` coexistem,
**Then** commits locais podem ser criados; PR continua opt-in e nunca faz push.

### Entrada não confiável

**Given** gate/resource desconhecido, drift, schema inválido, path fora do escopo ou artifact não sanitizável,
**When** o pipeline avalia a fronteira,
**Then** falha fechado antes da próxima ação mutável.

### Base explícita e provenance

**Given** frontmatter aprovado com campos `baseSha` legados,
**When** o operador solicita `run` ou `resume` sem `--base-sha`,
**Then** o pipeline bloqueia antes do lock e não promove nenhum SHA documental a autorização; `validate` pode permanecer read-only sem base explícita.

## Assumptions

- Esta revisão foi explicitamente aprovada pelo usuário; os novos steps substituem integralmente os dez anteriores.
- ADRs Accepted não são editados. A correção da política de rename é registrada pelo ADR 018, que supersede o ADR 016.
- Git identifica inequivocamente rename por seu diff estruturado. Nesse caso, origem e destino formam **um arquivo lógico** para o limite; rename ambíguo permanece delete+add e conta dois.
- Specs/steps Markdown são SSOT. Schemas validam representações normalizadas extraídas desses documentos e artifacts runtime, não criam manifesto DAG.
- Ajv e `yaml` validam fronteiras; validação semântica continua obrigatória.
- `.cursor/commands/*.md` é a fonte canônica dos commands, já convertida para OpenCode pelo builder existente.
- Custos e tokens podem ser `null` quando o adapter não os fornece. Se um limite correspondente for obrigatório e a medição estiver indisponível, a próxima chamada é bloqueada.
- O limite de cinco arquivos por atomic step conta produção, testes, docs, config, deleções e arquivos lógicos renomeados.
- `source.baseSha`, `approval.baseSha`, `implementationNotes[].baseSha` e `context.baseSha` existem por exigência dos schemas vigentes e são apenas provenance informativa. A autoridade para execução mutável é exclusivamente o `--base-sha` fornecido à CLI em `run` ou `resume`.

## Architecture and contracts

### Layout aprovado

```text
schemas/
  spec.schema.json
  step.schema.json
  review.schema.json
  diagnosis.schema.json
  state.schema.json
  retrospective.schema.json
workflow/
  gates.yaml
  resources.yaml
scripts/workflow/
  run-spec.sh
  resume-spec.sh
  review-spec.sh
  test-*.cjs
  lib/*.cjs
.cursor/commands/
  run-spec.md
  resume-spec.md
  review-spec.md
.workflow-runtime/          # local, ignorado pelo Git
```

Nenhum outro path novo de implementação é autorizado por esta spec. `scripts/verify.sh`, `.gitignore` e `scripts/build-opencode-commands.cjs` só podem ser atualizados quando um step os listar explicitamente.

### SSOT, implementation notes e DAG

- A spec aprovada, seus steps e **implementation notes aprovadas e versionadas nos próprios artefatos** são a entrada normativa.
- Implementation notes só podem esclarecer implementação sem mudar Goal, Non-goals, AC, dependências ou decisão de ADR. Devem registrar aprovador, data e base SHA; mudança material exige revisão da spec.
- O pipeline deriva o DAG a cada run/resume e valida correspondência plano↔steps, sequência, dependências, órfãos e ciclos.
- `.workflow-runtime/` contém somente lock, estado, counters, snapshots, artifacts e relatórios descartáveis; deve estar no `.gitignore`.
- Nenhum SHA embutido no Markdown autoriza mutação. `validate` sem base verifica contratos de forma read-only; `run` e `resume` exigem `--base-sha` explícito e validam esse SHA antes do lock.

### State machine

Estados do run:

```text
CREATED -> VALIDATED -> LOCKED -> RUNNING -> FINAL_REVIEW -> GLOBAL_ACCEPTANCE
GLOBAL_ACCEPTANCE -> REPORTING -> SUCCEEDED
qualquer estado ativo -> BLOCKED | FAILED | CANCELLED
BLOCKED -> VALIDATED (somente resume após causa resolvida e revalidation)
```

Estados do step:

```text
PENDING -> READY -> WORKTREE_READY -> EXECUTING -> GATING -> REVALIDATING
REVALIDATING -> REVIEWING -> ACCEPTING -> ACCEPTED -> AWAITING_COMMIT -> COMMITTED
EXECUTING|GATING|REVALIDATING|REVIEWING|ACCEPTING -> RETRY_PENDING
RETRY_PENDING -> DIAGNOSING -> READY | BLOCKED
qualquer estado ativo -> FAILED | CANCELLED
```

Transições não listadas são inválidas. Estado e transição são persistidos atomicamente com versão, timestamp, causa e counters. `SUCCEEDED`, `FAILED` e `CANCELLED` são terminais. `BLOCKED` só sai por `/resume-spec` após lock e revalidation.

### Lock atômico por repositório

- Antes de criar/mutar runtime, worktree, agent call ou commit, o pipeline adquire lock exclusivo identificado pela raiz real e identidade Git do repositório.
- Aquisição usa operação atômica de filesystem; o lock registra PID, host, runId, repo identity e timestamps.
- Lock existente bloqueia por default. Lock stale só pode ser recuperado após provar processo ausente, identidade compatível e confirmação explícita; nunca por timeout isolado.
- `/review-spec` pode operar sem lock mutável apenas sobre snapshot fechado; review do worktree vivo exige lock.
- Release ocorre em finally e é auditado; falha de release é reportada sem ocultar o outcome.

### Budgets e retries obrigatórios

A política validada exige valores finitos e positivos por step e para o run inteiro para:

- `maxAttemptsPerStep` e `maxAttemptsTotal`;
- `maxAgentCallsPerStep` e `maxAgentCallsTotal`;
- `maxReviewCyclesPerStep`/`maxReviewCyclesTotal` e `maxDiagnosisCyclesPerStep`/`maxDiagnosisCyclesTotal`;
- `maxElapsedMinutesPerStep` e `maxElapsedMinutesTotal`;
- `maxEstimatedCostPerStep`/`maxEstimatedCostTotal` e `maxTokensPerStep`/`maxTokensTotal`, todos nullable.

Counters incluem tentativas, chamadas por papel, ciclos, elapsed ativo, custo estimado e tokens reportados, sempre nos escopos step e total. `maxElapsedMinutesPerStep` e `maxElapsedMinutesTotal` medem somente segmentos em que a automação está trabalhando. O ledger acumula e persiste `activeMs` por step e no total; a âncora monotônica do segmento atual existe apenas no processo. No restore, o intervalo desde a última persistência é descartado e um novo segmento começa quando a automação retoma trabalho. Antes de toda ação onerosa, o pipeline reserva budget e persiste a reserva; depois reconcilia consumo para evitar overshoot após crash. Qualquer limite alcançado bloqueia. Se custo/tokens medidos forem `null`, isso é persistido; limite não nulo sem medição confiável bloqueia novas agent calls.

Retries são limitados por budget e por classificação de erro. Não há retry para schema, autorização, escopo, trust boundary ou erro determinístico. Após falha repetida elegível, diagnostician fresh/read-only é obrigatório antes de nova tentativa. Diagnóstico consome agent call e diagnosis cycle. Correction step automático permanece desabilitado na fase 1.

A classificação é persistida na evidência: falhas transitórias elegíveis podem repetir dentro do budget; falhas determinísticas, de política ou de autorização bloqueiam imediatamente. Retry nunca troca a base CLI, o `gateId`, o `testSelector` ou o `resultRef` exigido pelo AC.

### Catálogos e spawn

- `workflow/gates.yaml` define gates por ID: executable/resource, argv, cwd policy, timeout e classificação.
- `workflow/resources.yaml` define recursos executáveis/adapters/notifiers permitidos, capabilities, ambiente permitido, limites e postura read-only/write.
- Ambos são carregados do `--base-sha` autoritativo da invocação, validados com `yaml` + Ajv/invariantes e hasheados.
- Spawn recebe executable e argv separados, `shell: false`, cwd confinado, ambiente mínimo, timeout e limite de saída.
- Spec, step, notes, diff, artifact ou resposta de agente nunca define comando livre.

### OpenCode e commands

- OpenCode é o adapter inicial para executor, reviewer e diagnostician, sempre em sessões fresh por papel/tentativa.
- `/run-spec`, `/resume-spec` e `/review-spec` têm fonte canônica em `.cursor/commands/`; o builder existente os materializa no OpenCode.
- Os commands chamam `scripts/workflow/run-spec.sh`, `resume-spec.sh` e `review-spec.sh`; não duplicam lógica de state machine.
- Reviewer/diagnostician recebem somente snapshot sanitizado e capability read-only do resource catalog.
- O adapter local de produção monta por default todos os módulos concretos necessários a `validate`, `run`, `resume` e `review`: OpenCode, lock/state, worktrees, gates, review/diagnosis, acceptance, reports, notifications e PR. Dependency injection permanece disponível somente como seam explícito de testes; ausência de override nunca produz capability placeholder.

### Lifecycle, distribuição e dependências

- O processo canônico, o template de handoff e o índice de atomic steps usam o limite absoluto de cinco arquivos lógicos: produção, testes, docs e config contam; rename inequivocamente identificado pelo Git conta um.
- `/run-spec`, `/resume-spec` e `/review-spec` aparecem no catálogo canônico e no plugin manifest gerado, com checks anti-drift.
- O wrapper `scripts/workflow/validate-spec.sh` usa o mesmo adapter local e contratos do runtime, sem caminho de validação paralelo.
- O gate local informa claramente dependência ausente ou lockfile divergente antes da suíte. A CI usa instalação reproduzível sem lifecycle scripts, audit de severidade high e testes workflow antes dos demais gates.

### Git, worktree e limite

- A base recebida por `--base-sha` deve existir, estar limpa e ter aprovação explícita do operador na invocação. Os campos `baseSha` do documento não substituem a flag. Um worktree por step isola estado Git, não privilégios.
- Diff é comparado ao parent esperado e confinado aos arquivos previstos.
- Limite absoluto: cinco **arquivos lógicos** afetados. Rename inequivocamente identificado pelo Git conta um; delete+add ou rename ambíguo conta dois. Untracked, testes, docs e deleções contam.
- Com `autoCommit: false` (default), acceptance local termina em `AWAITING_COMMIT`: o pipeline acumula e pausa explicitamente o segmento ativo, preserva o worktree, encerra a execução e espera um commit humano único. Essa espera não consome elapsed. `/resume-spec --base-sha <sha>` reconcilia esse commit antes de continuar e inicia um novo segmento ativo, sem carregar o gap entre processos. Commit automático exige `autoCommit: true` + `--allow-commit`, respeita hooks e é idempotente no resume.
- PR é opcional após sucesso global, não faz push e bloqueia se a branch não estiver publicada.

### Revalidation triggers

Revalidation completa ocorre: após lock; antes de criar worktree; antes/depois de cada agent call; após diff; após cada gate; antes/depois de review/diagnosis; antes de acceptance; antes/depois de commit; no resume; antes de final review, global acceptance e PR.

Ela compara repo identity, base/parent SHA, limpeza/HEAD, hashes de spec, steps, implementation notes, schemas, catálogos, política, DAG, estado/counters, worktree e artifacts usados. Drift invalida a evidência dependente e bloqueia; nunca é reconciliado silenciosamente.

### Artifacts, sanitização e notifications

- Artifacts incluem inputs normalizados, prompts, diff, stdout/stderr, gate results, review/diagnosis, findings, evidence map, commits, reports e retrospectiva.
- Todo artifact tem media type, schemaVersion, hash, provenance, sensitivity e retention. Escrita é atômica e confinada ao runtime.
- Sanitização ocorre **antes** de persistência, prompt de reviewer/diagnostician, relatório ou notification. Secrets/PII, ambiente não permitido e conteúdo acima do limite são removidos/truncados com marcador auditável.
- Artifact que não possa ser sanitizado de forma confiável bloqueia seu consumidor; original sensível não é persistido como fallback.
- Notifications são opt-in, definidas por resource ID, recebem payload mínimo sanitizado e eventos `blocked`, `failed`, `awaiting-approval` e `succeeded`. Falha de notification é persistida, não muda acceptance e nunca autoriza retry extra.

### Schemas e findings

- `spec.schema.json`: representação normalizada da spec, aprovação, AC IDs, implementation notes e documentation impact esperado.
- `step.schema.json`: goal, paths, dependências, gates, resources, AC cobertos, notes, budget policy e documentation impact.
- `review.schema.json`: snapshot/hash, findings, AC evidence assessment e verdict.
- `diagnosis.schema.json`: falha analisada, hipóteses, evidências e recomendação sem mutação/verdict.
- `state.schema.json`: state machine, lock identity, counters/reservas, hashes, transitions e artifact refs.
- `retrospective.schema.json`: outcomes, budget, retrabalho, findings backlog e melhorias propostas.

Severidades canônicas permitidas em findings: `critical`, `high`, `medium` e `low`. `critical` bloqueia imediatamente e não segue para correction. `high` bloqueia e pode ser marcado como correction eligible somente quando as regras estruturadas permitirem, mas auto correction permanece desabilitada. Todo `medium` ou `low` deve ser persistido no findings backlog; omitir qualquer um deles é violação obrigatória e bloqueia a conclusão do review. Não existem findings `blocker` ou `info`. Duplicatas usam fingerprint estável sem apagar ocorrências/evidências.

### Evidence, documentation impact e acceptance

- Cada AC possui ID estável `AC-NN`. Cada step declara AC cobertos e produz evidence refs hasheadas por AC.
- AC sem evidência válida, evidência stale, finding `critical` ou `high`, ou backlog incompleto para `medium`/`low` falha acceptance.
- Cada step declara `documentationImpact`: paths documentais previstos ou `none` com justificativa. Final review valida a declaração contra o diff e a documentação durável.
- Acceptance local é função determinística de schema, state, lock, budget, escopo, gates, revalidation, artifacts, review, findings e evidence map.
- Após integrar todos os steps, **final review fresh/read-only e global acceptance são obrigatórios na fase 1**. O estado só vira `SUCCEEDED` depois de cobertura de todos os ACs, suíte global, documentation impact e ausência de findings bloqueantes.
- Os global gates são exatamente a união deduplicada de `testing.gateIds` dos steps requeridos: `workflow-tests`, `commands-opencode-check`, `commands-claude-check`, `specs-lint`, `plugin-manifest-check`, `plugin-manifest-lint` e `verify-pack`. Cada resultado precisa de artifact fresco e `resultRef` compatível com a evidence declarada.
- Correction step automático permanece desabilitado. `critical` bloqueia imediatamente; `high` bloqueia mesmo quando correction eligible; `medium`/`low` seguem apenas após persistência obrigatória no backlog para triagem humana.

## Data model

Não há banco. JSON runtime validado por schemas separados mantém `RunState`, `StepState`, `BudgetLedger`, `ArtifactRef`, `Finding`, `EvidenceRef`, `Review`, `Diagnosis` e `Retrospective`. Todo registro inclui `schemaVersion`; hashes e provenance ligam decisões às entradas. O DAG continua derivado e não é persistido como manifesto autoral.

## Error handling

- Erros têm código estável por fase, estado resultante, contexto sanitizado e ação recomendada.
- Falhas determinísticas não fazem retry. Falhas transitórias só repetem dentro de budget e policy.
- Reservas e transições são persistidas antes de efeitos; reconciliação no resume evita chamada/commit duplicado.
- Cleanup é best effort e separado do outcome. Lock/worktree remanescente é reportado.
- Falha de sanitização, schema, lock, revalidation ou trust boundary é bloqueante.

## Observability

- Logs estruturados incluem `runId`, `stepId`, state transition, attempt, agent role, budget before/after, artifact refs, duração e outcome.
- Relatórios mostram consumo e limites, inclusive custo/tokens `null`, revalidation, retries, notifications e razão determinística de acceptance.
- Não há telemetria remota obrigatória. Notifications opt-in recebem apenas payload sanitizado.

## Quality attributes

- **Determinismo:** mesmas entradas/evidências produzem o mesmo DAG e acceptance.
- **Fail closed:** lock, schema, budget, drift ou sanitização inválidos impedem a próxima fase.
- **Recuperabilidade:** state/reservas permitem resume sem duplicar agent call ou commit.
- **Auditabilidade:** cada AC e transição aponta para evidência hasheada e provenance.
- **Bounded autonomy:** nenhuma execução excede budgets ou cria correction step automático.

## Threat model

| Ameaça | Controle |
|---|---|
| Duas execuções mutam o mesmo repo | Lock atômico por identidade real do repositório. |
| Command/prompt injection | Catálogos do base SHA, argv, `shell: false`, conteúdo tratado como dado. |
| Exfiltração por artifacts/notifications | Sanitização prévia, payload mínimo, resources allowlisted e opt-in. |
| Agent loop/custo descontrolado | Budget ledger persistente, reservas e retries finitos. |
| Reviewer corrige o alvo | Sessão fresh, resource read-only, snapshot e verificação pós-chamada; correction eligible não autoriza auto correction. |
| Drift troca requisito/política | Revalidation nos triggers definidos e invalidation da evidência. |
| Worktree confundido com sandbox | Aviso explícito; isolamento de SO permanece externo. |
| Commit/PR acidental | Dupla autorização; PR opt-in e sem push. |

## Risks

| Risco | Mitigação |
|---|---|
| State machine ficar inconsistente após crash | Persistência atômica, reservas e reconciliação no resume. |
| Budget medido parcialmente | Persistir nullable; bloquear se limite configurado depender de medição ausente. |
| Rename mal classificado | Confiar apenas no status estruturado inequívoco do Git; ambíguo conta delete+add. |
| Sanitizer remover evidência necessária | Marcar truncamento/redaction e bloquear quando a decisão não puder ser auditada. |
| Findings backlog virar SSOT paralelo | Saída para triagem humana; nenhuma issue/spec é criada automaticamente. |
| Muitos schemas/módulos virarem engine genérica | Restringir ao layout e contratos desta spec; sem plugins/DSL/scheduler. |
| Notification vazar informação | Opt-in, resource catalog e payload mínimo já sanitizado. |

## Edge cases

- Lock concorrente, stale com PID reutilizado, clone movido, symlink da raiz e crash antes/depois da aquisição.
- Budget no limite, reserva persistida sem chamada, chamada concluída sem reconciliação, custo/tokens `null`, elapsed ativo excedido durante processo, espera humana longa e restart sem cobrança do gap.
- Rename inequívoco, rename ambíguo, case-only rename, untracked, deleção, submodule e path fora do step.
- Drift em notes, schema, gate/resource catalog, state, artifact ou parent em qualquer trigger.
- Artifact binário, saída enorme, secret detectado, falha de sanitização e notification indisponível.
- Reviewer/diagnostician inválido, finding duplicado, severidade fora de `critical/high/medium/low`, backlog ausente para `medium/low`, evidence stale ou AC sem evidence.
- Final review falha depois de todos os steps aceitos; correction step não é criado e PR não é tentado.
- Resume após commit ou agent call concluído, mas antes da persistência final.

## Rollout / Rollback

Fase 1 entrega todo o contrato desta spec: budgets/retries, diagnosis, review/acceptance local e global, reports e commands. O rollout começa em dry-run, depois execução supervisionada sem commit, dupla autorização para commit e PR opcional sem push. Rollback desabilita invocação, preserva relatório e remove runtime/worktrees somente após inspeção; não reverte commit automaticamente.

## Fases futuras

- Adapters além de OpenCode.
- Paralelismo de steps com ownership/conflitos.
- Sandbox de SO ou execução remota.
- UI como projeção read-only do DAG/runtime.
- Merge queue e proveniência assinada.

Retry, budget, diagnosis, final review e global acceptance **não** são fases futuras.

## Acceptance Criteria

1. **AC-01:** DAG é derivado de spec/steps/notes aprovadas, sem manifesto paralelo, e rejeita inconsistências.
2. **AC-02:** lock atômico exclusivo por repositório protege toda execução mutável e stale recovery exige prova + confirmação.
3. **AC-03:** state machine rejeita transição inválida e persiste transições/counters atomicamente.
4. **AC-04:** `.workflow-runtime/` é ignorado, descartável e não contém requisitos autorais.
5. **AC-05:** schemas separados validam spec, step, review, diagnosis, state e retrospective.
6. **AC-06:** gates/resources vêm do base SHA, usam IDs/argv, Ajv+`yaml`, cwd confinado e `shell: false`.
7. **AC-07:** todos os budgets obrigatórios por step e total são persistidos/reservados; elapsed considera apenas segmentos ativos persistidos, sem espera humana ou gap de restart; qualquer limite bloqueia antes da ação e custo/tokens nullable seguem a política definida.
8. **AC-08:** retries são finitos/classificados; falha repetida elegível exige diagnostician fresh/read-only e correction step automático permanece desabilitado.
9. **AC-09:** OpenCode é adapter inicial e `/run-spec`, `/resume-spec`, `/review-spec` derivam de `.cursor/commands/` e chamam scripts em `scripts/workflow/`.
10. **AC-10:** `run` e `resume` exigem `--base-sha` explícito; revalidation usa essa base autoritativa em todos os triggers e invalida evidência sob qualquer drift relevante. SHAs documentais são apenas provenance.
11. **AC-11:** artifacts têm hash/provenance e são sanitizados antes de persistência, prompts, reports ou notifications.
12. **AC-12:** notifications opt-in usam resource ID e payload sanitizado; falha é registrada sem alterar acceptance.
13. **AC-13:** limite de cinco arquivos lógicos inclui todos os tipos; rename inequívoco conta um e ambíguo conta dois.
14. **AC-14:** reviewer/diagnostician são fresh/read-only; `critical` bloqueia imediatamente, `high` bloqueia e só pode ser correction eligible sob regras estruturadas com auto correction desabilitada, e todo `medium`/`low` é persistido no backlog humano.
15. **AC-15:** cada AC possui evidence refs válidas e cada step declara documentation impact ou justificativa `none`.
16. **AC-16:** acceptance local é determinística; com `autoCommit: false` aguarda commit humano em `AWAITING_COMMIT`, enquanto commit automático exige `autoCommit: true` + `--allow-commit`; resume reconcilia sem duplicar efeitos.
17. **AC-17:** a união exata dos global gates declarados, final review e global acceptance são obrigatórias na fase 1; falha não cria correction step automático.
18. **AC-18:** relatório/retrospectiva registram state, budget, retries, findings, evidence, docs impact, commits e outcomes sem secrets.
19. **AC-19:** PR é opt-in após sucesso global, nunca faz push e falha de pré-condição é acionável.
20. **AC-20:** suíte cobre caminho feliz, concorrência/lock, crash/resume, budgets, trust boundary e edge cases críticos.
21. **AC-21:** o adapter local de produção monta todos os módulos reais para `validate`, `run`, `resume` e `review`, preservando dependency injection para testes e eliminando capability placeholders no caminho default.
22. **AC-22:** lifecycle, template de handoff, README de steps, catálogo de commands e plugin manifest registram o pipeline e a regra absoluta de cinco arquivos lógicos, com rename inequívoco contado como um.
23. **AC-23:** CI executa instalação reproduzível com scripts desabilitados, audit bloqueante em severidade high e testes workflow; o verify local diagnostica dependências ausentes ou divergentes.

## Open questions

Não há questão bloqueante. Sandbox, paralelismo, adapters adicionais e merge queue permanecem futuras decisões arquiteturais.

## Implementation plan

1. Criar schemas de spec, step e state e o núcleo de validação Ajv/YAML.
2. Criar schemas de review, diagnosis e retrospective e validar findings/evidence.
3. Criar catálogos de gates/resources e fronteira segura de processos.
4. Criar entrypoints shell e parsing comum para run/resume/review.
5. Implementar DAG, state machine, runtime, lock atômico e ignore do runtime.
6. Implementar base/worktree/diff e limite de arquivos lógicos com rename inequívoco.
7. Implementar budget ledger, reservas, retries finitos e gatilho de diagnosis.
8. Integrar OpenCode ao orchestrator com sessões fresh e revalidation ao redor das chamadas.
9. Implementar artifacts, sanitização e retenção/provenance.
10. Implementar reviewer, diagnostician e findings backlog estruturado.
11. Implementar evidence por AC, implementation notes, documentation impact e acceptance local.
12. Implementar commit local por dupla autorização e resume idempotente.
13. Implementar integração, suíte, final review e global acceptance sem correction step automático.
14. Implementar relatório, retrospective, notifications e budgets observáveis.
15. Criar commands canônicos `/run-spec`, `/resume-spec` e `/review-spec` e validar geração OpenCode.
16. Implementar PR opcional sem push.
17. Fechar documentação durável, E2E e integração ao verify.
18. Montar o adapter local de produção e o wrapper de validate com wiring real e dependency injection para testes.
19. Alinhar lifecycle, handoff, índice de steps, catálogo de commands e plugin manifest gerado.
20. Adicionar CI reproduzível, audit high, testes workflow e gate local claro de dependências.
