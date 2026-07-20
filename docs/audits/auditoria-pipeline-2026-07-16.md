# Auditoria do pipeline automatizado — 2026-07-16

> **Status:** backlog ativo. Base auditada: `3881c01`; correções e segunda execução em `b883c04`.
>
> **Histórico deste documento** — cada revisão foi forçada por uma execução, não por releitura:
>
> | Revisão | O que mudou |
> |---|---|
> | Original | 20 achados por leitura + execução de módulos isolados |
> | Após o **1º run** (`59aa342`) | Falsificou "o pipeline nunca executou". +4 achados, um crítico |
> | Após o **2º run** (`b883c04`) | BUG-21/22/23 corrigidos e **verificados em campo**. +1 achado (BUG-25). O pipeline invoca agentes pela primeira vez |
> | Rodada de correções (`d77906f`) | BUG-01/02/11/25 corrigidos. +1 achado (BUG-26), exposto ao decidir a política do BUG-25. Nenhum Alta em aberto |
> | BUG-26 (`11d4523`) | Fechado com os tipos de erro do SDK do OpenCode. O retry deixa de ser código morto |
> | Spec descartável + runs 3–6 (`7f41912`) | **Falsificou "o pipeline invoca agentes"**: os runs 1–2 estavam travados num modelo em limite, não trabalhando. +3 achados (BUG-28/30/31), BUG-12 promovido de Baixa a bloqueante, BUG-09 promovido a Alta. Executor completa, gates passam sobre diff real, snapshot fechado é criado |
> | Runs 7–9 (`4588cdf`) | **Um step completou.** `acceptance: {ok: true}` → `AWAITING_COMMIT`. +2 achados (BUG-32/33), BUG-31/32/33 fechados. O run 9 não achou nada novo — primeira vez no dia |
> | Revisão de Baixa (`ade96b6`) | **Cinco dos meus achados não eram defeitos.** BUG-16/18/19/20/24 fechados sem correção; só BUG-13 era real. Abertos: 17 → 11 |
> | Migração do BUG-09 + revalidação e2e (2026-07-17) | **`SUCCEEDED` de novo, em `31a4c8c`, com agentes reais.** 6 garantias movidas para o caminho de produção, cada uma mutação-verificada. A migração achou o que a leitura não acha: **um dos 15 testes fixa comportamento errado** (seção 2). +1 achado (BUG-35): o gate `workflow-tests` roda 2 dos 17 arquivos de teste |
> | BUG-35 fechado | O gate `workflow-tests` passa a rodar os 17 arquivos, não 2. Provado com os dois args contra a mesma quebra: o antigo passa, o novo reprova. Abertos: 9 → 8 |
> | Ciclo completo (`71f0e84`) | **`SUCCEEDED`.** run → `AWAITING_COMMIT` → commit humano → `resume` → global review → relatório. +1 achado (BUG-34): o commit que o pipeline espera invalidava a identidade que o resume exige, e `autoCommit: false` é o default |
> | BUG-17 fechado (2026-07-17) | O id do gate `validate-spec` → **`specs-lint`**, espelhando `lint-specs.cjs` como os demais gates. Rename propagado a specs `approved`, steps, evidence `resultRef`, catálogo, testes e docs; `source.hash` recomputado nas 4 fontes cujo corpo mudou. `validate-spec.sh` (schema) mantém o nome. Abertos Baixa: 2 → 1 |

Escopo: os ~10.700 linhas de `scripts/workflow/` (orchestrator, local-adapter, DAG, budget,
runtime/lock, git/worktree, scope, process, opencode, sanitize, artifacts, evidence, findings,
review, report, notifications, pr, retry, state-machine, cli), `schemas/`, `workflow/*.yaml`,
`specs/automated-spec-pipeline.md` + seus 20 steps e os ADRs 015–018.

Método: leitura com arquivo:linha citada e execução real de comando. Achado sem evidência
verificável foi marcado como não confirmado, não preenchido por suposição.

---

## 1. Resumo executivo

| | |
|---|---|
| Corrigidos e verificados | 26 — **13 deles só descobríveis executando** |
| **Abertos** | **8** — 1 Alta, 5 Média, 2 Baixa |
| Risco estrutural (não é bug) | 2 |

**O pipeline completa de ponta a ponta** (`71f0e84`): `run` → executor → diff real → `scope` → gates
→ snapshot fechado → reviewer aprovado → `acceptance {ok: true}` → `AWAITING_COMMIT` → **commit
humano** → `resume` → `reconcileCommit` casando SHA, parent e tree contra a intenção persistida →
global review `approved` → `final-report.json` + `retrospective.yaml` → **`SUCCEEDED`**, lock
liberado, `main` intacta.

Custou **doze correções, todas encontradas executando e nenhuma lendo**.

**Revalidado em 2026-07-17, base `31a4c8c`** (`opencode 1.17.20`, os três papéis em
`opencode-go/grok-4.5`): o mesmo ciclo fechou em `SUCCEEDED` sem nenhuma correção nova. O
`reconcileCommit` recusou-se a ser carimbo — exigiu que o commit humano batesse com
`accepted-tree.json` em `parentSha`, `acceptedTreeSha`, `acceptedPaths`, `attemptId` e
`worktreeId`. O pipeline removeu o próprio worktree no `cleanupStep`. `main` intacta.

**Não exercitado, e portanto não provado:** `--allow-commit`, `--create-pr` (a spec smoke declara
ambos como não-objetivo) e todo o caminho de falha — executor que erra, retry, diagnostician. O que
está provado é o caminho feliz completo.

A evidência está no disco: `review.json`, `gate-*.json`, `accepted-tree.json`,
`executor-response.txt`, `findings-backlog.json`, `worktree-identity.json`, 10 registros de
revalidation e o snapshot fechado em `0400`. Cada garantia auditada no papel — lock atômico,
worktree por tentativa, isolamento do reviewer, limite de escopo, evidência por AC, dupla
autorização — existe como artefato, não só como código.

**O run 9 não encontrou nada novo — a primeira vez no dia.** A camada nunca exercitada tinha dez
bugs e acabou. Um step real leva ~1 minuto.

> **Correção de uma afirmação anterior deste relatório.** A revisão do 2º run dizia *"o pipeline
> invoca agentes… o executor trabalhou 29 minutos"*. **Falso.** O processo estava vivo e parado:
> `stdoutBytes: 0` em 1.335.424 ms. O modelo da máquina (`openai/gpt-5.5`) estava em limite de uso e
> o OpenCode reintentava internamente, em silêncio, até o timeout. Interpretei "processo vivo" como
> "agente trabalhando" sem evidência. A causa não estava no pipeline e nenhuma leitura a encontraria
> — veio de o operador dizer que o modelo estava em limite.

Nenhum achado aberto corrompe dado nem abre brecha de segurança; todos falham fechado. O único Alta
é o BUG-09, que não é um defeito e sim a **fábrica** deles: quatro vezes esta auditoria achou a
lógica correta escrita e inalcançável nele.

Os quatro pontos que a validação de mercado anterior destacou como críticos — isolamento do
reviewer, limite de 5 arquivos, commit controlado e detecção de ciclo no DAG — **se sustentam
sob evidência linha a linha**. Ver seção 5.

O padrão que liga quase todos os achados: **testes verdes conviviam com um pipeline
inoperante**, porque todo teste injeta um fake exatamente em `runProcess` — a fronteira onde a
variável quebrava. Nenhuma leitura de código encontrou isso; `opencode.cjs:87-106` foi lido três
vezes nesta auditoria e as nove linhas parecem corretas. Pior: `test-opencode.cjs:102` **afirmava**
`OPENCODE_DISABLE_DEFAULT_PLUGINS === 'true'` — o teste não só deixou passar, ele **travava o bug no
lugar**, e teria reprovado a correção. Foi preciso rodar.

O mesmo padrão se repetiu nas correções: `findAgentResponse` real não tinha teste (só um fake em
`test-opencode.cjs:79`), e três testes construíam `verdict: 'pass'` — forma que o schema do reviewer
não define. **Um teste que afirma a implementação não é rede; é âncora.**

---

## 2. Abertos — Alta

### BUG-09 · `createOrchestrator` é uma implementação paralela não usada
*(Terceira redação. A primeira listava quatro "lógicas corretas inalcançáveis" nele — **duas eram
invenção minha**. A segunda tratava os 15 testes como garantias a preservar. A migração provou que
**pelo menos um deles fixa o comportamento errado**, e isso muda a decisão de novo.)*

`grep -rn "createOrchestrator({" scripts/workflow/test-*.cjs` → **9 instanciações** em 7 arquivos.
Zero em produção, que vai por `cli.cjs` → `run` → `executeWorkflow` → `processStep`. Removê-lo
derruba **15 testes** — medido em 2026-07-17 removendo o export e contando, não estimado.

**O que a migração descobriu, e nenhuma leitura acharia.** O teste *"budget and drift block before
the call"* afirma que uma chamada que não aconteceu tem a reserva **liberada**
(`budget:reconcile:released`). Produção **consome** (`local-adapter.cjs:999`). São opostos, e
**produção está certa**: liberar no erro faria um agente que falha em toda chamada retentar para
sempre dentro do orçamento — `maxAgentCalls` deixaria de limitar coisa alguma.

A prova é a mutação que mata o teste novo: trocar `consumed` por `released` — literalmente
transformar produção no `createOrchestrator`.

Isto reclassifica o achado inteiro. Os 15 testes **não são cobertura perdida esperando resgate**.
São o quarto caso desta auditoria de **teste que prende o bug em vez de pegá-lo** — junto com
`test-opencode.cjs:102` (`OPENCODE_DISABLE_DEFAULT_PLUGINS`), os três `verdict: 'pass'` e o
`'executor complete'`.

**Progresso da migração (opção 3, escolhida pelo operador; commits `4e77b74`, `7b9a5b2`, `23a9f1a`,
`31a4c8c`):** 6 garantias no caminho de produção, **cada uma mutação-verificada** — o teste foi
confirmado falhando quando a garantia quebra, e a mutação foi confirmada parseando (`node --check`),
porque mutação que quebra sintaxe mata o teste sem provar nada.

| Garantia | Destino | Mutação que a mata |
|---|---|---|
| Dupla autorização | `orchestrator.run` (`:837`) | `&&` → `\|\|` |
| Ordem DAG | `dag.cjs` via `test-state.cjs` | `order.map(...)` → `[...byId.values()]` |
| Step fora de contrato não chega ao global | `orchestrator.resume` (`:938`) | `:938` aceitar as duas grafias |
| Gate global falho bloqueia | `orchestrator.run` (`:955-968`) | 3 mutações, todas mortas |
| Budget bloqueia antes da chamada | `local-adapter` (`:951`) | remover o throw |
| Falha consome a reserva | `local-adapter` (`:999`) | `consumed` → `released` |

**Três categorias de garantia**, e confundi-las me custou dois erros seguidos:
1. **Estrutural** — imposta por construção (`dag.cjs:101` monta `steps` de `topologicalOrder`). O
   teste vai na camada que constrói. `dag.steps` podia divergir de `dag.order` e executar steps fora
   de ordem de dependência **com a suíte inteira verde** — lacuna real, fechada.
2. **Imposta por schema** — step nunca chega com `'committed'` minúsculo porque `readRunState` valida
   contra `state.schema.json`.
3. **Defesa em fronteira sem validação** — `orchestrator.cjs:938`. Declarei-a inalcançável por
   enumeração do fluxo e **estava errado**: `:772` devolve o que o **adapter** entrega, e nada valida
   o retorno do adapter. Provado com adapter rodando. Enumerar caminhos não é prova.

**Restam 12 dos 15** — medido removendo o export e contando, não estimado. *(Uma revisão anterior
desta seção dizia 9. Errado: contei 6 garantias migradas e subtraí de 15, conflando garantia com
teste — duas garantias saíram de um mesmo teste, duas vezes.)*

**3 já apagados**, e a redundância foi provada antes de apagar: com os antigos fora, as mutações que
eles pegavam continuam sendo pegas pelos migrados (`&&`→`||`, `order.map`→`byId.values()`, gate falho
que não bloqueia). "A suíte passa sem eles" não teria provado nada — provaria só que ninguém mais os
chamava.

Dos 12: ~3 no `orchestrator.run` (PR, acceptance global, reconcile de commit) e ~9 no `local-adapter`
(drift, resume por operationId, timeout/retry, artefatos, acceptance local, ciclos de review). O
harness dos dois lados já existe (`singleStepRun`, `attemptFixture`).

**O gargalo não é escrever o teste** — é descobrir onde a garantia mora em produção. `createOrchestrator`
valida `steps`/`dag` defensivamente porque um chamador os entrega; produção os constrói.

**Pré-requisito resolvido:** o BUG-35 (o gate rodava 2 dos 17 arquivos) está fechado, então as 6
garantias já migradas — e as 9 que faltam — agora reprovam o pipeline quando quebram. Antes disso, a
migração era investimento num lugar que o gate não olhava.

---

## 3. Abertos — Média

### BUG-04 · `boundaries` e `invariants` afirmados sem verificação
`local-adapter.cjs:1235` `allowed: true, boundaries: true, invariants: true` e `:1421` no global.
`acceptance.cjs:54-56` e `:110` checam esses campos — logo nunca falham. `allowed: true` é
*acurado* (`scope.cjs` já lançou antes). Mas `scope.cjs:92-100` só valida que `inScope`/`outOfScope`
são strings não-vazias; **nada verifica que os invariants valem**. É a única asserção sobre
verticalidade no caminho de produção, e é uma constante. Quem *pode* julgar isso é o reviewer, e ele
já recebe (`review.cjs:107-108`) — a correção provável é **deletar** o check, não implementá-lo.

### BUG-05 · `appendFindingsBacklog` não é idempotente
`findings.cjs:85` `existing.occurrences.push(...normalized.occurrences)` sem deduplicar por
`reviewId`. Executado:
```
1a chamada -> occurrences = 1
2a idem    -> occurrences = 2 [{"reviewId":"rev-1",…},{"reviewId":"rev-1",…}]
```
**Gatilho NÃO CONFIRMADO:** o call site de produção (`local-adapter.cjs:1131`) não passa `previous`,
então lá não dispara. Quem passa é `review.cjs:206`. Falta teste que exercite reprocessamento da
mesma operação.

### BUG-06 · Dois call sites de `appendFindingsBacklog` com contratos diferentes
`review.cjs:206` passa `previous: input.previousFindings`; `local-adapter.cjs:1131` **não passa** →
`findings.cjs:113` cai em `[]`. Pelo caminho do adapter o backlog **nunca acumula** entre reviews:
toda a máquina de merge/dedup/occurrences é inerte.

### BUG-07 · `validateEvidenceMap` roda duas vezes com rigor diferente
`acceptance.cjs:74-79` chama **sem** `expectedContext` → `evidence.cjs:32`
`if (!expected …) return true` pula toda a ligação de provenance. `local-adapter.cjs:1261` chama
**com** contexto completo e `:1275` rejeita com `AC_EVIDENCE_PROVENANCE_INVALID`. A verificação real
acontece — mas quem ler `acceptance.cjs` isolado conclui que provenance é checada ali, e não é.

### BUG-08 · `classification` nomeia dois conceitos disjuntos
Categoria de gate: `catalogs.cjs:33` `enum: ['validation','test','pack','generated-artifact','revalidation']`,
consumida em `orchestrator.cjs:922`. Classe de falha: `retry.cjs:11-23` (`transient`, `deterministic`,
`drift`…). Os dois sentidos convivem a ~100 linhas no mesmo arquivo.

## 4. Abertos — Baixa

| # | Achado | Onde |
|---|---|---|
| BUG-15 | `command()` hardcoda `envAllowlist: ['HOME','PATH','TMPDIR']` enquanto `opencode.cjs:214` e `runGate` (`:1048`) leem do catálogo. Sem divergência de efeito hoje | `local-adapter.cjs:342` |
| ~~BUG-17~~ | **Fechado (2026-07-17).** Gate id `validate-spec` renomeado para `specs-lint`, espelhando `lint-specs.cjs`. Ver o log no topo | `gates.yaml:3` |

---

## 5. Pontos críticos — confirmados

Registrados com evidência porque foram destacados na validação de mercado anterior.

- **Isolamento do reviewer — real.** Processo separado por chamada (`opencode.cjs:229`, sem
  `--session`/`--continue` em lugar nenhum), `edit: {'*':'deny'}` para não-executor (`:52-59`),
  `assertResource` exige `readOnly: true` (`:197-199`), verificação pós-chamada em
  `orchestrator.cjs:1009` (`READ_ONLY_MUTATION`).
- **Limite de 5 arquivos — bloqueio automático.** `scope.cjs:104-106` lança
  `SCOPE_LOGICAL_FILE_LIMIT`; chamado em `orchestrator.cjs:778-787` entre diff e gates. Executado:
  6 arquivos → bloqueado; rename `R100` → `logicalFileCount = 1`.
- **Commit controlado — lista explícita.** `git.cjs:260` `['add', '--', ...acceptedPaths]`, com
  igualdade exata staged↔accepted (`:261-265`) e índice vazio exigido (`:258`). Zero ocorrências de
  `git add .`/`-A`/`--all` no repo.
- **DAG — Kahn real.** `dag.cjs:64-88` com detecção de ciclo; `test-state.cjs:102` prova que a ordem
  independe da declaração. Ressalva: o DAG real da spec é uma corrente linear (1→2→…→20); a
  capacidade de grafo só é exercitada por fixtures.
- **Falha de gate bloqueia.** `orchestrator.cjs:792` lança `STEP_GATE_FAILED`; `retryDecision` →
  `{"retry":false,"nextAction":"BLOCKED","reason":"NON_RETRYABLE"}`.
- **Escrita atômica durável.** `runtime.cjs:111-120`: `openSync 'wx'` → `fsync(fd)` → `rename` →
  `fsync` do diretório. Lock via `mkdirSync` (`:254`), primitiva atômica correta.
- **CI cumpre o AC-23.** `lint.yml`: `npm ci --ignore-scripts`, `npm audit --audit-level=high`,
  `npm run test:workflow`, Node 22.

---

## 6. Risco estrutural — a causa dos bugs

**R-01 · O pipeline completa; falta o que é opt-in.** *(Reescrito **cinco** vezes num dia: "nunca
executou" → "falhou no primeiro agent call" → "invoca agentes" (falso) → "o executor completa" → "um
step completou". Cada versão foi falsificada por uma execução, nenhuma por releitura. É o argumento
mais forte deste relatório contra o próprio método dele.)*

**Exercitado em campo, ciclo completo:** lock, worktree, state machine, revalidation nos gatilhos,
executor, diff real, `scope`, gates, snapshot fechado, reviewer, evidência por AC, acceptance,
`AWAITING_COMMIT`, commit humano, `reconcileStep`, `reconcileCommit`, reconciliação de reservas de
budget (que é onde vive o BUG-01, agora com prova de campo), global review, global acceptance,
`final-report.json`, `retrospective.yaml`, `SUCCEEDED`, lock liberado.

**Sem evidência de campo:** commit automático (`--allow-commit`) e PR — os dois opt-in, e o segundo
nunca faz push por contrato.

**R-02 · Os testes cobrem módulos; ninguém cobre a composição.** — **confirmado em campo.** Os 138
testes injetam fake exatamente onde os bugs moram: `runProcess` (`test-opencode.cjs:111`), o clock
(`options.now`), `fakeAdapter` (`test-e2e.cjs:23`). Sete arquivos importam `createOrchestrator`;
**zero** exercita `processStep`.

> **Este risco deixou de ser hipótese.** 138 testes verdes conviviam com um pipeline que não
> conseguia invocar um agente sequer (BUG-21). A variável quebrava dentro de `runProcess` — o
> ponto exato onde todo teste injeta um fake. `opencode.cjs:87-106` foi lido três vezes nesta
> auditoria sem que o defeito aparecesse: as nove linhas parecem corretas. Só a execução achou.
>
> Os outros bugs de campo — EPIPE, elapsed comendo espera humana, `findAgentResponse` — são da
> mesma família: reconciliação, spawn e relógio. Tudo o que o fake substitui.

---

## 7. Corrigidos e verificados — não reabrir

### Verificados em campo, por execução real (`b883c04`)

Os três foram corrigidos e provados pelo 2º run, não por teste com fake.

| Achado | Fix | Prova de campo |
|---|---|---|
| **BUG-21** · `OPENCODE_DISABLE_DEFAULT_PLUGINS` impedia todo agent call | Removida do override **e** do `INTERNAL_ENV` — no allowlist, um valor ambiente reintroduziria o bug via `minimalEnvironment`. A intenção "sem plugins" fica em `config.plugin` (`opencode.cjs:91`), que não quebra | ⚠️ **A prova de campo original era falsa.** Escrevi "duas invocações reais; executor ativo 29 min": o processo estava vivo e **parado** (`stdoutBytes: 0` em 1.335.424 ms), travado no modelo em limite. O fix é correto — sem ele o OpenCode falha em ~5 s com erro estruturado — mas o que ele destravou só apareceu depois do BUG-28 |
| **BUG-22** · `run-spec.sh` saía 0 num run bloqueado | `cli.cjs`: `return result?.ok === false ? 1 : 0` | 2º run: `EXIT=1` com `ok:false`. 1º run: `EXIT=0` |
| **BUG-23** · Diagnóstico descartado três vezes | `failureDiagnostics()` extrai o evento de erro estruturado do stdout, com fallback para excerto — tudo por `sanitize`. Os 5 returns bloqueados do orchestrator carregam `cause` sanitizada | 2º run trouxe `cause: { process: {signal:"SIGTERM", timedOut:false, durationMs:13459…}, retry: {nextAction:"BLOCKED", reason:"NON_RETRYABLE", classification:"deterministic"} }`. Antes: só o código |

> **Os dois testes que falharam ao corrigir o BUG-21 são o achado mais importante desta auditoria.**
> `test-opencode.cjs:102` afirmava `OPENCODE_DISABLE_DEFAULT_PLUGINS === 'true'` — três linhas abaixo
> de `assert.deepEqual(config.plugin, [])`, que já testava a intenção real. O teste não só deixou o
> bug passar: ele o **prendia no lugar** e teria reprovado a correção. Foram invertidos para afirmar
> a **ausência**, virando guarda de regressão.
>
> Contraste no mesmo arquivo: `:123-124` (`args.includes('--continue') === false`, idem `--session`)
> testam **comportamento** — isolamento real do reviewer — e resistem a refatoração. `:102` e `:128`
> não testavam nada além de si mesmas.

### Ciclo completo (`71f0e84`) — o fluxo default nunca poderia funcionar

| Achado | Fix | Prova |
|---|---|---|
| **BUG-34** · O commit humano invalidava a identidade que o resume exige | A identidade hasheia a árvore de trabalho, então o commit que `AWAITING_COMMIT` espera é **o que a muda**: arquivo staged antes, árvore limpa depois. `commitStep` (auto) regravava a identidade após o próprio commit (`:1302-1306`); `reconcileStep` (humano) **nunca**. Agora regrava — mas só **depois** do `reconcileCommit`, que acabou de provar que o commit carrega exatamente o parent, a tree e os paths que a acceptance aprovou. Regravar antes aceitaria qualquer worktree | Resume anterior: `REVALIDATION_DRIFT`, `identity: false`. Depois: `SUCCEEDED`, `commit.status: "reconciled"` |

**`autoCommit: false` é o default da spec.** O caminho excepcional (`--allow-commit`) funcionava; o
padrão — parar, esperar o humano, retomar — não. É a **quarta** assimetria do dia entre o caminho que
os testes exercitam e o que produção toma, e só apareceu porque um step chegou a `AWAITING_COMMIT`,
o que exigiu as onze correções anteriores.

### BUG-35 — o gate de teste passava a ignorar 15 dos 17 arquivos

`workflow/gates.yaml:14` mandava o gate `workflow-tests` rodar dois arquivos. O
`package.json` já definia a suíte inteira (`test:workflow: node --test scripts/workflow/test-*.cjs`)
— **as duas definições tinham divergido**, e a que o pipeline consulta era a menor.

Corrigido para `args: [--test, scripts/workflow/test-*.cjs]`. O `node` expande o glob sozinho; não
depende de shell, e o gate roda com `shell: false`.

**Provado quebrando um teste em `test-e2e.cjs` — arquivo que o gate antigo ignorava — e rodando os
dois args contra a mesma quebra:**

| Args | Resultado |
|---|---|
| Antigos (2 arquivos) | `exit: 0` → **gate passa com o teste quebrado** |
| Novos (glob, 17) | `exit: 1` → **gate reprova** |

Verificado antes de aplicar, porque a correção tinha três modos de falhar em silêncio:
- **Catálogo:** o glob sobrevive ao YAML e ao schema — `args` carrega como
  `["--test","scripts/workflow/test-*.cjs"]`, string intacta.
- **Worktree:** o gate roda do worktree (`gateExecutionLocation` recusa o checkout principal), e
  `git worktree` não copia `node_modules`. A suíte roda mesmo assim: o worktree fica **dentro** do
  repo, então a resolução de módulo do node sobe e acha o `node_modules` da raiz. 149/149 num
  worktree real. Se o worktree fosse fora do repo, isto quebraria.
- **Ambiente:** `createGateEnvironment` sandboxa `HOME` e `TMPDIR`, e a allowlist é
  `[HOME, PATH, TMPDIR]`. As fixtures criam repos git via `os.tmpdir()`, que lê `TMPDIR`. 149/149
  sob o ambiente restrito.

**Custo aceito:** o gate passa de ~1s para ~30s, contra `timeoutMs: 120000` — folga de 4×. Numa spec
de 20 steps que declare este gate, são ~10 min de gate. Um gate de teste que não roda os testes custa
menos e não vale nada.

**O que isto fecha:** era a metade que faltava da pergunta central desta auditoria — *por que 143
testes verdes conviviam com um pipeline inoperante*. A metade documentada era que todo teste injeta
fake em `runProcess`. Esta é que **a maior parte da suíte não rodava onde decide**.

### BUG-10 (`d3a17e7`+) — gates globais inventados

| Achado | Fix | Prova |
|---|---|---|
| **BUG-10** · Fallback rodava gates que ninguem declarou | O AC-17 diz que os global gates sao **exatamente** a uniao de `testing.gateIds` dos steps requeridos. Quando a uniao era vazia, `orchestrator.cjs:943-944` inventava um conjunto filtrando o catalogo por `classification`. **O cenario e alcancavel** — testado: o schema aceita `testing.required: false`. Fallback removido: sem uniao declarada nao ha gate global, e a acceptance bloqueia | Nenhuma spec real dependia dele (todas declaram `required: true`). Teste novo fixa a regra: uniao vazia -> `GLOBAL_GATE_FAILED` |

### Fechados sem correção — a premissa do achado era falsa

Reexaminados um a um antes de tocar no código. **Sete dos meus achados não eram defeitos** — seis de Baixa e o BUG-03, de Média;
"corrigi-los" teria sido churn, e num caso teria quebrado a política do repositório.

| Achado original | Por que não é defeito |
|---|---|
| **BUG-24** · `processMetadata` sem stdout/stderr | **Já resolvido pelo fix do BUG-23.** `failureDiagnostics` leva `event`, `stdout` e `stderr` sanitizados ao `details`, e `blockedCause` os entrega. A premissa ("o texto não estaria lá") deixou de ser verdade. Coberto agora por teste, inclusive a redação do segredo |
| **BUG-16** · `sanitize` roda duas vezes em `findings.cjs` | As duas chamadas checam **limites diferentes**: uma por finding (`:71`), outra do backlog inteiro (`:125`). Um finding pode caber e o backlog não. O único desperdício é a segunda passada de redação, que `sanitize.cjs:28` já impede de duplicar com `(?!\[REDACTED)`. Evitá-la exigiria partir a API do `sanitize` em redigir/medir — mais superfície, zero corretude |
| **BUG-18** · ADR 016 `Accepted` com supersedência só no 018 | **É a política.** `specs/automated-spec-pipeline.md:200`: *"ADRs Accepted não são editados. A correção da política de rename é registrada pelo ADR 018, que supersede o ADR 016."* ADR aceito é registro histórico; a supersedência mora no mais novo. Reportei a regra como defeito |
| **BUG-19** · Gate `agent-templates-check` órfão | `gates.yaml` é catálogo de gates **disponíveis**, não de gates usados: o AC-17 deriva a união dos `testing.gateIds` dos **steps**. `scripts/build-agent-templates.cjs` existe e funciona. Chamei um catálogo de órfão |
| **BUG-20** · `boundaries.maxLogicalFiles` não é lido | O schema é `"maxLogicalFiles": { "const": 5 }` — testado: rejeita 3 e 8, aceita só 5. O campo **não pode** divergir de `scope.cjs:6`. Não é limite inerte: é o contrato declarando o invariante |
| **BUG-14** · AC sem `evidence[]` aceita qualquer record | O schema resolve para `required: ["id","evidence"]` com `evidence.minItems: 1`. Testado: AC sem `evidence` e com `evidence: []` sao **rejeitados**. O ramo em `evidence.cjs:129` e inalcancavel para um step valido. Quase reportei "alcancavel" olhando `required: undefined` — que era o `$ref` nao resolvido |
| **BUG-03** · `awaiting_human` colapsa em `LOCAL_ACCEPTANCE_REJECTED` | **Falso.** `processStep:828-834` ja devolve `AWAITING_HUMAN` com o `cause`, e `executeWorkflow:932` retorna `ACCEPTANCE_AWAITING_HUMAN`. `test-e2e.cjs:228` cobre e passa — inclusive antes de eu tocar em nada. **Escrevi um bloco duplicado para "corrigir" isto e revertit**: teria criado dois caminhos para a mesma coisa, que e a doenca descrita pelo proprio BUG-09 |

**BUG-13** foi o único real da leva, e virou correção: o ramo `[OPAQUE OUTPUT OMITTED]` substituía
silenciosamente conteúdo que o caller declarou JSON. Um caller que declara JSON e manda outra coisa
tem um bug, e o módulo lança em todo o resto que não consegue preservar (`:123`, `:139`). Agora lança
também aqui — a substituição escondia exatamente a evidência de quem fosse procurar o defeito.

### Runs 7–9 — o step completo (`851b7bb`, `021d180`, `4588cdf`)

Cada um destes só apareceu porque o anterior foi corrigido. Nenhum era hipótese antes de rodar.

| Achado | Fix | Prova |
|---|---|---|
| **BUG-31** · Resposta que falha ao parsear era descartada | `sanitizeJsonDocument` rodava antes de `preserve`, então o run 6 chamou o reviewer duas vezes e não guardou nenhuma resposta. Agora é preservada antes de relançar, sob kind próprio fora de `AGENT_RESPONSE_KINDS` — reconciliação nunca retoma de uma resposta inválida — e falhar ao registrar nunca mascara a falha real | Run 8 gravou `agent-response-invalid.txt` na **primeira** execução, e foi ele que entregou o BUG-33 |
| **BUG-32** · Nota de implementação julgada contra o commit em execução | `acceptance` comparava `note.baseSha` com o `--base-sha` da CLI, então **toda nota virava inválida assim que o HEAD andava** — a spec do próprio pipeline jamais poderia ser aceita (notas em `86872302`). A NOTE-03 é explícita: é provenance informativa. Agora compara com `spec.source.baseSha`, como `validateSemantics` já fazia | Run 7 morreu em `IMPLEMENTATION_NOTE_INVALID`; run 8 passou. O check de staleness segue vivo |
| **BUG-33** · Preâmbulo do modelo derrubava um review correto | O reviewer emitiu dois eventos `text` — *"Vou analisar o snapshot fechado…"* e o documento — e `parseEvents` concatena todos. O JSON estava **perfeito**. Saída constrangida por schema é [feature request aberta no OpenCode](https://github.com/anomalyco/opencode/issues/10456), então o parser é que segura: o documento é recuperado de comentário ou code fence e entregue ao mesmo validador | Run 9: `acceptance {ok: true}` → `AWAITING_COMMIT`. Teste usa as quatro formas reais, incluindo o preâmbulo verbatim |

**Os dois fixes de observabilidade do dia pagaram o dia.** O BUG-23 produziu o `stdoutBytes: 0` que
derrubou a afirmação deste relatório de que o pipeline invocava agentes. O BUG-31 produziu, na
primeira execução, o preâmbulo que era o BUG-33. Guardar a evidência da falha entregou o diagnóstico
seguinte em minutos, duas vezes.

### Rodada da spec descartável (`4a444e2`, `7460d05`, `7f41912`)

Os três só foram encontrados executando, e cada um escondia o seguinte.

| Achado | Fix | Prova |
|---|---|---|
| **BUG-28** · O pipeline não tinha onde declarar modelo | `OPENCODE_CONFIG_CONTENT` substitui a config da máquina, modelo incluído, e não declarava nenhum. Cada agente do catálogo agora carrega o seu, passado como `--model` no argv — visível na evidência do processo. Agente sem modelo falha fechado com `OPENCODE_MODEL_REQUIRED` | Com modelo: `write -> completed` e arquivo no disco. Sem: 22 min e `stdoutBytes: 0` |
| **BUG-12** · Resposta do executor exigia JSON | *(Era **Baixa** no relatório original: "string mágica de teste… existe só para dois testes passarem". Estava três níveis errado — era a **única** entrada que o produto aceitava.)* O prompt pede prosa, `parseEvents` devolve texto, e `artifacts.cjs` exigia JSON. Só `'executor complete'` passava, e só dois testes a emitem. Executor agora é preservado como texto, que é o que `KIND_FILES` já declarava | Run 5: `attempts=[{st:"succeeded",role:"executor"}]`, `executor-response.txt`, 2 `gate-result` |
| **BUG-30** · Reviewer e diagnostician nunca souberam do schema | `structuredPrompt` recebia `role` e ignorava: os três papéis recebiam as mesmas instruções, que pedem prosa. O prompt agora embute o **schema real** (o mesmo arquivo que `parseRoleOutput` valida) para quem é parseado contra um, mais a regra de que `decision` é derivado de `findings` | Reviewer isolado contra o snapshot real do run 6: `{"decision":"approved","findings":[],"confidence":"high"}`, JSON válido |

**Ordem em que destravaram:** BUG-28 fez o agente rodar → BUG-12 fez a resposta dele sobreviver →
gates rodaram sobre diff real → snapshot fechado foi criado → BUG-30 fez o reviewer responder. Cada
um era invisível enquanto o anterior existisse.

### Rodada de correções (`dedda0b`, `f929532`, `d77906f`)

| Achado | Fix | Prova |
|---|---|---|
| **BUG-01** · `findAgentResponse` cego para reviewer/diagnostician | Fonte única para o kind: quem escreve e quem procura leem o mesmo mapa, em vez de a busca adivinhar um sufixo | Teste novo cobre os 3 papéis contra o store real e **falha na implementação anterior** — verificado reintroduzindo a regex. `findAgentResponse` real não tinha teste algum; só existia como fake em `test-opencode.cjs:79` |
| **BUG-02** · `requiredGateIds` tautológico | Local lê `step.verification.gateIds`; global recebe a união declarada do orchestrator | `gate declarado ausente -> GATE_FAILED? SIM (check vivo)`. Só a review read-only de snapshot, que não aceita nada, mantém o fallback |
| **BUG-11** · `verdict: 'pass'` fora do schema | `APPROVING_DECISIONS` compartilhado entre local e global; só `decision` | `verdict:pass -> REJEITADO`. Três testes construíam essa forma fictícia; migrados para `decision` |
| **BUG-25** · Timeout reintentava | `TIMEOUT` terminal com classificação própria `timeout` | `TIMEOUT -> timeout \| retry: false \| BLOCKED`; `RATE_LIMITED -> transient \| retry: true \| RETRY`. ⚠️ **O diagnóstico original estava errado**: escrevi "o agente delibera até o timeout contra um contrato satisfeito". Ele não deliberava — estava travado no modelo em limite (`stdoutBytes: 0`). A decisão do operador segue certa, por um motivo melhor: reintentar um processo que nunca emitiu um byte não o fará emitir |

O valor de 30 min do timeout foi **deliberadamente não alterado**: há um único ponto de dado, de um
step degenerado, e nenhum step jamais completou. Dimensionar sem isso é chutar.

### BUG-26 (`11d4523`) — o retry deixa de ser código morto

O `opencode` **já classifica as próprias falhas**; o pipeline nunca perguntou. Os tipos do SDK
definem `ApiError` com `isRetryable: boolean` **obrigatório** e `statusCode` opcional, e
`ProviderAuthError` como forma própria. O adapter passou a ler esse veredito do evento estruturado e
carregá-lo até a política de retry.

| Entrada (forma real do SDK) | Classificação | Retry |
|---|---|---|
| `ApiError` `isRetryable: true`, 429 | `transient` | **sim** |
| `ApiError` `isRetryable: true`, 503 | `transient` | **sim** |
| `ApiError` `isRetryable: false`, 400 | `deterministic` | não |
| `ApiError` `isRetryable: false`, **429** | `deterministic` | não — o "não" do provider vence o status |
| `ProviderAuthError` | `authorization` | não — nenhuma chave vira válida por insistência |
| `UnknownError` (amostra do 2º run) | `deterministic` | não — não traz veredito |
| `TIMEOUT` com `isRetryable: true` | `timeout` | não — a política do BUG-25 prevalece |

`maxAttemptsPerStep`, o diagnostician, `RETRY_PENDING`, `DIAGNOSING` e o fingerprint passam a ter um
caso real. O teste usa as formas do SDK verbatim, incluindo a amostra que o run emitiu, e **falha na
implementação anterior**; `parseEvents` não tinha teste algum.

**Grau da evidência: teste, não campo.** O caminho só dispara num 429 real, que não foi provocado.

### Verificados por execução de módulo

| Achado | Verificação |
|---|---|
| EPIPE não capturado → crash + lock vazado | `resolveu: ok=false \| status=spawn_error \| error=EPIPE` (antes: `UNCAUGHT EXCEPTION`). **Reconfirmado em campo:** nos dois runs o processo falhou sem crashar e o lock foi liberado pelo `finally` |
| Elapsed contando espera humana (default `autoCommit:false`) | `T0+3h -> ok` (antes: `BLOCKED BUDGET_EXCEEDED metric=elapsedMinutes scope=step`) |
| Elapsed wall-clock em vez de tempo ativo | `activeMsByStep`/`totalActiveMs`/`segmentStartedAtMs` + `pauseBudget` |
| `sanitize` vazando chaves em sufixo | 11/11 sondas redigidas |
| `sanitize` vazando `apikey`/`privatekey` em prefixo/infixo | `apiKeyName`, `x_api_key_backup`, `privateKeyPath` → redigidos |
| `pr.cjs` injetando `GH_TOKEN`/`GITHUB_TOKEN`/`SSH_AUTH_SOCK` fora do catálogo | resolve `gitResource`/`ghResource` validados; `ENV_ALLOWLIST` hardcoded removido |
| Toda falha classificada `deterministic` | `processStep:827` usa `failureFrom`; `drift` e `trust-boundary` chegam a produção. **Residual:** `scope`, `gate`, `schema`, `budget`, `sanitization` seguem declarados em `TERMINAL_CLASSIFICATIONS` e nunca produzidos (sem efeito de fluxo — todos já são `retryable:false`) |
| `publicContractChanged` inalcançável | zero ocorrências; `documentationImpact` real preservado |

Commits: `9a0807f` (correções), `d73d470` + `3881c01` (tríade manual de verificação).

---

## 8. Runbook — primeira execução

### Pré-condições (confirmadas em 2026-07-16)

| Requisito | Estado |
|---|---|
| `opencode` ≥ 1.1.1 (`opencode.cjs:6`) | ✅ 1.17.20 |
| Node ≥ 22.5 (`package.json`) | ✅ v26.5.0 |
| Catálogos commitados no base SHA — são lidos **do Git** | ✅ |
| `.workflow-runtime/` ignorado | ✅ |
| Árvore limpa (`git.cjs:99` `assertClean`) | obrigatório |
| Sem worktree residual (`git worktree list`) | obrigatório |
| **Modelo do agente disponível e fora de limite** | obrigatório — `workflow/resources.yaml` declara um por agente. Um modelo em limite não devolve erro: o OpenCode reintenta em silêncio e o processo fica parado até o timeout, com `stdoutBytes: 0`. Foi o que consumiu 22 e 29 minutos em dois runs. Confira com `opencode run --model <id> "say ok"` antes |

### Degrau 1 — validate (leitura pura, sem base)

```bash
bash scripts/workflow/validate-spec.sh specs/automated-spec-pipeline.md
```
Verificado: exit=0. Valida frontmatter, schemas, DAG, provenance e catálogos. Não pede
`--base-sha`, não pega lock.

### Degrau 2 — dry-run (não toca em nada)

```bash
bash scripts/workflow/run-spec.sh specs/automated-spec-pipeline.md --dry-run
```
Verificado: exit=0, 20 steps, `.workflow-runtime` **não criado**, árvore limpa.

Seguro por construção: `orchestrator.cjs:864-868` retorna **antes** do adapter, do preflight e do
lock. `validate:671` dispensa `--base-sha` no dry-run. Ele reporta `baseSha=86872302` — o
documentado, não o HEAD: sem `--base-sha` não existe autoridade de mutação.

### Degrau 3 — execução real, sem commit

```bash
bash scripts/workflow/run-spec.sh specs/automated-spec-pipeline.md --base-sha $(git rev-parse HEAD)
```

O `--base-sha` **precisa ser o HEAD atual**: `git.cjs:107` exige que branch aprovada, SHA e HEAD do
worktree principal sejam o mesmo commit (`GIT_BASE_MISMATCH`).

Sem `--allow-commit` não há commit: `orchestrator.cjs:815` exige `autoCommit === true` **e**
`allowCommit === true`, e a spec tem `autoCommit: false`. A execução para em `AWAITING_COMMIT`.
**Não passe `--allow-commit` nem `--create-pr` na primeira vez.**

O `86872302` documentado não atrapalha: `orchestrator.cjs:571` só confere consistência interna entre
`source.baseSha`, `approval.baseSha`, notes e steps. NOTE-03 é literal: documento é provenance, CLI
é autoridade.

### Ressalva — este run é degenerado

Os 20 steps já estão implementados. O executor receberá o contrato do step-1 num worktree onde os
arquivos já existem; provavelmente não mudará nada, e a acceptance pode reprovar por falta de
evidência de AC.

**Isso não invalida o teste.** O valor do primeiro run é exercitar o *encanamento*: lock → worktree
→ **spawn real do `opencode` com o prompt completo** → gates → **spawn do reviewer em sessão
fresca** → acceptance → `AWAITING_COMMIT`. É onde os bugs moravam.

Um teste não-degenerado exige spec descartável que passe por `spec.schema.json`, `lint-specs.cjs`,
paridade Implementation plan ↔ steps (`orchestrator.cjs:578`) e `source.hash === bodyHash` (`:558`).

### Resultado do degrau 3 — executado em 2026-07-16

Executado sobre `59aa342`, com árvore limpa, sem lock e sem worktree residual.

```json
{ "ok": false, "blocked": true, "code": "OPENCODE_PROCESS_FAILED",
  "runId": "run-automated-pipeline", "steps": [] }
```

Duração ~30s. Estado: `run state = BLOCKED`, `attempt … status: failed, cls: deterministic`,
**lock liberado**, um worktree remanescente (`status: dirty` — cleanup é best-effort por design),
3 artifacts de revalidation gravados.

**Corrigido em `b883c04`.** Não era ambiente, não era auth, não era o base SHA: era
`opencode.cjs:103` — e, por baixo dele, o modelo em limite (BUG-28).

**O que a execução validou (funciona em campo):**

- **O fix do EPIPE.** O processo falhou e **não crashou**; o `finally` de `orchestrator.cjs:979-980`
  rodou e o lock foi liberado. Antes das correções de `9a0807f`, isto teria vazado o lock e travado
  o repositório até intervenção manual.
- Lock atômico, worktree criado do base SHA correto, state machine, `state.json` válido e
  revalidation — todos exercitados com sucesso.
- Falhou fechado: `BLOCKED`, `deterministic`, sem retry, sem commit, sem PR.

**O que continua sem evidência de campo:** implementação de step, gates sobre diff real, review,
acceptance, commit, resume e global review — tudo depois do executor.

### Resultado do 2º run — após as correções (`b883c04`)

Mesmo comando, base `b883c04`. **O agente executou pela primeira vez.**

```
73624   29:04 opencode run --format json --dir …/attempt-…-step-1-1 --agent build --auto --pure
run = RUNNING | attempt = ["running"]
```

Desfecho — tentativa 1 estourou o timeout de 30 min; a 2 foi morta manualmente após 13s:

```json
{ "ok": false, "blocked": true, "code": "OPENCODE_PROCESS_FAILED",
  "cause": { "process": { "status":"failed", "signal":"SIGTERM", "timedOut":false, "durationMs":13459, … },
             "retry": { "nextAction":"BLOCKED", "reason":"NON_RETRYABLE", "classification":"deterministic" } },
  "runId": "run-automated-pipeline", "steps": [] }
```
`EXIT=1`. `run = BLOCKED`. Lock liberado.

**O que este run provou:** BUG-21, BUG-22 e BUG-23 corrigidos (seção 7); o fix do EPIPE de novo em
campo; e **BUG-25**, que ninguém tinha hipótese de existir antes de rodar.

**Nota de método:** matar o processo **filho** (`opencode`) e não o pai produz falha sem
`timedOut`, que `retry.cjs` classifica como `deterministic` → sem retry → bloqueio limpo com lock
liberado. Matar o pai vazaria o lock. Se precisar abortar um run, mate o filho.

### O que observar

| Sintoma | Bug | Significa |
|---|---|---|
| Crash com stack de EPIPE | — | Regressão. Não deve acontecer |
| `BUDGET_RECONCILIATION_REQUIRED` no `/resume-spec` após matar o processo durante o **reviewer** | **BUG-01** | Confirmaria em campo o que hoje só está provado por leitura + teste de regex. **Este cenário nunca rodou.** Com executor o resume deve funcionar — o contraste é o diagnóstico |
| Agent call correndo até o timeout sem tocar em arquivo, seguido de retry | **BUG-25** | Confirmado no 2º run. Step degenerado custa até 3 × 30 min |
| `LOCAL_ACCEPTANCE_REJECTED` sem dizer quais paths | **BUG-03** | Era pra ser `awaiting_human` com a lista |
| Evidência dizendo `deterministic` para violação de escopo ou gate | E3 residual | Sem efeito de fluxo; só imprecisão |
| `BUDGET_EXCEEDED` em `elapsedMinutes` | — | Regressão. Tempo parado não deve contar |
| `EXIT=0` com `"ok": false` | **BUG-22** | Regressão. Deve sair 1 |

Guarde `.workflow-runtime/runs/<runId>/state.json` e os artifacts — primeira evidência real do
pipeline.

### Recuperação

Layout (`runtime.cjs:45-51`): `.workflow-runtime/locks/repository.lock` e
`.workflow-runtime/runs/<runId>/state.json`.

```bash
# lock órfão (só resume aceita a flag; exige prova de processo ausente + confirmação)
bash scripts/workflow/resume-spec.sh specs/automated-spec-pipeline.md \
  --base-sha $(git rev-parse HEAD) --remove-orphan-lock

# worktrees residuais
git worktree list && git worktree remove <path>   # ou: git worktree prune

# abortar (runtime é descartável e gitignored)
# O chmod é obrigatório: o snapshot fechado do reviewer é gravado 0400 por design, e um rm -rf
# direto falha com Permission denied em todas as suas partes.
chmod -R u+w .workflow-runtime && rm -rf .workflow-runtime && git worktree prune
```

Raio de explosão contido: worktrees sob `.workflow-runtime/` (ignorado), sem `--allow-commit` não há
commit, PR é opt-in separado que nunca dá push.

---

## 9. Ordem sugerida

> Quatro versões anteriores abriram com "rode o pipeline". Feito nove vezes. **Cada execução
> falsificou o topo desta lista e, uma vez, o próprio resumo executivo.** O run 9 foi o primeiro a
> não achar nada — a camada nunca exercitada tinha dez bugs e acabou.

1. **BUG-09** — único Alta, e não é um defeito: é a fábrica deles. Já causou quatro bugs e decide o
   BUG-03. Custa caro: 420 linhas mortas, **7 arquivos e 65 dos 143 testes** pendurados nele, e
   **zero** testes exercitam o `processStep` de produção. Não é correção — é a refatoração, e precisa
   da decisão de qual caminho sobrevive
2. ~~**BUG-17**~~ — **fechado (2026-07-17):** `validate-spec` → `specs-lint`; exigiu revisão de specs aprovadas e recomputar `source.hash`
3. **BUG-03, 04, 05, 06, 07, 08** — Média; vários dependem do BUG-09
4. **BUG-10, 14, 15** — Baixa

*(BUG-01, 02, 11, 25 em `d77906f`; 26 em `11d4523`; 28, 12, 30 em `4a444e2`/`7460d05`/`7f41912`;
31, 32, 33 em `851b7bb`/`021d180`/`4588cdf` — ver seção 7.)*

**O que ainda nunca rodou:** commit automático (`--allow-commit`) e PR. Ambos opt-in e fora do fluxo
default, que agora funciona.

**A taxa de descoberta caiu.** O run 9 não achou nada; o ciclo completo achou um (BUG-34). A camada
nunca exercitada tinha doze bugs e essencialmente acabou.

**E a leitura produziu cinco falsos** — reexaminados um a um antes de virarem churn. Isso vale mais
que os 11 abertos: o backlog deste relatório não é confiável sem reexame, e a parte dele que veio de
execução é a única que se sustentou inteira.

---

## 10. Errata desta auditoria

Registrado porque a mesma régua aplicada ao código vale para quem audita.

- **`validate-spec.sh` não tem o nome errado.** Afirmei que sim; está errado. Ele é consistente com
  a família (`run-spec.sh`, `resume-spec.sh`, `review-spec.sh`), que também recebem `<spec-path>` e
  operam *sobre* uma spec. O outlier real é o gate (BUG-17).
- **"36 commands, 35 gerados" não era discrepância.** `build-commands-core.cjs:22-25` exclui quem
  tem `cursor-only: true`, e `rescue.md` tem. 36 − 1 = 35. Comparei dois `tail` da mesma execução
  achando que era antes/depois.
- **Falhas de builder reportadas no meio da sessão eram artefato de shell.** Loop com expansão
  quebrada fez três scripts parecerem crashar; rodando um a um, todos saem 0.
- **Suspeita sobre `report.cjs` era falsa.** `writeReport:205` serializa o valor **sanitizado** —
  `buildFinalReport:120-125` sanitiza, valida e retorna `value`. Mesmo padrão em
  `buildRetrospective:170-175`.
- **Suspeita sobre provenance de evidence era falsa.** `acceptance.cjs` chama `validateEvidenceMap`
  sem contexto, mas `local-adapter.cjs:1260-1276` roda uma segunda passada com `expectedContext`
  completo e rejeita com `AC_EVIDENCE_PROVENANCE_INVALID`. Sobrou o BUG-07, que é sobre a
  duplicação, não sobre ausência de verificação.
- **Módulos não auditados em profundidade:** nenhum. `report.cjs`, `notifications.cjs`,
  `findings.cjs`, `evidence.cjs`, `artifacts.cjs` e `review.cjs` foram cobertos na passada final.

### Da depuração do BUG-21 (execução real)

Duas hipóteses foram levantadas e **refutadas por teste** antes de chegar à causa. Registradas para
que ninguém as persiga de novo:

- **"O config injetado não tem `model` nem `provider`."** Verdade — `OPENCODE_CONFIG_CONTENT`
  (`opencode.cjs:87-95`) tem só `$schema, autoupdate, share, plugin, mcp, permission, agent`, e
  substitui a config da máquina, que declara `"model": "openai/gpt-5.5"`. **Mas injetar o model não
  corrigiu:** erro idêntico. Não é a causa. *(Continua sendo uma diferença real de comportamento
  entre a config da máquina e a injetada — só não é o que quebra.)*
- **"A restrição de ambiente derruba a auth."** Falso. Ambiente **completo + overrides** falha
  igual ao restrito; ambiente completo **sem** overrides funciona. A causa são os overrides, e a
  bissecção isolou um único: `OPENCODE_DISABLE_DEFAULT_PLUGINS`.

### Do 2º run (execução com as correções)

- **A previsão do runbook errou o custo.** Escrevi que o step degenerado "provavelmente não mudará
  nada". Acertei o diff — zero arquivos tocados — e **errei feio o custo**: supus retorno rápido, e
  o agente deliberou 29 minutos até o timeout, e ainda reintentou. Isso virou BUG-25. Não havia
  hipótese disso antes de rodar.
- **Reportei o BUG-01 como "confirmado em campo" na tabela de observação.** Falso: ele está provado
  por leitura e teste de regex; o cenário de resume após crash no reviewer **nunca rodou**.
  Corrigido nesta revisão.
- **Quase perdi o BUG-25.** Ao matar o run, matei um processo de 13 segundos achando que era o de 29
  minutos. Só o `etime` revelou que era outro — ou seja, a tentativa 1 já tinha estourado e o
  pipeline havia reintentado sozinho. Sem esse detalhe, o achado passava batido.

### Da rodada de correções

- **Formulei mal a consequência do BUG-25.** Alertei que tornar `TIMEOUT` terminal "mataria o
  maquinário de retry". Está errado: o retry **já estava morto pelo motivo errado e vivo pelo motivo
  errado** — nada mapeia erro de provider para transitório (BUG-26), e `TIMEOUT` era a única coisa
  que o mantinha aparentemente vivo, justamente no caso em que ele não deveria atuar. A decisão não
  cria código morto; ela **expõe** que já estava.
- **O limite de 5 arquivos não se aplicava.** Levantei-o como restrição para estas correções. É
  regra de *atomic step de spec*, não de commit de manutenção — `9a0807f` tocou 24 arquivos e
  `c5397b4`, 29. Retirado.

### Da correção do BUG-26

- **Fui procurar a taxonomia de erro do OpenCode raspando um binário de 142 MB**, e só fui buscar a
  documentação porque o usuário perguntou "por que não pesquisa na internet?". O binário devolveu
  nomes (`APIError`, `ProviderError`, `ProviderAuthError`, `UnknownError`) misturados a ruído de
  bibliotecas embutidas, e **não** a informação que decidia o fix: o campo `isRetryable`. Meu plano B
  era inferir transitoriedade do texto da mensagem — teria sido chute travestido de heurística. A
  correção mudou a **qualidade** do fix, não só a velocidade. Fonte disponível não consultada é a
  mesma falha que o resto deste relatório cobra do código.

### Da spec descartável e dos runs 3–6

Esta rodada custou cinco hipóteses refutadas por teste. Registro todas: cada uma foi defendida com
convicção antes de cair, e nenhuma teria caído por leitura.

| Hipótese | Como caiu |
|---|---|
| A permission injetada trava o agente | Controle **sem** permission também não escreveu. E a permission acabou sendo o que **faz funcionar**: negar `bash` empurra o agente para `write` |
| O config injetado não declara `model` | Injetar o model não mudou o erro **naquele momento** — porque `OPENCODE_DISABLE_DEFAULT_PLUGINS` ainda estava lá. Enterrei o BUG-28 junto com o BUG-21 e ele custou o dia |
| A restrição de ambiente derruba a auth | Ambiente completo **+** overrides falha igual |
| O prompt vai por stdin e `run` quer argv | Probe com argv posicional: `stdoutBytes=0` idêntico |
| O agente anuncia e não faz (BUG-29) | Artefato do teste anterior, que rodava sem a permission do pipeline. Com ela, `write -> completed`. **Eu ia "corrigir" algo que estava certo** |

Outros erros meus nesta rodada:

- **"O pipeline invoca agentes"** — publicado em `b4a83d1`/`ba369b1` e falso. Li "processo vivo por
  29 min" como "agente trabalhando", sem nenhuma evidência de que estivesse. O `stdoutBytes: 0` que
  desmentiu isso só existia porque **o BUG-23 tinha sido corrigido horas antes**: a correção de
  observabilidade derrubou minha própria conclusão no mesmo dia.
- **BUG-12 classificado Baixa** quando era bloqueio total. Vi a string mágica, entendi que era teste
  vazando para produção, e não fiz a pergunta seguinte: *"e quem não é o teste?"*. Resposta: ninguém
  passa.
- **O runbook mandava `rm -rf .workflow-runtime`**, que falha: o snapshot fechado é `0400`. Só
  descobri tentando.
- **A causa raiz veio do operador, não da auditoria.** "O gpt-5.5 está em limite" — uma frase — matou
  quatro hipóteses minhas. Nenhuma quantidade de leitura acharia: o sintoma era idêntico em todas as
  camadas.

### Dos runs 7–9

- **Escrevi "no prose, no code fence, no commentary" no prompt do reviewer** e o modelo emitiu um
  preâmbulo assim mesmo, no run seguinte. A instrução era minha, feita horas antes, e não sobreviveu
  ao primeiro contato. **Instrução a modelo é súplica; parser é contrato.** Registro porque a
  tentação de resolver com prompt vai voltar.
- **O BUG-33 só existiu como achado porque o BUG-31 foi corrigido.** Todas as minhas reproduções
  isoladas do reviewer funcionaram — uma resposta de evento único parseia bem. A diferença entre o
  pipeline e a reprodução era invisível até a resposta real ficar no disco.
- **Cheguei a considerar o BUG-32 erro da minha spec.** Era do pipeline, e o mais grave em aberto: a
  spec do próprio pipeline nunca poderia ter sido aceita. Ninguém tinha descoberto porque nenhum run
  jamais chegou à acceptance.

- **Cinco dos meus achados de Baixa não eram defeitos.** Reexaminados antes de tocar no código:
  BUG-16 (as duas sanitizações checam limites diferentes), BUG-18 (não editar ADR aceito **é a
  política**, `spec:200`), BUG-19 (o catálogo lista gates disponíveis, não usados), BUG-20 (o schema
  é `const: 5`, o campo não pode divergir), BUG-24 (já resolvido pelo fix do BUG-23). Corrigi-los
  seria churn, e o BUG-18 teria quebrado a regra do repositório. **A leitura não só deixou passar os
  dez bugs reais — ela produziu cinco falsos.**

### Do ciclo completo

- **O BUG-34 é o retrato do dia inteiro.** `commitStep` regravava a identidade; `reconcileStep` não.
  O caminho excepcional funcionava e o **default** não — e a auditoria estática leu os dois trechos
  sem notar a assimetria, porque cada um está correto isoladamente. Só a execução compara.
- **Quase resumi o run errado.** Depois de commitar o fix, a `main` andou e o run em `AWAITING_COMMIT`
  ficou preso ao base anterior. Retomá-lo teria dado drift — corretamente, e eu teria reportado como
  bug. Um run está preso ao base em que nasceu; foi preciso um ciclo limpo.
- **O commit humano vai no worktree, não na `main`.** É o que mantém o `--base-sha` do resume válido.
  Se fosse na `main`, o base andaria e o próprio resume viraria drift. O desenho está certo aí, e eu
  levei um susto antes de entender.

### Do reexame do BUG-09 — o pior erro do dia

- **A tabela do meu unico Alta tinha quatro linhas e duas eram falsas.** `failureFrom` e
  `awaiting_human` ja estavam no caminho de producao. Verifiquei por `git show` e por teste depois de
  ja ter reportado, commitado, empurrado e usado a tabela para pedir uma decisao ao operador.
- **`d77906f` mente no historico.** A mensagem afirma que o commit ligou `failureFrom` ao
  `processStep`. `git show d77906f~1` mostra que ja estava ligado. O commit e inofensivo — o codigo
  esta correto — mas a mensagem descreve um trabalho que nao aconteceu. Nao reescrevo historico
  publicado; fica registrado aqui.
- **Escrevi um bloco duplicado para "corrigir" o BUG-03**, que ja funcionava. Se tivesse entrado,
  teria criado dois caminhos para a mesma decisao — exatamente a doenca que o BUG-09 descreve. So
  nao entrou porque rodei o teste antes de commitar.
- **O operador decidiu "deletar" com base nessa tabela.** Nao executei: a informacao era minha e um
  terco dela era falsa. Converter meu erro de leitura em perda permanente de 15 testes de garantia
  seria o maior churn do dia. A decisao volta para a mesa com o que sobrou de verdade.
- **Disse "65 dos 143 testes dependem dele".** Sao **15** — medido removendo o export e contando as
  falhas. Contei arquivos que *importam* como se todo teste dentro deles dependesse.

### Da migração do BUG-09 (2026-07-17)

- **Declarei `GLOBAL_STEPS_NOT_COMMITTED` (`orchestrator.cjs:938`) inalcançável** e registrei isso num
  commit publicado (`4e77b74`). **Errado.** Enumerei as saídas do `processStep` e a enumeração era
  correta para tudo que passa por schema — e cega para o que não passa. `:772` devolve o objeto que o
  **adapter** entrega, e nada valida o retorno do adapter. Um adapter que reconcilia como
  `'committed'` minúsculo chega na linha e bloqueia a run; provado no primeiro try, com adapter
  rodando. **Enumerar caminhos não é prova; construir um caso que chega lá, é.** O commit seguinte
  (`7b9a5b2`) corrige e cobre.
- **Disse "o gate roda 2 dos 12 arquivos" quatro vezes.** São **17** — `ls scripts/workflow/test-*.cjs
  | wc -l`. Nunca contei: estimei e repeti. O achado (BUG-35) sobrevive e piora; o número era meu.
- **Afirmei que produção não tinha reserva de budget**, por ter procurado só no `orchestrator.cjs`.
  Está em `local-adapter.cjs:951`, uma camada abaixo. Conferi antes de publicar e por isso não virou
  o oitavo achado falso — mas a conclusão já estava formada a partir da ausência.
- **Quase provei uma mutação com erro de sintaxe.** Apliquei a primeira mutação do gate global com
  dois `perl` em sequência e vi o teste falhar. Se o primeiro tivesse quebrado a sintaxe, o teste
  falharia por erro de parse e eu teria contado como garantia coberta. Refiz como troca de uma linha,
  confirmei com `node --check`, e só então a falha virou evidência. **"O comando deu o resultado que
  eu esperava" não é "o resultado significa o que eu quero que signifique".**
- **Batizei o teste migrado com o mesmo nome do original**, criando dois testes homônimos em arquivos
  diferentes e um output ambíguo ao medir dependências. Renomeado.

Contrapeso honesto: nesta rodada a disciplina pegou os próprios erros antes de publicar em três dos
cinco casos. O que mudou não foi o cuidado — foi **construir o caso em vez de raciocinar sobre ele**.

### Sobre o método

Placar: **20 achados por leitura — nenhum fatal e SETE falsos. 13 por execucao, todos reais,
incluindo cada um que impedia o pipeline de funcionar.** O 13o (BUG-35) veio de investigar por que
os testes nunca pegaram nada — e a resposta foi que a maior parte deles nao roda no gate. Doze correcoes separam "nao
invoca agente" de `SUCCEEDED`, e nenhuma era visivel lendo — estes arquivos foram lidos tres e
quatro vezes.

**Mais de um terco do que a leitura produziu nao existia.** Dois dos falsos sustentavam a tabela
do unico Alta, e um deles quase virou codigo duplicado no lugar que o proprio achado acusa de
ter codigo duplicado. Este relatorio nao deve ser consumido como backlog sem reexame: a parte
dele que veio de execucao e a unica que se sustentou inteira. Quatro vezes a lógica correta estava no caminho que produção não
toma (BUG-09). Quatro vezes um teste **travava** o bug no lugar em vez de pegá-lo. Cinco hipóteses
minhas refutadas.

Os testes não falharam em pegar bugs — **os testes eram o contrato**. O produto foi construído para
satisfazê-los, e só a eles: `'executor complete'` era a única resposta de executor que o pipeline
aceitava, e vinha de `test-adapter.cjs`.

### Sobre o que a leitura de código não encontrou

`opencode.cjs:87-106` foi lido três vezes durante esta auditoria — incluindo uma passada dedicada ao
isolamento do reviewer, que aprovou o bloco. O BUG-21 estava lá o tempo todo, em uma das nove linhas.
Nenhuma delas parece errada lendo. **A auditoria estática não tinha como achar isso**, e é honesto
registrar o limite do método em vez de deixar implícito que o código foi "coberto".
