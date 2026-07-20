---
schemaVersion: 1.0.0
id: spec-prosa-dependency-vetting
title: Vetting de dependências no pipeline prosa
status: approved
source: {path: specs/prosa-dependency-vetting.md, hash: c615f45dfa1b24c12668d0118142897149e094f8926e1d1ef95a08c9c1b32567, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
approval: {approvedBy: user, approvedAt: 2026-07-19, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
goal: Permitir mudanças npm declaradas somente após resolução, vetting, aprovação quando necessária e materialização reproduzível por broker confiável, sem package manager ou registry para agentes.
nonGoals:
  - Conceder npm, npx, package manager, escrita em manifest/lockfile ou registry aos agentes.
  - Suportar ecossistemas além de npm público, registries privados, credenciais, ranges, tags, Git, URL, workspace, link, bundled dependency ou lifecycle scripts na v1.
  - Criar agregador de risco, decisão, waiver, pausa ou state machine paralela ao HITL existente.
  - Cobrir downloads npx do catálogo MCP ou executar vetting retroativo detalhado de dependências inalteradas.
acceptanceCriteria:
  - {id: AC-01, description: "Step v4 fechado aceita somente requests npm públicos e exatos e bloqueia sources e topologias proibidas."}
  - {id: AC-02, description: "Manifest e lock compartilham npm cwd; target é exato e optional exige graph, integrity e plataforma completos."}
  - {id: AC-03, description: "Candidate altera somente dependency entries declaradas e bloqueia collateral manifest ou lock diff."}
  - {id: AC-04, description: "Step v3 sem declaração que altera manifest ou lock bloqueia antes de gates e review."}
  - {id: AC-05, description: "Manifest, lock e node_modules são broker-owned, read-only fora do broker e protegidos por canário coercitivo."}
  - {id: AC-06, description: "Manifest e lock contam no limite, diff e commit; node_modules permanece runtime untracked."}
  - {id: AC-07, description: "Executor isolado não executa package manager, shell, interpretador, projeto, filho nem realiza inspection ou egress."}
  - {id: AC-08, description: "Gates executáveis em worktree rodam sandboxados, sem rede ou secrets e com writes mínimos."}
  - {id: AC-09, description: "Ownership é conferida antes e depois de subprocessos e nenhum processo não-broker antecede completion próprio."}
  - {id: AC-10, description: "Dependency policy fechada vem do baseSha, contém os controles aprovados e inicia com preapproved vazio."}
  - {id: AC-11, description: "Preapproval exige root, versão, registry, integrity, closure e metadados de aprovação e nunca nasce de approval runtime."}
  - {id: AC-12, description: "Fast path exige root e closure exatos; qualquer mudança transitive ou de edge o invalida."}
  - {id: AC-13, description: "Todos os roots precisam casar e status global usa máximo; policy produtiva vazia exige approval para add e update."}
  - {id: AC-14, description: "Hashes de graph, node, closure, resolution e classificação incluem todos os fatos canônicos aprovados."}
  - {id: AC-15, description: "Grandfathering exige identidade igual e provenance íntegra para nó introduzido após baseSha."}
  - {id: AC-16, description: "Candidate persistido é autoridade e não há promessa de re-resolução futura idêntica."}
  - {id: AC-17, description: "Re-resolução divergente cria candidate e request novos e torna approval anterior stale."}
  - {id: AC-18, description: "Broker usa Node e npm por distribuição e path absolutos verificados, sem PATH, Corepack ou download."}
  - {id: AC-19, description: "HOME, cache, TMP, config e env fechados impedem poisoning e compõem effectiveConfigHash."}
  - {id: AC-20, description: "Limites medidos de rede, parsing, graph, archive, disco e subprocesso bloqueiam sem approval quando excedidos."}
  - {id: AC-21, description: "planAndVet ocorre após lock e parent e antes de HITL, attempt, worktree e agente."}
  - {id: AC-22, description: "Reports usam validators pinados e consistência semântica local sem alegar schema remoto inexistente."}
  - {id: AC-23, description: "Not found exige packument válido sem versão; 404 isolado permanece inconclusive."}
  - {id: AC-24, description: "Downloads de versão e fallbacks respeitam endpoint, encoding, granularidade, limite e freshness aprovados."}
  - {id: AC-25, description: "Integridade de metadata no plan e integridade do artifact pós-install são estados distintos e obrigatórios."}
  - {id: AC-26, description: "Comando pinado de signatures e attestations roda após npm ci e separa signature de provenance."}
  - {id: AC-27, description: "Signature exigida ausente ou inválida e provenance inválida bloqueiam; provenance ausente sinaliza risco."}
  - {id: AC-28, description: "Provenance valida issuer, subject, source, builder e freshness conforme policy."}
  - {id: AC-29, description: "Lifecycle nunca executa e divergência ou hook novo bloqueia antes do seal, inclusive no baseline."}
  - {id: AC-30, description: "Authorization de materialização é persistida atomicamente sob lock após revalidation e ligada a operationId e decisão."}
  - {id: AC-31, description: "Recovery pós-consumo só recria a mesma operação fresh sem duplicar approval pelo crash."}
  - {id: AC-32, description: "Completion exige instalação, checks e seal; ausência descarta attempt inteiro sem inferência."}
  - {id: AC-33, description: "Teste de crash pós-npm-ci e pré-state comprova descarte integral."}
  - {id: AC-34, description: "State e bindings incluem todos os hashes e estados técnicos necessários ao replay seguro."}
  - {id: AC-35, description: "Metadata remota é minimizada em artifact restricted e nunca vira instrução para agente ou reviewer."}
  - {id: AC-36, description: "Unlisted clean e heurísticas geram sinais proporcionais; technical block não é sobrescrito por HITL."}
  - {id: AC-37, description: "Vetting reutiliza exclusivamente HITL existente, sem pausa, waiver, decision file, agregador ou state machine paralela."}
  - {id: AC-38, description: "Testes e evidências cobrem fast path, drift, recovery, sandbox, poisoning, limites, reports, sources e write deny."}
  - {id: AC-39, description: "Documentação cobre policy, closure, approval efêmero, disclosure, recovery, sandbox e troubleshooting."}
  - {id: AC-40, description: "Risco npx do catálogo MCP permanece follow-up explicitamente não coberto."}
  - {id: AC-41, description: "Todo worktree local recebe baseline materialization própria; advisory bloqueia sem HITL de mudança."}
  - {id: AC-42, description: "Worktree integrado recebe completion próprio antes de gates globais, sem reutilizar completion local."}
  - {id: AC-43, description: "Adapter sem process deny coercitivo é incompatível e provider credentials ficam restritas ao transport."}
  - {id: AC-44, description: "Todo subprocesso do broker roda sandboxado com filesystem e hosts mínimos e sem secrets ou sockets."}
  - {id: AC-45, description: "Testes do broker negam secrets, traversal, symlink, socket e write outside sem fallback."}
  - {id: AC-46, description: "Remoção persiste removedClosureHash, exige approval mínimo e não usa fast path."}
  - {id: AC-47, description: "Status global combina add, update, remove, roots, nós e predicados pelo máximo."}
  - {id: AC-48, description: "Manual e e2e cobrem baseline, integrated completion, no-exec, broker, reports, downloads, remove e lifecycle."}
  - {id: AC-49, description: "Risco de versão exige granularidade version e fallback package-level não mascara target version."}
  - {id: AC-50, description: "Preflight raw symlink e TOCTOU-safe bloqueia inputs, sources e configurações proibidos antes de qualquer npm."}
  - {id: AC-51, description: "Fast path só ocorre após candidate completo e hasheado e pula detalhe apenas para closure matched."}
  - {id: AC-52, description: "Todo artifact exige SRI SHA-512 ou mais forte aprovado, sem exceção baseline."}
  - {id: AC-53, description: "Attestations são verificadas e minimizadas com trust offline pinado; host extra bloqueia rollout."}
  - {id: AC-54, description: "Completion autocontido vincula operação, resultado, policy, contrato, toolchain, hashes, decisões, provas e worktree."}
  - {id: AC-55, description: "Toda operação Git usa wrapper sandboxada e preflight seguro que neutraliza configuração executável."}
  - {id: AC-56, description: "Git não executa projeto ou dependência, ownership permanece e runbook não instrui Git direto no worktree."}
  - {id: AC-57, description: "Controles e shadow são provados antes do enablement transacional final fail-closed."}
implementationNotes:
  - {id: NOTE-01, content: "Broker local built-in é o único dono de rede npm, resolução, manifest, lock e node_modules.", approvedBy: user, approvedAt: 2026-07-19, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
  - {id: NOTE-02, content: "planAndVet em scratch antecede HITL; materialização sucede decisão válida e completion antecede processo não-broker.", approvedBy: user, approvedAt: 2026-07-19, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
  - {id: NOTE-03, content: "Hard technical block e inconclusive não são sobrescrevíveis; sinais reutilizam somente o HITL existente.", approvedBy: user, approvedAt: 2026-07-19, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
  - {id: NOTE-04, content: "Policy e toolchain vêm do baseSha; preapproved inicia vazio e approval runtime não altera policy.", approvedBy: user, approvedAt: 2026-07-19, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
  - {id: NOTE-05, content: "Candidate persistido é autoridade e closure exata governa fast path; re-resolução divergente exige request novo.", approvedBy: user, approvedAt: 2026-07-19, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
  - {id: NOTE-06, content: "Executor não possui process capability genérica; broker, gates e Git usam sandboxes deny-first próprias.", approvedBy: user, approvedAt: 2026-07-19, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
  - {id: NOTE-07, content: "Recovery sem completion descarta attempt inteiro; decisão consumida só autoriza a mesma operation fresh.", approvedBy: user, approvedAt: 2026-07-19, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
  - {id: NOTE-08, content: "A exceção bootstrap aceita exclusivamente os IDs spec-prosa-dependency-vetting-step-1 a step-22 da spec hash c615f45dfa1b24c12668d0118142897149e094f8926e1d1ef95a08c9c1b32567 no baseSha 35cb2d4b00be0217da2bea071f19832389a0b1f0; Steps 1 a 21 ficam sem enablement e o Step 22 expira a exceção atomicamente ao habilitar ou mantém tudo desabilitado.", approvedBy: user, approvedAt: 2026-07-19, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
documentationImpact:
  kind: paths
  paths: [docs/workflows/automated-spec-pipeline.md, docs/workflows/automated-spec-pipeline-runbook.md, docs/workflows/prosa-development.md, docs/audits/prosa-dependency-vetting-prototype.md, docs/audits/prosa-dependency-vetting-manual.md]
budgets: {maxAttemptsPerStep: 3, maxAttemptsTotal: 66, maxAgentCallsPerStep: 6, maxAgentCallsTotal: 132, maxReviewCyclesPerStep: 2, maxReviewCyclesTotal: 44, maxDiagnosisCyclesPerStep: 2, maxDiagnosisCyclesTotal: 44, maxElapsedMinutesPerStep: 120, maxElapsedMinutesTotal: 2640, maxEstimatedCostPerStep: null, maxEstimatedCostTotal: null, maxTokensPerStep: null, maxTokensTotal: null}
execution: {adapter: opencode, autoCommit: false, pullRequest: false, correctionStep: false, notificationResourceIds: []}
isolation: {strategy: git-worktree, operatingSystemSandbox: true, shell: false, reviewerReadOnly: true, diagnosticianReadOnly: true}
review: {local: true, final: true, globalAcceptance: true, freshSessions: true, blockingSeverities: [critical, high]}
globalGates: [workflow-tests, specs-lint, verify-pack]
---
# Vetting de dependências no pipeline prosa

**Status:** aprovada para implementação

**Data:** 2026-07-19
**Roadmap:** etapa 4 de 5
**ADRs aceitos:** [ADR 026](../adr/026-broker-confiavel-e-policy-de-dependencias.md) e
[ADR 027](../adr/027-vetting-materializacao-e-recovery-de-dependencias.md)
**Dependências aceitas:** [spec de drift](prosa-spec-code-drift.md),
[ADR 024](../adr/024-contrato-estruturado-de-implementacao-do-step.md) e
[ADR 025](../adr/025-fase-recuperavel-de-deteccao-de-drift.md)

## Goal

Permitir mudanças npm declaradas no pipeline prosa somente depois de resolução, vetting, aprovação
quando necessária e materialização reproduzível por um broker confiável, sem conceder package
manager nem acesso ao registry aos agentes.

## Non-goals

- Permitir que executor, reviewer ou diagnostician execute `npm`, `npx`, outro package manager ou
  escreva manifest/lockfile.
- Suportar range, tag, Git, URL, arquivo, diretório, registry privado, credencial npm ou `.npmrc`
  customizado na v1.
- Executar lifecycle scripts ou aceitar pacote novo/alterado que dependa de `install` ou
  `postinstall`.
- Tornar aprovação runtime uma alteração persistente de `workflow/dependency-policy.yaml`.
- Fazer vetting detalhado retroativo de dependências inalteradas já presentes no parent SHA efetivo
  ou promovê-las automaticamente a `preapproved`.
- Criar novo agregador de risco, decision file, pausa ou state machine HITL paralela.
- Tratar `changeType: vetted_dependency` como prova de vetting ou autorização.
- Cobrir downloads `npx` do catálogo MCP. Eles são um risco existente separado e exigem follow-up
  próprio; esta etapa não os torna seguros por implicação.
- Versionar `node_modules` ou abrir exceção ao limite absoluto de cinco arquivos lógicos do step.
- Cobrir ecossistemas diferentes de npm público na v1.

## User stories

### Caminho feliz: versão exata preapproved

**Given** um step v4 válido que declara uma alteração npm exata e uma entrada root `preapproved` com
mesmo nome, versão, registry, integridade e `canonicalClosureHash` do candidate, sob policy e
toolchain íntegras,
**When** o broker executa `planAndVet` no scratch e depois materializa o candidate aprovado,
**Then** ele aplica o fast path somente à closure exata daquele root, mantém verificações técnicas de
existência, source, integridade, candidate lock, audit e assinatura, instala sem scripts e libera o
executor sem uma pausa causada por essa dependência.

### Caminho feliz com aprovação: pacote não listado e tecnicamente limpo

**Given** uma dependência pública exata não listada em `preapproved`, sem advisory bloqueante, fonte
inválida, lifecycle script ou sinal heurístico elevado,
**When** `planAndVet` conclui o candidate graph,
**Then** o resultado e os artifacts são persistidos, um `RiskSignal` com mínimo
`approval_required` é registrado por `recordRiskSignals` e o checkpoint pre-execution HITL existente
é usado antes de criar attempt/worktree ou instalar.

### Caminho feliz: baseline sem dependency change

**Given** um step v3/v4 sem `dependencyChanges` e manifest/lock íntegros no parent,
**When** seu worktree local ou integrado global estiver prestes a executar agente/gate,
**Then** o broker cria completion próprio com freshness/audit, npm ci, signatures e seal antes de
qualquer processo não-broker, sem gerar heurística ou HITL de mudança.

### Caminho de risco: heurísticas elevadas

**Given** um candidate graph tecnicamente instalável, mas com pacote/versão recente, pouco histórico
ou downloads, mudança de publisher/maintainer, deprecation, nome suspeito ou crescimento incomum do
grafo conforme thresholds aprovados,
**When** o broker classifica o resultado,
**Then** ele registra evidência restrita e um signal `restricted`; a aprovação pre-execution e a
aprovação pós-review existentes são exigidas e vinculadas ao candidate e ao diff final.

### Caminho de erro: pacote inexistente

**Given** um nome canônico cujo packument foi obtido com sucesso e não contém a versão exata, com
confirmação opcional coerente no endpoint de versão,
**When** o broker consulta package e version metadata antes da instalação,
**Then** o resultado é `blocked`, nenhuma aprovação pode sobrescrevê-lo, não há worktree, instalação,
gate ou agente e o erro orienta replan.

### Caminho de erro: registry ou audit indisponível

**Given** timeout, 5xx, resposta incompleta ou falha ambígua do registry/audit,
**When** o vetting não consegue provar os predicados técnicos,
**Then** o resultado é `inconclusive` e hard no-install; a falha não é registrada como pacote
inexistente nem liberada por HITL.

### Caminho de erro: mudança não declarada ou adulteração

**Given** um step v3 sem `dependencyChanges`, ou um attempt cujo manifest/lock diverge dos bytes
materializados pelo broker,
**When** a mudança é observada antes dos gates, depois de qualquer gate ou antes de
review/acceptance/commit,
**Then** o pipeline bloqueia com `DEPENDENCY_CHANGE_UNDECLARED` ou
`DEPENDENCY_OWNERSHIP_VIOLATION`, não executa gates/reviewer sobre o lock inseguro e exige replan.

### Caminho de erro: executor tenta executar projeto

**Given** um run materializado com provider credentials isoladas,
**When** OpenCode/Cursor tenta direct node, loader, shebang, `node_modules/.bin` ou child process,
**Then** a tool policy/sandbox nega coercitivamente; se o adapter não consegue provar o deny, ele é
desabilitado fail-closed e nenhum código do projeto recebe provider credentials/config.

### Recovery e replay

**Given** um crash durante vetting ou uma materialização parcial,
**When** o run é retomado sob lock,
**Then** artifacts órfãos não recebem autoridade, bindings exatos podem ser reconciliados, os
predicados remotos são reauditados antes de novo efeito e qualquer ausência/invalidez do completion
record descarta integralmente attempt e `node_modules`; nenhum agente inicia até a nova instalação e
o read-only seal ficarem completos.

## Assumptions

- A etapa 2 já fornece `RiskSignal`, `recordRiskSignals`, assessment monotônico, checkpoints
  pre-execution/post-review, decision file e bindings recuperáveis; este desenho só os estende.
- A implementação só pode iniciar após a conclusão aprovada dos 15 atomic steps da feature de drift,
  incluindo step v3 e state v4. Essa precondição cross-feature é textual porque `dependsOn` aceita
  somente IDs da mesma feature.
- Sequencialmente, esta tarefa introduz step v4 como v3 + `dependencyChanges` e state v5 como state v4
  de drift + vetting/materialização.
- Os 22 handoffs desta feature usam schema v2 atual. Até o Step 22, uma exceção de bootstrap fechada
  permite exclusivamente os IDs `spec-prosa-dependency-vetting-step-1` a
  `spec-prosa-dependency-vetting-step-22`, vinculados ao `source.hash` aprovado desta spec e ao
  `baseSha` `35cb2d4b00be0217da2bea071f19832389a0b1f0`; ela não aceita outra spec, hash, base ou ID.
- Steps 1 a 21 mantêm `planAndVet`, materialização, agentes e gates produtivos desabilitados. O Step 22
  expira a exceção no mesmo commit/transição que habilita o fluxo fail-closed. Depois disso, todo run
  novo ou retomado exige step v3/v4 e state v4/v5 conforme os contratos; não existe compatibilidade
  geral para handoff v2.
- O executor OpenCode não possui hoje caminho suportado para `npm install`. O Cursor é proibido por
  prompt/PATH, porém o sandbox atual não intercepta de forma completa subprocessos descendentes. O
  broker adicionará a capacidade confiável; esta spec não presume interceptação que ainda não existe.
- `workflow/resources.yaml` hoje permite `registry.npmjs.org` aos executores. O rollout removerá esse
  acesso e dará rede npm somente ao broker dedicado.
- Manifest, lockfile e `node_modules` são broker-owned. O executor e gates podem lê-los depois da
  materialização, mas nunca escrever; o deny-write precisa cobrir processos descendentes.
- Manifest e lockfile continuam
  `predictedFiles`, aparecem no diff/commit e consomem duas posições quando ambos mudam.
- `node_modules` é materialização runtime ignorada e não rastreada pelo Git; essa é a única razão
  para não contar como arquivo autoral.
- O parent SHA efetivo só é conhecido depois de lock/open/revalidation e é a base para grandfathering
  e candidate generation.
- Node, npm, configuração efetiva e canonicalização serão pinados e hasheados. As versões exatas e
  thresholds numéricos dependem do protótipo e não são inventados nesta especificação.
- O registry público não requer credenciais; nenhum token, env sensível ou conteúdo de `.npmrc`
  entra em request, artifact, state ou log.
- Gates executáveis locais/globais em worktree ainda não possuem toda a sandboxing necessária. Esta
  etapa estende a trust boundary a todos eles por necessidade de supply chain, sem classifier
  inferido nem alegação de que vetting torna código de pacote benigno.

## Architecture and contracts

### Trust boundary, isolamento de processos e ownership

O broker é built-in, local, em módulo próprio e chamado pelo orchestrator fora do agente. Ele é o
único componente autorizado a:

1. consultar `registry.npmjs.org` e `api.npmjs.org`;
2. executar o npm pinado sob ambiente/configuração fechados;
3. produzir candidate `package.json`/`package-lock.json` em scratch;
4. materializar esses bytes no worktree;
5. criar e selar `node_modules` com scripts desabilitados.

O broker não recebe credenciais npm, não lê configuração de usuário/projeto e não aceita URL/host
do step. Sua allowlist exata é `registry.npmjs.org` e `api.npmjs.org`; o segundo host serve somente à
heurística de downloads. Tarballs, packuments, audit, signatures e attestations precisam resolver
para sources aprovados pela policy.

Todo subprocesso do broker, inclusive npm e helpers, roda em sandbox de SO deny-first. A policy dá
read-only apenas à distribuição/toolchain verificada, candidate e stores indispensáveis; write apenas
ao scratch/cache efêmeros e aos paths broker-owned exatos do worktree. Real HOME, secrets, sockets e
arquivos não relacionados são inacessíveis; a rede continua limitada aos dois hosts exatos. Testes
reais cobrem leitura de `.env`, SSH e cloud credentials, traversal/symlink e escrita fora dos paths.

O executor mantém somente a rede necessária ao transport do provider e aos recursos não npm já
aprovados. O registry npm sai de todos os resources de executor. Prompt/PATH continuam defesa em
profundidade, nunca sandbox. O sandbox impõe deny-write de manifest, lockfile e `node_modules` ao
agente e a toda árvore de processos, mesmo quando `allowedAreas` abrange o diretório. O executor usa
HOME/cache/TMP efêmeros sem npm cache/config herdados e pode apenas ler o snapshot selado.

O isolamento é definido na fronteira de processo, não por exemplos de runtime. Credenciais e config
do provider existem somente no transport dentro do adapter confiável: nunca entram em contexto de
modelo/tool, arquivos, logs ou ambiente de filho. O executor não possui capability genérica para
iniciar **qualquer** processo de projeto, ferramenta ou interpretador, incluindo `sh`, `bash`,
`python`, `ruby`, `node`, source de scripts, binários arbitrários, loaders e plugins. Também não pode
inspecionar ambiente/processos/arquivos do processo pai. Test, build e lint pertencem exclusivamente
a gates sem credenciais e sem rede.

Se um adapter precisar criar subprocesso interno confiável, sua policy fecha executável absoluto e
argv por allowlist, não admite código/input/path controlado pelo projeto, remove credenciais/config do
provider e ambiente herdado e nega rede. Qualquer tentativa de child process fora desse contrato, ou
incapacidade do adapter de provar a negação, falha fechado e desabilita o adapter. Os testes cobrem
shell, Python, env, `/proc`/equivalente da plataforma e egress, além de node/loaders/shebang/
`node_modules/.bin`.

Todo gate executável local ou global que roda em worktree usa sandbox de SO deny-first, sem classifier
inferido por comando. O ambiente é mínimo e sem secrets, a rede é negada, manifest/lock/
`node_modules` são read-only e write paths são mínimos e catalogados. Gates MCP/read-only externos
sem worktree materializado permanecem sob seu contrato próprio. O ownership check ocorre antes de
**cada** subprocesso e novamente depois. O check posterior detecta violação, mas não substitui o deny
coercitivo durante a execução. Nenhum processo não-broker acessa worktree antes de completion e seal.

Testes adversariais tentam `npm`, `npx`, `corepack`, shells, Python, Ruby, Node, loaders, shebang,
`node_modules/.bin`, executável por path absoluto, source de script, plugin, cache offline, tarball
local, Git source, subprocess child, leitura de env/processo/arquivos do pai, egress e escrita direta
em `node_modules`. Todos falham no executor; gates permitem somente argv catalogado sob sandbox,
independentemente de prompt ou PATH.

### Git operacional confiável

Toda operação Git do pipeline que leia ou escreva checkout/worktree, incluindo criação/remoção de
worktree, checkout, status, add, diff, commit e cleanup, passa por `scripts/workflow/lib/git.cjs` como
fachada única. A fachada roda o Git pinado em sandbox de SO network-denied, sem secrets e sem child
process exec, com env/config fechados e filesystem mínimo. Git nunca executa código do projeto ou de
dependência.

Antes do primeiro checkout ou `git worktree add`, um preflight abre repo config e `.gitattributes`
por handles/identidades estáveis, rejeita symlink, troca de inode/target e TOCTOU e falha fechado em
entrada não allowlisted. A execução ignora e neutraliza config system/global/user/repo não
allowlisted, hooks (`core.hooksPath` apontado para diretório vazio confiável), clean/smudge/process
filters e atributos `filter`, fsmonitor, signing, editors/pagers, credential helpers, aliases e
qualquer mecanismo de subprocesso/config include. A fachada revalida identidade e atributos antes e
depois da operação; nenhuma fallback chama `git` diretamente.

Os ownership checks existentes permanecem antes/depois de cada processo. O runbook humano deve usar
somente comandos da safe wrapper para listar, inspecionar diff, commitar, restaurar ou remover
worktrees materializados; nunca instruirá `git`, IDE Git ou shell direto dentro deles.

### Materialização baseline de todo worktree

Todo worktree que possa executar agente ou gate recebe `dependencyMaterialization` própria antes de
qualquer processo não-broker, inclusive step v3/v4 sem `dependencyChanges`. Sem mudança, o broker usa
manifest/lock exatos do parent e inspeciona **todos** os nós materializados, comparando-os com metadata
de registry da versão exata e com os fatos de lock onde representados. Revalida freshness, audit e
prova criptográfica, executa `npm ci --ignore-scripts --audit=false` e sela os paths. Hooks
grandfathered já existentes podem permanecer registrados, mas nunca executam; divergência entre
artifact, registry e lock bloqueia, assim como hook novo/alterado. Essa validação de lifecycle técnico
não é vetting heurístico retroativo nem preapproval e não gera HITL de mudança.

O worktree integrado usado por gates globais também recebe materialização broker-owned e completion
próprios, vinculados ao parent/tree integrado e ao candidate baseline correspondente, antes de
qualquer gate global. Completion de attempt local não é reutilizado como prova do worktree integrado.

### Step schema v4

O schema fechado `4.0.0` preserva o contrato v3 aceito e adiciona `dependencyChanges`. O campo é
obrigatório e não vazio quando o step altera dependências; é ausente quando não altera. Cada entrada
possui somente:

```json
{
  "action": "add",
  "name": "example-package",
  "section": "dependencies",
  "manifestPath": "package.json",
  "lockfilePath": "package-lock.json",
  "targetVersion": "1.2.3"
}
```

- `action`: `add | update | remove`.
- `name`: nome npm canônico; scoped package só é válido quando seu registry efetivo é o público
  aprovado.
- `section`: `dependencies | devDependencies`.
- `manifestPath` e `lockfilePath`: paths exatos, relativos, sem glob/traversal/symlink, ambos presentes
  em `predictedFiles` quando seus bytes forem alterados.
- `targetVersion`: SemVer exata obrigatória para `add`/`update`; range, tag e alias são inválidos.
- `fromVersion`: exata e obrigatória para `update`; para `remove`, obrigatória quando a versão direta
  aplicável puder ser determinada do parent. Divergência com o parent bloqueia.
- Integridade não é entrada do autor: é obtida e verificada pelo broker.

Na v1, `dirname(manifestPath)` deve ser igual a `dirname(lockfilePath)` e essa pasta é o único npm
cwd. Workspaces, links e bundled dependencies são proibidos. O manifest candidate salva a dependência
direta exata por `--save-exact` ou edição JSON controlada. A transformação parent→candidate pode
alterar somente as dependency entries declaradas; `scripts`, `engines`, `packageManager`,
`workspaces`, `overrides` e todos os demais campos preservam semântica e, quando possível, bytes.
Diferença de lock precisa ser derivável dos requests declarados; mudança colateral não explicada é
hard block com reason code específico.

Entradas extras, pares de paths conflitantes, ação duplicada/contraditória, seção divergente do
parent ou source diferente de npm público invalidam o contrato. `dependencyContractHash` cobre a
representação canônica das entradas, paths e semântica de schema.

No modo baseline, sem `dependencyChanges`, `dependencyContractHash` é o hash da representação
canônica fechada `{mode: baseline, schemaVersion, manifestPath, lockfilePath,
parentOrIntegratedTreeHash}`. Esse contrato baseline é obrigatório para step v3/v4 e worktree
integrado, e nunca reutiliza hash vazio nem marker implícito.

Steps v3 sem `dependencyChanges` seguem executáveis sob a compatibilidade da etapa 3.
Qualquer mudança de manifest/lock observada nesses steps é hard block
`DEPENDENCY_CHANGE_UNDECLARED` antes de gates/review e exige replan para v4. V1/v2 seguem exatamente
a regra aceita de drift; esta spec não os reabilita.

### Dependency policy

`workflow/dependency-policy.yaml` é schema fechado, carregado e hasheado exclusivamente do
`baseSha`. Ela contém:

- schema/semantics version;
- registry público permitido e allowlist de hosts;
- advisory threshold `high`, consistente com o comando de audit fechado;
- semântica de integridade, signatures e attestations/provenance, exigindo SRI SHA-512 ou algoritmo
  igual/mais forte aprovado centralmente para **todo** artifact npm materializado, inclusive baseline;
- trust material Sigstore/TUF offline, preprovisionado, verificado e pinado, com hash, origem e
  freshness vinculados à policy/toolchain;
- versão do heuristic bundle e thresholds/freshness produzidos pelo baseline;
- contrato de toolchain/config: paths absolutos aprovados, versões, digests/origin da distribuição,
  lockfile, flags, env e configuração efetiva;
- `preapproved`, inicialmente `[]`.

Uma entrada futura de `preapproved` representa um **root direct** e contém exatamente `name`,
`exactVersion`, `registry`, `integrity`, `canonicalClosureHash` e approval metadata/evidence. A
aprovação cobre somente a closure canonicalizada exata. Uma transitive nova/alterada muda o closure
hash e perde o fast path, sem exigir que operadores listem cada transitive manualmente. Todo root do
request precisa casar sua própria entrada; o status global é o máximo dos roots, nós e predicados.

A policy produtiva começa com `preapproved: []`: toda adição ou atualização, inclusive major, exige
ao menos approval runtime até uma edição manual posterior da policy. O teste do fast path usa fixture
ou policy revisada dedicada, nunca depende de a policy produtiva vazia conter exceção.

Match exato da entrada e closure pula downloads e metadata heurística detalhada daquela closure.
Existência, source, SRI forte, candidate lock, audit, signatures e provenance continuam obrigatórios;
falha de downloads não rebaixa closure preapproved para `restricted` porque a consulta não ocorre.
SHA-1, integridade ausente ou algoritmo não suportado bloqueiam. Não há exceção de migração na v1;
qualquer exceção futura requer novo ADR.

### Toolchain, configuração e limites confiáveis

O broker resolve Node/npm exclusivamente por path absoluto/distribuição aprovada na policy do
`baseSha`, que contém versões esperadas, digests e origin. Verifica os bytes antes de usar; não chama
Corepack, não baixa toolchain e não resolve via PATH.

Cada operação usa HOME, cache e TMP isolados. User/global config são arquivos controlados pelo
broker; project `.npmrc` é ignorado e rejeitado se puder influenciar o cwd. O ambiente elimina todo
`npm_config_*` não aprovado e proxy/CA vars. O broker fixa e hasheia registry, strict SSL, install
strategy, peer flags, `install-links`, `omit`/`include`, `workspaces=false`, platform config e demais
valores capazes de alterar resolução/instalação em `effectiveConfigHash`.

Limites centrais vindos do protótipo cobrem bytes HTTP, profundidade JSON, nós/profundidade do grafo,
tamanho comprimido/descomprimido e file count de tarball, scratch disk e CPU/memória/tempo/output de
subprocessos. Excesso é hard technical block sem approval. Os valores não são inventados nesta spec.

### Duas fases e ordem do pipeline

#### 1. `planAndVet`

Depois de adquirir lock, abrir/revalidar o run e conhecer o parent SHA efetivo, mas antes do
checkpoint pre-execution, `createAttempt`, worktree ou agente:

1. validar schema v4 e request normalizado;
2. carregar/validar/hashar policy e toolchain do `baseSha`;
3. antes de **qualquer** invocação npm, ler por handles estáveis e validar raw manifest/lock do parent
   e requests exatos pretendidos, com proteção symlink/TOCTOU, rejeitando source/spec/resolved host ou
   redirect proibido, path local, file/directory/link/workspace, bundled dependency e configuração
   npm autoral; o baseline passa pelo mesmo preflight;
4. buscar somente metadata mínima no registry permitida para existência, versão exata, source e SRI
   forte, sempre validando o destino final de cada redirect pela allowlist;
5. gerar candidate manifest/lock em scratch usando npm pinado, `--package-lock-only`,
   `--ignore-scripts` e `--audit=false`, sem `node_modules`;
6. reler e validar integralmente raw manifest/lock/graph/sources do candidate, com a mesma proteção
   symlink/TOCTOU, verificando hosts finais, redirects, SRI, transitivos e constraints de plataforma;
7. derivar `candidateGraphHash`, hashes de closure/classificação/remoções e identidade canônica;
8. somente então determinar match preapproved exato por closure; closures matched não consultam
   downloads nem metadata heurística detalhada, enquanto somente closures unmatched recebem
   `time`/history, publisher/maintainers, deprecation e downloads necessários;
9. executar checks técnicos globais, inclusive
   `npm audit --package-lock-only --json --audit-level=high`, integridade e um
   `candidateTrustAssessment` pré-HITL sobre metadata/bundles do candidate, sem confundi-lo com a
   verificação npm da árvore instalada;
10. produzir classificação, artifacts atômicos, fingerprints e signals antes de solicitar a
    aprovação existente.

Nenhuma saída humana do npm é parseada. “Schema versionado” significa validator interno e fixtures
presos à versão exata e ao distribution digest do npm; não implica que a resposta npm declare versão
de schema. Audit exige comando e exit conhecidos/completos e consistência entre payload, grafo local
do candidate e `omit`/`include`/counts; não se afirma que o registry confirmou cada node. No report
pós-install, `invalid[]` e `missing[]` são confrontados com o graph local; somente attestations em
`verified[]` oferecem cobertura positiva observável por package/location. Signature positiva é
confiada ao comando, exit e implementation digest do npm pinado, não inferida como lista bijetiva.
JSON sintaticamente válido ainda é `inconclusive` se contiver erro, omitir campo obrigatório, não
casar o validator pinado,
estiver truncado ou tiver payload/counts/graph/exit inconsistentes. Report completo com high/critical
bloqueia; abaixo do threshold prossegue.

Not found exige nome/encoding canonicalizados, packument do package obtido com sucesso e versão exata
ausente de `versions`, com endpoint de versão opcional apenas para confirmação. 404 isolado de
qualquer endpoint é `inconclusive`.

A heurística de versão usa o endpoint individual
`/versions/{encodedPackage}/last-week`; sua resposta é um mapa por versão, não contém `start`/`end`.
O broker deriva/corrobora a janela e rotula `start`/`end` como campos derivados. Endpoints bulk e
point/range são fallback **package-level**, aceitam no máximo 128 nomes somente onde bulk for
aplicável e nunca scoped packages. Scoped usa encoding explícito no endpoint individual de versão.
Artifact registra endpoint, janela derivada, freshness e granularity, com processamento diário e
staleness conforme policy. Risco de versão exige `granularity: version`; fallback package-level usa
reason code próprio e nunca representa popularidade da target version. Falha isolada eleva somente
closure unmatched para `restricted`; closure preapproved não faz essa chamada.

#### 2. Materialização

Depois de uma decisão válida, o pipeline cria attempt/worktree e o broker:

1. grava os bytes exatos do candidate manifest/lock no worktree;
2. confirma os hashes antes de instalar;
3. executa `npm ci --ignore-scripts --audit=false` com toolchain/config idênticos;
4. distingue `integrityMetadataConsistent` do plan de `artifactIntegrityVerified` após install;
5. executa exatamente `npm audit signatures --json --include-attestations` (sujeito somente à
   confirmação dessa sintaxe pelo protótipo com npm pinado) e registra separadamente
   `installationSignatureStatus` e `installationProvenanceStatus`, distintos do
   `candidateTrustAssessment` pré-HITL;
6. confronta `invalid[]`/`missing[]` com o graph local, confia signature positiva somente ao
   comando+exit+implementation digest pinados e valida cobertura positiva por package/location apenas
   para attestations em `verified[]`; bundles retornados ficam em artifacts `restricted`, minimizados
   após a validação;
7. lê o `package.json` instalado de todo node new/changed — ou de todo node no baseline — e compara
   lifecycle fields à metadata exata do registry, lock quando representado e policy;
8. aplica read-only seal a manifest, lock e `node_modules` e só então persiste completion record;
9. libera executor/gates somente após completion íntegro.

Nenhum lifecycle script roda. Pacote novo/alterado com lifecycle hook coberto pela policy v1, ou que
dependa dele para funcionar, é incompatível e exige replan. Divergência entre lifecycle metadata
vetada e installed package artifact descarta o attempt e hard blocks; o package nunca é executado.
O executor recebe o worktree somente depois de `dependencyMaterialization` íntegra.

Quando signing keys são anunciadas, registry signature ausente ou inválida bloqueia. Provenance tem
estados explícitos `absent | valid | invalid`: ausente é signal, inválida bloqueia e válida melhora a
evidência sem provar benignidade. A trust policy valida issuer, subject digest/name/version, source
repository/commit, builder e freshness. A verificação usa exclusivamente trust root, metadata e cache
Sigstore/TUF preprovisionados, verificados e pinados como material read-only da toolchain; hash,
origem e freshness integram `toolchainHash`/`policyHash`. Não há host dinâmico extra. Se o npm pinado
não verificar offline usando esse material e somente a allowlist de registry/API, o rollout fica
bloqueado; ampliar hosts requer ADR e mudança explícita de policy. JSON/exit do comando exato passa
pelo validator interno preso à distribuição, sem alegar schema version no payload.

### Candidate graph, closure, grandfathering e remoções

`candidateGraphHash` canonicaliza, por node, location, name/version, source/resolved host, integrity,
flags `dev`/`optional`/`peer`/`link`, platform constraints e edges resolvidas. `nodeIdentityHash`
inclui todos esses fatos e edges. O broker também persiste hashes canônicos dos conjuntos
`new`/`changed`/`grandfathered`, `canonicalClosureHash` por root e `resolutionSnapshotHash` das
versões/integridades observadas no registry.

- Dependências diretas e transitivas com `nodeIdentityHash` idêntico entre parent/candidate ficam fora do
  vetting detalhado. Elas não se tornam `preapproved` e ainda participam das verificações globais do
  candidate lock/audit necessárias para provar a instalação.
- Nó já presente no `baseSha` aprovado pode ser baseline. Nó introduzido em parent posterior ao
  `baseSha` só pode ser grandfathered quando o commit/step anterior do mesmo run contém broker
  provenance íntegra e exatamente vinculada; caso contrário, é new/changed e perde grandfathering.
- Toda dependência direta ou transitiva nova/alterada é derivada do candidate graph, auditada e
  registrada. O step não escolhe quais transitivas ignorar.
- Remoções são aplicadas pelo broker, comparadas ao parent, refletidas no candidate graph e auditadas;
  não exigem metadata de pacote novo. `removedClosureHash` é canonicalizado a partir do parent e o
  root/closure removido fica no state. Toda remoção emite no mínimo `approval_required`, mesmo que o
  root parent tenha entrada preapproved; não existe fast path de candidate root removido. Mudança
  colateral de transitiva é registrada.
- Source não registry, SRI ausente, SHA-1/algoritmo não aprovado, integridade divergente ou host final
  não aprovado bloqueia o grafo inteiro, inclusive no baseline.
- Optional registry dependency só é aceita quando graph, integrity e constraints da current target
  platform estão representados. Apenas a plataforma alvo atual, vinculada à toolchain, é suportada.
  Workspace, link e bundled dependency são hard block na v1.

Os bytes candidate, graph e resolution snapshot persistidos são a autoridade. A primeira resolução
transitiva pode variar com o registry; mesmos inputs locais **não** prometem o mesmo candidate em
outro momento. Resume reutiliza candidate completo existente e fresh. Se ele estiver ausente e uma
nova resolução produzir bytes/graph/snapshot diferentes, cria candidate e request novos e torna a
aprovação anterior stale; nunca regenera e chama o resultado de equivalente só pelos inputs locais.

### Severidade e relação com HITL

| Resultado | Condições | Efeito |
|---|---|---|
| `clean` | Todos os roots casam preapproval+closure exata e todos os nós/predicados passam, sem signal elevado | Prossegue sem pausa causada pelo vetting. |
| `approval_required` | Root/closure add/update limpo sem match preapproved, ou qualquer remoção | `RiskSignal` mínimo `approval_required`; checkpoint existente. |
| `restricted` | Um ou mais sinais heurísticos atingem os thresholds aprovados | `RiskSignal` `restricted`; pre e post-review existentes. |
| `blocked` | Falha técnica conclusiva | Hard block; HITL não sobrescreve. |
| `inconclusive` | Audit/registry/prova obrigatória indisponível ou incompleta | Hard no-install; HITL não sobrescreve. |

Hard technical blocks incluem: package/version inexistente pela prova de packument; input/source
inválido; integridade ausente, inválida ou divergente segundo policy; signature/provenance
criptograficamente inválida; candidate lock failure; source não registry; audit indisponível ou
incompleto; advisory `high`/`critical`; lifecycle script proibido; toolchain/config drift; e
manifest/lock/`node_modules` não declarado, adulterado ou não selado; workspace/link/bundled;
collateral manifest/lock diff; e limite de recursos excedido.

Provenance ausente, mas não criptograficamente inválida, é signal. Também são signals, conforme o
heuristic bundle aprovado: package/version recente, pouco histórico/downloads, mudança de
publisher/maintainer, deprecation, nome suspeito e crescimento incomum do grafo. Downloads solicitados
para closure unmatched e indisponíveis isoladamente elevam essa closure para `restricted`; closure
preapproved não consulta essa heurística. Nenhum desses signals é hard block isoladamente sem regra
futura explícita.

`changeType: vetted_dependency` só classifica o step na risk policy existente. A prova vem de
`dependencyVetting` íntegro e fresh. O broker primeiro persiste resultado/artifacts e chama
`recordRiskSignals`; somente então o orchestrator avalia o checkpoint HITL já existente.

### Bindings e freshness

Vetting, signals, approval request/decision e materialização são ligados a:

- `runId`, `stepId`, `baseSha` e parent SHA efetivo;
- `dependencyContractHash` e `policyHash`;
- `toolchainHash`;
- hashes dos candidate manifest/lock;
- `candidateGraphHash`, closure hashes, hashes dos conjuntos de classificação,
  `resolutionSnapshotHash` e node classification hash;
- `removedClosureHash` para cada remoção e worktree/integrated tree identity do completion;
- `effectiveConfigHash` e toolchain distribution digest/origin;
- `candidateTrustAssessmentHash`, `candidateSignatureMetadataStatus` e
  `candidateProvenanceStatus` pré-HITL;
- `integrityMetadataConsistent`, `artifactIntegrityVerified`, `installationSignatureStatus` e
  `installationProvenanceStatus` pós-install;
- audit/provenance artifact refs e hashes;
- classificação e fingerprints dos resultados/signals.

O completion `dependencyMaterialization` repete de forma autocontida: `operationId`, ref+hash do
`vettingResult` (inclusive resultado técnico próprio do baseline), `policyHash`, `dependencyContractHash`,
`toolchainHash`, todos os hashes de graph/closure/classificação incluindo remoções, refs+hashes do
approval request e da decisão **consumida** (ou marker explícito `noApprovalRequired`), refs+hashes de
freshness, audit, signatures, provenance e attestations, e a identidade exata do worktree/tree. Ref
sem hash, hash sem ref ou marker implícito invalida o completion.

Ao consumir uma decisão, sob lock e antes de qualquer efeito, o runtime revalida bindings/freshness e
persiste atomicamente uma transição de autorização de materialização ligada a `operationId` e à ref
da decisão consumida. Se o TTL expirou, reexecuta checks remotos/audit e torna o request stale diante
de qualquer drift semântico. Crash após consumo e antes do completion descarta integralmente a
tentativa. Sob o mesmo lock e com bindings exatos ainda fresh, a mesma decisão consumida pode ser
usada **somente** para terminar ou recriar a mesma operação idempotente de materialização; nunca
autoriza novo candidate, parent, worktree lógico ou `operationId`. Drift torna a autorização stale e
exige novo request. Um crash isolado não exige aprovação humana duplicada.

Timestamp de observação não participa do hash semântico. Alteração do npm major sempre invalida;
qualquer mudança coberta por `toolchainHash`, distribution digest ou `effectiveConfigHash` também.

### Ownership guards

Manifest, lock e seal de `node_modules` são conferidos:

1. imediatamente depois da materialização;
2. antes e depois do agente;
3. antes e depois de cada gate local/global ou outro subprocesso não-broker;
4. antes de review;
5. antes de acceptance;
6. antes de commit.

Qualquer divergência bloqueia tecnicamente e registra artifact sanitizado. O sandbox read-only é o
controle durante o subprocesso; o check posterior não é sua substituição. Gates e reviewer não rodam
sobre materialização insegura. Os mesmos manifest/lock paths continuam no diff factual, evidence e
commit; a ownership não os esconde do review.

## Data model

### Step v4

- `StepV4.dependencyChanges[]`: operações npm públicas exatas.
- `DependencyChange.action`: `add | update | remove`.
- `DependencyChange.name`, `section`, `manifestPath`, `lockfilePath`.
- `DependencyChange.targetVersion`: exata para add/update.
- `DependencyChange.fromVersion`: exata para update e, quando aplicável, remove.
- `dependencyContractHash`: hash da representação canônica fechada das mudanças ou do contrato
  baseline explícito com paths e tree hash.

### Dependency policy

- `DependencyPolicy.registry`: endpoint/hosts públicos aprovados.
- `DependencyPolicy.advisoryThreshold`: `high`.
- `DependencyPolicy.provenance`: semântica versionada para integridade/signatures/attestations.
- `DependencyPolicy.heuristics`: bundle version, thresholds e freshness aprovados.
- `DependencyPolicy.toolchain`: paths absolutos, versões, distribution digests/origin e config/flags.
- `DependencyPolicy.limits`: limites centrais medidos pelo protótipo.
- `DependencyPolicy.preapproved[]`: roots exatos com closure hash e approval evidence; inicialmente vazio.

### State schema v5

State v5 incorpora o state v4 de drift. Cada step expõe um resumo consultável por
dependência sem armazenar metadata pública detalhada:

```text
steps[].dependencyVetting:
  operationId
  status: clean | approval_required | restricted | blocked | inconclusive
  dependencyContractHash
  policyHash
  parentSha
  toolchainHash
  toolchainDistributionDigest
  effectiveConfigHash
  candidateManifestHash
  candidateLockHash
  candidateGraphHash
  resolutionSnapshotHash
  nodeClassificationHash
  newSetHash
  changedSetHash
  grandfatheredSetHash
  candidateTrustAssessmentHash
  candidateSignatureMetadataStatus
  candidateProvenanceStatus
  auditHash
  checkedAt
  directDependencies[]:
    name
    version
    action
    canonicalClosureHash
    removedClosureHash
    outcome
    reasonCodes[]
  artifactRefs[]
  approvalRequestRefs[]
  approvalDecisionRefs[]
```

O resumo no state cobre cada dependência direta solicitada; transitivos novos/alterados permanecem
consultáveis pelos artifact refs, sem inflar o state. Remoções registram root e
`removedClosureHash` do parent. Cada attempt e o worktree integrado global materializados mantêm
completion próprio; baseline sem mudança usa `mode: baseline` e não fabrica signal de mudança:

`canonicalClosureHash` é obrigatório para add/update; `removedClosureHash` é obrigatório e derivado
do parent para remove. O campo não aplicável fica ausente, nunca `null` ou copiado entre semânticas.

```text
attempts[].dependencyMaterialization ou worktrees[].dependencyMaterialization:
  mode: change | baseline
  scope: attempt | integrated-global
  operationId
  vettingResultRef
  vettingResultHash
  noApprovalRequired
  materializationAuthorizationRef
  materializationAuthorizationHash
  policyHash
  dependencyContractHash
  toolchainHash
  worktreeIdentityHash
  parentOrIntegratedTreeHash
  candidateManifestHash
  candidateLockHash
  candidateGraphHash
  canonicalClosureHashes[]
  removedClosureHashes[]
  nodeClassificationHash
  newSetHash
  changedSetHash
  grandfatheredSetHash
  removedSetHash
  resolutionSnapshotHash
  effectiveConfigHash
  toolchainDistributionDigest
  auditHash
  auditRef
  signatureReportHash
  signatureReportRef
  provenanceRef
  provenanceHash
  attestationRefs[]
  freshnessRef
  freshnessHash
  approvalRequestRef
  approvalRequestHash
  consumedDecisionRef
  consumedDecisionHash
  installationStatus
  integrityMetadataConsistent
  artifactIntegrityVerified
  installationSignatureStatus
  installationProvenanceStatus
  readOnlySealStatus
  completionId
  technicalCheckedAt
  artifactRefs[]
  startedAt
  completedAt
```

`noApprovalRequired` é um marker fechado com reason code e hash, mutuamente exclusivo de
`approvalRequestRef`/`consumedDecisionRef`; em modo `change`, ausência de ambos invalida o completion.
Todos os refs acima exigem seus hashes correspondentes e fazem parte do binding assinado/hasheado da
materialização, não são apenas links observacionais.

`checkedAt` e timestamps são metadados auditáveis, não prova. Packuments completos, maintainers,
publisher history e downloads ficam em artifact `restricted`, minimizado e com retenção definida.
Tokens, env, `.npmrc`, tarballs e bodies desnecessários são proibidos no state/artifact. Metadata
remota é minimizada e nunca é convertida em instrução ou texto de prompt para agente/reviewer.

Não há API HTTP ou mensageria nova. Os contratos públicos desta mudança são step v4, dependency
policy, state v5, artifacts e os bindings estendidos do HITL existente.

## Error handling

| Código | Condição | Comportamento |
|---|---|---|
| `STEP_V4_DEPENDENCY_CONTRACT_INVALID` | Entrada aberta, range/tag/source proibido, path ou versão incoerente | Bloqueia antes de rede/worktree e orienta replan. |
| `DEPENDENCY_CHANGE_UNDECLARED` | Step sem declaração altera manifest/lock | Hard block antes de gates/review; exige replan. |
| `DEPENDENCY_NOT_FOUND` | Packument canônico obtido e versão exata ausente, com confirmação coerente quando usada | `blocked`; 404 isolado permanece inconclusive. |
| `DEPENDENCY_REGISTRY_UNAVAILABLE` | Timeout, 5xx ou resposta ambígua | `inconclusive`; hard no-install, elegível somente a retry técnico dentro do budget. |
| `DEPENDENCY_SOURCE_FORBIDDEN` | Registry/source/host fora da allowlist | `blocked`; nenhuma resolução alternativa. |
| `DEPENDENCY_SOURCE_PREFLIGHT_FAILED` | Raw parent/request/baseline contém spec/source/redirect/path/link/workspace/bundled/config proibido ou leitura não é symlink/TOCTOU-safe | `blocked` antes da primeira invocação npm. |
| `DEPENDENCY_INTEGRITY_INVALID` | SRI ausente, SHA-1/algoritmo não aprovado ou digest divergente em qualquer artifact, inclusive baseline | `blocked`; descarta candidate/attempt. |
| `DEPENDENCY_REGISTRY_SIGNATURE_INVALID` | Signing keys anunciadas e registry signature ausente/inválida | `blocked`; separado de provenance. |
| `DEPENDENCY_PROVENANCE_INVALID` | Provenance presente e criptograficamente inválida | `blocked`; ausência válida vira signal, não este erro. |
| `DEPENDENCY_PROVENANCE_TRUST_UNAVAILABLE` | Trust root/metadata/cache offline ausente, stale ou npm pinado requer host não aprovado | `inconclusive`; bloqueia rollout/materialização, sem ampliar rede automaticamente. |
| `DEPENDENCY_CANDIDATE_LOCK_FAILED` | npm pinado não gera candidate válido ou há collateral diff | `blocked`; não promete repetibilidade de nova resolução futura. |
| `DEPENDENCY_MANIFEST_AUTHORITY_VIOLATION` | Campo não declarado do manifest ou lock collateral muda | `blocked`; descarta candidate e exige replan/correção. |
| `DEPENDENCY_AUDIT_INCONCLUSIVE` | Transporte/endpoint falha ou JSON é inválido/incompleto | `inconclusive`; exit e JSON são classificados separadamente. |
| `DEPENDENCY_REPORT_INVALID` | Report tem error, não casa validator/fixture da distribuição pinada, ou campo/payload local/count/omit/include/exit é inconsistente/truncado | `inconclusive`; não consome decision nem cria completion. |
| `DEPENDENCY_ADVISORY_BLOCKED` | Advisory high/critical | `blocked`; HITL não sobrescreve. |
| `DEPENDENCY_DOWNLOADS_UNAVAILABLE` | Heurística de downloads solicitada para closure unmatched falha | Signal `restricted`; closure preapproved não consulta downloads. |
| `DEPENDENCY_DOWNLOADS_CONTRACT_INVALID` | Window/bulk/scoped encoding/granularity viola contrato | Resultado heurístico inválido; no mínimo `restricted`, sem mascarar version risk. |
| `DEPENDENCY_LIFECYCLE_FORBIDDEN` | Nó novo/alterado declara/exige lifecycle proibido na v1 | `blocked`; exige alternativa/replan. |
| `DEPENDENCY_LIFECYCLE_ARTIFACT_DIVERGED` | Installed lifecycle difere de registry/lock/policy, inclusive baseline | Descarta attempt e hard blocks sem executar pacote. |
| `DEPENDENCY_TOOLCHAIN_DRIFT` | Node/npm/config/flags divergem | Hard block e invalidação dos bindings. |
| `DEPENDENCY_RESOURCE_LIMIT` | HTTP/JSON/graph/tarball/scratch/subprocess excede limite central | Hard block sem approval. |
| `DEPENDENCY_GRAPH_UNSUPPORTED` | Workspace, link, bundled dep ou optional sem graph/platform íntegros | Hard block v1. |
| `DEPENDENCY_OWNERSHIP_VIOLATION` | Bytes broker-owned mudam | Hard block antes do próximo subprocesso inseguro. |
| `DEPENDENCY_MATERIALIZATION_INCOMPLETE` | Completion record ausente/inválido | Descarta attempt/`node_modules` e recria clean worktree. |
| `DEPENDENCY_MATERIALIZATION_AUTHORIZATION_STALE` | Autorização consumida diverge de operation/candidate/parent/worktree/bindings/freshness | Descarta attempt e exige novo request; decisão nunca autoriza outra operação. |
| `DEPENDENCY_BASELINE_MATERIALIZATION_REQUIRED` | Worktree local/global não possui completion próprio | Bloqueia agente/gate até broker materializar e selar. |
| `DEPENDENCY_BROKER_SANDBOX_VIOLATION` | Broker tenta secret/socket/path/host fora da policy | Hard block; nenhum fallback sem sandbox. |
| `EXECUTOR_PROJECT_EXECUTION_FORBIDDEN` | Executor tenta qualquer processo/interpreter/tool/plugin, inspeciona pai ou adapter não prova no-exec | Nega ou desabilita adapter fail-closed. |
| `GIT_UNSAFE_CONFIGURATION` | Repo config/.gitattributes contém hook/filter/fsmonitor/signing/editor/helper/include/alias não allowlisted ou leitura muda/symlink | Bloqueia antes do primeiro checkout/worktree. |
| `GIT_SANDBOX_VIOLATION` | Git tenta rede, secret, child exec, config/env herdado ou path fora da policy | Hard block; sem fallback para Git direto. |
| `DEPENDENCY_BINDING_STALE` | Policy/parent/contract/candidate/audit/classificação mudou | Invalida decisão e usa novo request HITL existente. |
| `DEPENDENCY_STATE_CORRUPT` | State referencia artifact ausente/inválido | Falha terminalmente o run; não infere nem autoedita state. |

Falha transitória só recebe retry quando classificada como tal, com owner único no broker e dentro do
budget. 404 isolado, timeout e 5xx nunca viram not found. Completion record ausente/inválido nunca é
inferido da árvore: descarta attempt/`node_modules` e recria clean worktree. Mensagens e reason codes
são estáveis e sanitizados.

## Observability

- Registrar `operationId`, step, fase (`plan`, `vet`, `materialize`, `ownership-check`), status,
  duração, retry count, policy/toolchain hashes e contagens de nós grandfathered/new/changed/removed.
- Registrar chamadas por endpoint lógico, status classificado (`ok`, `not_found`, `unavailable`),
  deadline e resultado de retry sem URL dinâmica, query, header ou body sensível.
- Projetar no state o resumo por dependência, hashes, reason codes, artifact refs e timestamps.
- Registrar candidate/closure/graph/resolution/classification hashes, config/toolchain distribution e
  estados separados de metadata integrity, artifact integrity, registry signature e provenance.
- Registrar `mode` baseline/change, scope attempt/integrated-global, worktree identity e completion;
  distinguir baseline sem signal de mudança de vetting de add/update/remove.
- Registrar versão+distribution digest do npm e versão do validator/fixture interno, coverage local,
  counts/omit/include/exit e reason code; nunca alegar schema version no payload do npm.
- Registrar reconciliação como `reused`, `recomputed`, `reaudited`, `materialization-reconciled`,
  `discarded` ou `blocked`.
- Medir no protótipo latência, tamanho do grafo, crescimento, freshness e variação de metadata para
  fechar thresholds; não criar dashboard ou backend remoto nesta etapa.
- Documentar que `npm audit` envia o package graph ao registry público, inclusive em runs locais.

## Quality attributes

- **Fail closed:** ausência, ambiguidade, audit incompleto, source não aprovado ou binding stale
  impede instalação/agente; indisponibilidade não é convertida em inexistência ou sucesso.
- **Imutabilidade do candidate:** candidate manifest/lock, graph e resolution snapshot persistidos
  são autoridade. Mesmos inputs locais podem resolver diferente mais tarde e não prometem o mesmo
  candidate.
- **Reprodutibilidade:** materialização usa os bytes aprovados e `npm ci` pinado, sem scripts nem
  resolução posterior pelo agente.
- **Recuperabilidade:** crash antes do state deixa artifact sem autoridade; completion record
  ausente/inválido descarta integralmente attempt/`node_modules`, sem inferência por hash-tree.
- **Least privilege:** somente o broker acessa registry e escreve manifest/lock/`node_modules`;
  nenhum componente recebe credencial npm.
- **Auditabilidade:** uma decisão humana pode ser reconstruída até parent, policy, contrato,
  candidate graph, audit/provenance, signal e diff final.
- **Limite de escopo:** manifest e lock consomem o limite de cinco arquivos; o executor pode alterar
  no máximo os paths restantes do mesmo step.

## Threat model

| Ameaça | Controle |
|---|---|
| Agente instala pacote ou contorna prompt por subprocesso descendente | Sandbox coercitivo testa npm/npx/corepack/path absoluto/cache/tarball/Git/child; HOME/cache/config efêmeros e registry negado. |
| Agente adultera manifest/lock/node_modules depois do vetting | Deny-write para toda árvore, snapshot/seal read-only e guards antes/depois de subprocessos. |
| Gate executa pacote e tenta rede/escrita | Todo gate executável em worktree roda sandboxado, sem secrets, network deny-by-default e write paths mínimos; vetting não é prova de benignidade. |
| Executor usa credencial do provider para executar projeto | `agent:invoke` não concede project exec; child-exec deny coercitivo e provider config/credentials inacessíveis. |
| Adapter vaza credencial ao modelo/tool/filho ou permite process inspection | Credencial somente no provider transport; contexto, files, logs, child env e parent inspection negados; adapter incapaz desabilitado. |
| Broker privilegiado lê segredo ou escreve fora | Subprocessos broker em sandbox deny-first, sem HOME/sockets/secrets, com stores/paths/hosts exatos. |
| Dependency confusion ou registry privado | Nome/version exatos, registry público único, scoped package com registry efetivo validado e zero credenciais/custom `.npmrc`. |
| Tarball/source redireciona para host arbitrário | Todos os `resolved` hosts/sources do lock e transitivos são allowlisted; source não registry bloqueia. |
| Integridade ou signature é trocada entre vetting e install | Candidate bytes, integrity, policy/toolchain e artifacts hasheados; verificação repetida após `npm ci`. |
| Lifecycle script executa payload | `--ignore-scripts` sempre; hooks baseline são inspecionados/registrados sem executar e hook novo/alterado bloqueia. |
| Pacote typosquat parece legítimo | Heurísticas de nome/histórico/download/publisher/graph produzem signal restricted, sem decisão automática baseada em texto remoto. |
| Registry indisponível é confundido com pacote alucinado | Packument bem-sucedido + versão ausente prova not found; 404 isolado/timeout/5xx fica inconclusive. |
| Aprovação antiga autoriza candidate diferente | Bindings incluem parent, policy, contract, toolchain, candidate, audit/provenance e classificação; resume revalida freshness. |
| Metadata remota contém prompt injection ou PII pública | Conteúdo é dado não confiável; artifacts minimizados/restricted, sem repassar texto livre como instrução ao agente. |
| Audit revela dependências privadas | V1 proíbe registry/pacote privado, mas o graph público ainda é enviado ao registry e esse vazamento operacional é documentado. |
| `node_modules` entra no commit | Path ignorado/untracked, scope/commit checks e diff factual; sua exclusão não cria exceção para arquivos autorais. |
| Classificação `vetted_dependency` é usada como bypass | Acceptance exige prova de `dependencyVetting`; `changeType` nunca é evidência. |
| Config/env/toolchain envenena resolução | Paths/digests aprovados, config efetiva hasheada, env limpo e zero PATH/Corepack/download. |
| Git dispara hook/filter/helper ou lê config maliciosa ao criar/operar worktree | Safe wrapper única, preflight config/attributes symlink/TOCTOU-safe, config fechada, child-exec/network/secrets negados e ownership mantido. |
| Archive bomb ou grafo exaure host | Limites centrais de HTTP/JSON/graph/tarball/scratch/CPU/memory/time/output bloqueiam antes de approval. |

Risco residual: o registry público, signatures/attestations disponíveis e heurísticas não provam que
um pacote é benigno. O desenho reduz supply-chain risk e exige revisão proporcional, mas não executa
análise completa do código de terceiros.

## Risks

| Risco | Mitigação |
|---|---|
| Broker virar serviço privilegiado amplo | Módulo built-in pequeno, contrato fechado, dois hosts, sem credenciais e sem comando/URL autoral. |
| Npm/registry mudar JSON ou semântica de signatures | Toolchain/provenance semantics versionadas, fixtures de contrato e rollout bloqueado até protótipo. |
| Heurísticas produzirem falso positivo frequente | Baseline antes de thresholds, reason codes legíveis e HITL existente; não promover signal a hard block sem nova decisão. |
| `preapproved` esconder transitive alterada | Match por root+closure hash; qualquer alteração de closure perde fast path. |
| Grandfathering ocultar pacote antigo vulnerável | Audit global do candidate lock continua bloqueante; apenas metadata/heurística detalhada do nó inalterado é pulada. |
| Reaudit tornar decisões stale repetidamente | Freshness e hash semântico definidos por baseline; mudança real invalida, timestamp isolado não. |
| Manifest/lock ocupar duas vagas reduzir steps úteis | Limite permanece absoluto; replanejar em steps menores, sem exceção implícita. |
| `npm ci` sem scripts produzir pacote inutilizável | Bloquear lifecycle novo/alterado; baseline grandfathered permanece registrado, nunca executado. |
| Broker network escapar da allowlist | Resource dedicado, sandbox/policy deny-first e testes reais de host permitido/negado. |
| State v5 conflitar com drift v4 | Implementação sequencial, iniciada somente após os 15 steps de drift aprovados e estabilizados. |
| Risco MCP por `npx` continuar aberto | Follow-up explícito e documentação de que o broker de projeto não cobre catálogo MCP. |
| Gate carregar código de pacote malicioso | Sandbox obrigatório de gates; sem alegar que vetting prova benignidade. |
| Step sem dependencyChanges pular instalação segura | Materialização baseline obrigatória por worktree, com audit/advisory e completion próprio. |
| Report JSON válido esconder erro | Schema/semântica/graph/exit completos; qualquer inconsistência fica inconclusive. |
| Trust Sigstore/TUF exigir egress inesperado | Material offline pinado/read-only; rollout bloqueado até protótipo provar verificação sem host extra. |
| Crash após decisão consumida duplicar approval ou ampliar autoridade | Authorization transition atômica por operation; replay só conclui a mesma operação com bindings fresh. |

## Edge cases

- Add de pacote já presente na mesma seção; update com `fromVersion` divergente; remove ausente;
  troca entre `dependencies` e `devDependencies`.
- Scoped package cujo packument público existe, mas configuração efetiva tenta outro registry.
- Nome com casing/encoding ambíguo, packument bem-sucedido sem versão, 404 isolado de package/version
  e versão unpublished.
- Timeout depois de resposta parcial, 429 com `Retry-After`, 5xx, DNS failure e JSON inválido.
- Packument diz uma integridade e candidate lock registra outra; redirect/tarball host não aprovado.
- Raw parent/baseline já contém Git/URL/file/link/workspace/bundled/config proibido; preflight bloqueia
  antes de npm, inclusive quando npm resolveria ou normalizaria o input.
- Artifact baseline com SHA-1 ou sem SRI; não há grandfathering criptográfico na v1.
- Signing keys anunciadas com signature ausente/inválida; provenance ausente versus presente e
  inválida; provenance válida sem alegação de benignidade.
- Entry preapproved correta para root, mas closure hash muda por nova transitive, lifecycle/advisory
  ou edge/plataforma diferente.
- Remoção direta que remove várias transitivas; update direto que mantém versão mas altera lock
  devido a toolchain/config drift.
- Dependência já existente e inalterada com advisory high: grandfathering não neutraliza audit.
- Candidate graph cresce de modo incomum, mas todos os pacotes passam checks técnicos.
- Manifest e lock em paths exatos com dirname diferente; workspace/link/bundled; pares duplicados ou
  sobrepostos no mesmo step.
- Manifest candidate altera `scripts`, `engines`, `packageManager`, `overrides` ou outro campo não
  declarado; lock apresenta collateral diff sem derivação do request.
- `package-lock.json` muda sem `package.json`, ou bytes semanticamente equivalentes mas diferentes do
  candidate aprovado.
- Step v3 prevê manifest/lock, agente tenta alterar, sandbox nega ou guard detecta antes de gate.
- Agent não altera broker-owned paths, mas gate tenta formatar/regenerar lock; sandbox nega durante a
  execução e o guard posterior confirma a invariância antes de qualquer próximo gate/reviewer.
- Crash antes do artifact, entre artifact/state/signal/request, depois da decisão, no primeiro byte
  materializado, durante `npm ci` ou depois da instalação antes do state.
- Crash depois de persistir decisão consumida/autorização: retry recria somente o mesmo `operationId`
  sob bindings fresh; novo parent/candidate/worktree lógico exige request novo sem duplicar approval
  apenas pelo crash.
- Scratch/artifact órfão completo; state com ref corrompida; crash após npm ci e antes do completion
  record; attempt com manifest exato e `node_modules` parcial.
- HITL longo expira TTL; recheck igual permite consumo, enquanto novo audit/candidate/classificação
  torna request stale antes de consumo.
- Candidate ausente no resume e nova resolução transitive produz graph/snapshot diferente.
- Resume com novo parent, policy, dependency contract, npm major, candidate lock ou audit semântico.
- Retry técnico após registry voltar; replan após hard block; runtime approval seguida de tentativa
  de autoeditar `preapproved`.
- Cinco paths incluindo manifest/lock versus sexto path; `node_modules` acidentalmente staged.
- Pacote que declara lifecycle aparentemente opcional; na v1 permanece incompatível conforme policy.
- Download heuristic indisponível com checks técnicos disponíveis: produz signal `restricted`, nunca
  `clean`, `inconclusive` ou not found apenas por essa falha isolada.
- Executor/gate tenta npm, npx, corepack, path absoluto, cache offline, tarball local, Git source,
  child process ou escrita em `node_modules`.
- Executor tenta `node --loader`, shebang, `node_modules/.bin` ou child process usando provider env;
  adapter sem deny comprovado é desabilitado.
- Broker subprocess tenta ler `.env`, SSH/cloud credentials, seguir symlink/traversal, abrir socket ou
  escrever fora de scratch/cache/path broker-owned.
- Step v3/v4 sem dependencyChanges recebe baseline audit/install/seal; advisory high bloqueia sem
  criar signal/HITL de mudança.
- Worktree integrado global tem tree diferente do attempt e precisa de completion próprio antes dos
  gates globais.
- Audit/signatures retorna JSON válido com `error`, campo ausente, validator mismatch, truncamento,
  count/payload local/omit/include inconsistente ou exit incompatível.
- Downloads bulk recebe 129 packages ou scoped package; scoped encoding inválido; dado de package é
  confundido com popularidade da target version; processamento diário fica stale.
- Endpoint `/versions/{encodedPackage}/last-week` retorna mapa de versões sem `start`/`end`; broker
  deriva a janela. Point/range/bulk package-level nunca é rotulado como versão.
- Remoção de root preapproved: `removedClosureHash` vem do parent e ainda exige approval.
- Installed package.json introduz lifecycle hook ausente da metadata vetada.
- Baseline preserva hook grandfathered registrado sem executá-lo; qualquer divergência registry/lock/
  artifact ou hook novo/alterado bloqueia sem produzir vetting heurístico.
- Repo config ou `.gitattributes` tenta hook, filter process/clean/smudge, fsmonitor, signing, editor,
  credential helper, include/alias; symlink ou swap TOCTOU ocorre entre preflight e checkout.
- Operador tenta Git/IDE direto no worktree materializado; runbook oferece somente safe wrapper.
- Executor tenta `sh`, `bash`, `python`, `ruby`, env/proc inspection ou egress; adapter interno tenta
  filho fora de executable+argv allowlist ou com provider env.
- Attestation em `verified[]` é verificada por package/location e minimizada como artifact restricted;
  `missing[]`/`invalid[]` são confrontados com o graph, enquanto signature positiva depende do
  comando/exit/digest pinados. Trust cache offline stale/ausente bloqueia, sem host adicional.
- `npx` do MCP continua fora do broker e não herda status `clean` do projeto.

## Rollout / Rollback

1. Prototipar npm/registry/reports, comando de signatures+attestations, trust offline, SRI, downloads,
   graph, config poisoning e limites; toda mutação/orquestração permanece desabilitada.
2. Implementar e provar primeiro o sandbox coercitivo do broker e a policy genérica de processo:
   executor sem project/tool/interpreter exec, provider transport isolado e adapter incapaz disabled.
3. Remover registry/config npm de executores e provar que somente o broker alcança os dois hosts; não
   habilitar `planAndVet`, materialização, agente ou gates ainda.
4. Implementar/provar a safe Git wrapper e preflight config/attributes antes de qualquer checkout/
   worktree; substituir instruções humanas de Git direto no runbook.
5. Colocar todos os gates executáveis em worktree sob sandbox sem rede/secrets, com argv/writes
   fechados e ownership pré/pós.
6. Introduzir schemas/policy/state e executar source preflight, candidate generation/vetting/reports
   apenas em fixtures/scratch, sem criar worktree em runs reais.
7. Implementar materialização, completion bindings e recovery consumido/idempotente com agentes e
   gates desabilitados; provar descarte/recreate da mesma operation após crash.
8. Materializar baseline/changed worktrees locais e integrados em shadow mode, validando todos os nós,
   SRI forte, lifecycle, signatures/provenance e seal, sem liberar processos não-broker.
9. Fazer enablement final explícito e fail-closed no orchestrator somente após evidência dos itens
   anteriores; então liberar materialização → agente → gates e registrar evidência manual completa.

Rollback bloqueia novos runs de dependência, preserva state v5/artifacts e descarta worktrees não
commitados somente após reconciliação. Runtime anterior não retoma nem converte state v5, não
reconstrói decisão e não devolve registry ao executor. Commits já aceitos não são revertidos
automaticamente; remover uma dependência requer novo step/replan revisado.

### Evidência manual obrigatória

- Step v3 e v4 sem `dependencyChanges` recebem baseline completion; advisory high bloqueia sem
  request de mudança.
- Worktree integrado recebe completion distinto antes de gates globais.
- Executor falha para direct node, loader, shebang, `node_modules/.bin` e child process sem expor
  provider credentials/config; adapter sem enforcement permanece desabilitado.
- Executor falha também para shell/Python/Ruby, arbitrary binary/plugin, env/proc/parent inspection e
  egress; subprocesso interno do adapter usa allowlist fechada e não herda provider env.
- Broker sandbox nega `.env`, SSH/cloud credentials, socket, traversal/symlink e write outside.
- Git wrapper neutraliza hooks/filters/fsmonitor/signing/editor/helpers/config e bloqueia symlink/
  TOCTOU antes do primeiro worktree; operação humana usa wrapper, não Git/IDE direto.
- Todo gate executável em worktree prova network deny, env sem secrets e broker-owned paths read-only.
- Audit e signatures rejeitam error JSON, missing/validator mismatch/truncated/inconsistent local
  graph/count/omit/include/exit sem alegar schema version remoto.
- Fixture do npm pinado prova o comando exato com attestations, `missing[]`/`invalid[]`, cobertura
  positiva de attestations em `verified[]`, estados provenance absent/valid/invalid e trust
  Sigstore/TUF offline; necessidade de host extra bloqueia.
- Downloads prova sete dias, bulk 128/no-scoped, scoped encoding, daily staleness e package fallback.
- Remoção preapproved ainda solicita approval e registra `removedClosureHash` do parent.
- Installed lifecycle divergence bloqueia e descarta sem executar hook.
- Crash pós-npm-ci/pré-completion descarta attempt inteiro e reinstala em worktree clean.
- Crash pós-consumo usa a mesma decisão somente para a mesma operation fresh; drift exige request novo
  e crash sozinho não duplica aprovação.

## Acceptance criteria

- **AC-01:** Step v4 fechado exige requests npm públicos/exatos; ranges, tags, Git, URL, file,
  directory, private registry, custom `.npmrc`, workspace, link e bundled dependency bloqueiam.
- **AC-02:** `dirname(manifestPath)==dirname(lockfilePath)` define o único npm cwd e target direct é
  salvo exato; optional registry dependency só passa com graph/integrity/current platform completos.
- **AC-03:** Parent→candidate manifest altera somente dependency entries declaradas e preserva todos
  os demais campos; collateral manifest/lock diff tem hard block específico.
- **AC-04:** Step v3 sem declaração que altera manifest/lock bloqueia antes de gates/review; v1/v2
  seguem o contrato aceito de drift.
- **AC-05:** Manifest, lock e `node_modules` são broker-owned e deny-write para agentes, gates e
  descendentes; executor/gate só lê snapshot selado e canário prova que escrita é negada.
- **AC-06:** Manifest/lock permanecem em `predictedFiles`, diff/commit e limite de cinco;
  `node_modules` é runtime untracked e nunca entra no Git.
- **AC-07:** Executor usa HOME/cache/TMP efêmeros e `agent:invoke` sem capability genérica de processo;
  testes negam package managers, shells, Python/Ruby/Node, scripts/loaders/plugins/binaries, child,
  env/proc/parent inspection e egress.
- **AC-08:** Todo gate executável local/global em worktree roda sandboxado, sem classifier, secrets ou
  network, com broker-owned paths read-only e writes mínimos; MCP/read-only externo conserva contrato.
- **AC-09:** Ownership é checada antes/depois de cada subprocesso; check posterior não substitui o
  sandbox e nenhum processo não-broker acessa worktree antes do completion record próprio.
- **AC-10:** Dependency policy fechada vem do `baseSha`, contém registry/advisory/provenance/
  heuristics/toolchain/config/limits e começa com `preapproved: []`.
- **AC-11:** Preapproved root exige name+exactVersion+registry+integrity+canonicalClosureHash+
  approval metadata/evidence e nunca é criado por approval runtime.
- **AC-12:** Root preapproved com closure inalterada usa fast path; qualquer transitive/edge/fato que
  altere closure perde fast path e escala, sem lista manual de transitives.
- **AC-13:** Todo root precisa casar; status global é o máximo de roots/nós/predicados. Policy vazia
  impede fast path e exige no mínimo approval para additions/updates, inclusive major; teste fast
  path usa fixture/policy revisada.
- **AC-14:** `candidateGraphHash`, `nodeIdentityHash`, closure hashes, resolution snapshot e hashes
  new/changed/grandfathered incluem fatos, flags, platform constraints e edges definidos.
- **AC-15:** Grandfathering exige node identity parent==candidate; nó pós-baseSha exige broker
  provenance íntegra do commit/step anterior no mesmo run.
- **AC-16:** Candidate manifest/lock/graph/resolution snapshot persistidos são autoridade; mesmos
  inputs locais não prometem candidate futuro idêntico.
- **AC-17:** Candidate ausente que é re-resolvido de forma diferente cria candidate/request novo e
  torna approval anterior stale; nunca é chamado equivalente apenas pelos inputs locais.
- **AC-18:** Broker usa Node/npm por path absoluto/distribution aprovada, verifica digest/origin e
  nunca usa PATH, Corepack ou download de toolchain.
- **AC-19:** Config poisoning é bloqueado: HOME/cache/TMP isolados, config controlada, project
  `.npmrc` rejeitado, env/proxy/CA limpos e effective config completo hasheado.
- **AC-20:** Limites de HTTP/JSON/graph/tarball/scratch/CPU/memory/time/output vêm do protótipo;
  excedê-los é hard block sem approval.
- **AC-21:** `planAndVet` roda depois de lock/open/parent e antes de HITL, attempt, worktree e agente.
- **AC-22:** Audit/signatures usam validator+fixtures internos presos à versão e distribution digest
  exatos do npm, sem alegar schema version no payload; audit prova consistência com graph/payload local,
  omit/include/counts/comando/exit. Signature positiva é confiada ao comando/exit/implementation
  digest; somente attestations `verified[]` têm cobertura positiva observável por package/location.
- **AC-23:** Not found exige nome/encoding canônicos, packument bem-sucedido e versão exata ausente;
  404 isolado é inconclusive.
- **AC-24:** Downloads de versão usa `/versions/{encodedPackage}/last-week` e mapa por versão;
  `start`/`end` são derivados/corroborados pelo broker. Point/range/bulk são package-level, bulk tem
  máximo 128 e zero scoped, com freshness/granularity diária e reason code de fallback.
- **AC-25:** Plan registra `integrityMetadataConsistent`; pós-install registra
  `artifactIntegrityVerified`; uma condição não substitui a outra.
- **AC-26:** Depois de npm ci roda exatamente
  `npm audit signatures --json --include-attestations`, sujeito à confirmação da sintaxe no protótipo
  pinado; registry signature e provenance `absent|valid|invalid` têm estados separados.
- **AC-27:** Signing keys anunciadas com signature ausente/inválida bloqueiam; provenance ausente é
  signal, presente inválida bloqueia e válida não prova benignidade.
- **AC-28:** Trust de provenance valida issuer, subject digest/name/version, source repo/commit,
  builder e freshness conforme policy.
- **AC-29:** Nenhum lifecycle script roda; antes do seal, todo node new/changed e todos os nodes do
  baseline são comparados com registry exato/lock/policy. Hook grandfathered pode ficar registrado sem
  executar; divergência e hook novo/alterado descartam, sem heuristic vetting retroativo.
- **AC-30:** Sob lock e antes do efeito, o runtime revalida freshness/bindings e persiste atomicamente
  authorization transition ligada à decisão consumida e ao `operationId`; drift torna stale.
- **AC-31:** Crash pós-consumo descarta attempt; a decisão só conclui/recria a mesma operação
  idempotente sob bindings fresh, nunca outra candidate/parent/worktree/operation, e não exige approval
  duplicado apenas pelo crash.
- **AC-32:** Completion só existe após npm ci, integrity/signature checks e read-only seal. Registro
  ausente/inválido descarta todo attempt/`node_modules` e recria clean worktree, sem hash-tree inference.
- **AC-33:** Teste cobre crash depois de npm ci e antes do state, comprovando descarte integral.
- **AC-34:** State/bindings incluem graph/closure/resolution/classification hashes, integrity states,
  effectiveConfigHash e toolchain distribution digest, além dos vínculos anteriores.
- **AC-35:** Metadata remota fica minimizada em artifact restricted e nunca é passada como instrução
  a agente/reviewer.
- **AC-36:** Unlisted clean escala para `approval_required`; heurística/downloads failure de closure
  unmatched consultada escala para `restricted`; technical block nunca é sobrescrito pelo HITL.
- **AC-37:** Nenhuma pausa, decision file, waiver, agregador ou state machine paralela é criada;
  restricted conserva post-review bound ao diff.
- **AC-38:** Testes/evidência cobrem fast path/closure change, re-resolution diferente, graph hash,
  semantic diff, HITL longo, completion ausente, gate sandbox, config poisoning, limits, audit,
  404, signature/provenance, no-workspace/link/bundled e canários de write deny.
- **AC-39:** Documentação explica policy edit/closure entry, runtime approval não persistente, audit
  graph disclosure, retry/replan, candidate authority, gate sandbox e troubleshooting.
- **AC-40:** O risco `npx` do catálogo MCP permanece follow-up fora de escopo, sem alegação de
  cobertura pelo broker de dependências de projeto.
- **AC-41:** Todo worktree de agent/gate, inclusive step sem dependencyChanges, recebe baseline
  materialization própria com parent manifest/lock, freshness/audit, npm ci, signatures e seal;
  advisory bloqueia sem criar heurística/HITL de mudança.
- **AC-42:** Worktree integrado dos gates globais recebe completion broker-owned próprio vinculado à
  integrated tree antes de qualquer gate; completion local não é reutilizado.
- **AC-43:** Qualquer adapter sem process-boundary deny coercitivo é incompatível. Provider credentials
  ficam somente no transport confiável, fora de modelo/tool/files/logs/child env; subprocesso interno
  usa executable+argv allowlist, input não autoral, env limpo e network deny.
- **AC-44:** Todo subprocesso broker roda sandboxado com toolchain/stores read-only, scratch/cache e
  worktree paths exatos writable, dois hosts e sem HOME/secrets/sockets/unrelated files.
- **AC-45:** Testes do broker negam `.env`, SSH/cloud credentials, traversal/symlink, socket e write
  outside sem fallback.
- **AC-46:** Toda remoção persiste root+`removedClosureHash` do parent e gera no mínimo
  `approval_required`, sem preapproved fast path; candidate audit continua obrigatório.
- **AC-47:** Status global combina por máximo add/update/remove, roots, nós e predicados.
- **AC-48:** Manual/e2e cobre baseline v3/v4 sem mudança, global integrated completion, executor
  no-exec, broker sandbox, report semantic invalidity, downloads limits, removal approval e lifecycle
  artifact divergence.
- **AC-49:** Version risk exige granularity version; fallback package-level tem reason code próprio e
  nunca mascara target version; falha isolada gera `restricted` só para closure unmatched consultada.
- **AC-50:** Antes de qualquer npm, parent/baseline raw manifest+lock e requests passam por preflight
  symlink/TOCTOU-safe que bloqueia source/spec/host/redirect/path/link/workspace/bundled/config proibido.
- **AC-51:** Candidate só define fast path após revalidação raw completa e derivação dos hashes;
  closure preapproved pula detail/downloads, mantém checks técnicos e não vira restricted por falha de
  downloads que não foi consultado.
- **AC-52:** Todo artifact npm, inclusive baseline, exige SRI SHA-512 ou algoritmo centralmente
  aprovado igual/mais forte; SHA-1/ausência/unsupported bloqueia e não há exceção v1.
- **AC-53:** Attestation bundles são verificados por package/location, guardados restricted e
  minimizados. Trust Sigstore/TUF offline pinado/read-only integra policy/toolchain; host extra bloqueia
  rollout e exige ADR/policy change.
- **AC-54:** Completion contém operation/result/policy/contract/toolchain, todos os closure/
  classification/removal hashes, request+consumed decision ou marker no-approval, freshness/audit/
  signature/provenance/attestation refs+hashes e worktree identity.
- **AC-55:** Toda operação Git de checkout/worktree/add/diff/commit passa pela wrapper sandboxada sem
  rede/secrets/child exec; preflight config/.gitattributes neutraliza hooks, filters, fsmonitor,
  signing, editors, helpers e config não allowlisted com resistência a symlink/TOCTOU.
- **AC-56:** Ownership guards permanecem, Git não executa código do projeto/dependência e o runbook
  não instrui Git/IDE direto em worktree materializado.
- **AC-57:** Rollout prova broker sandbox, executor no-process, remoção do registry, safe Git e gate
  sandbox antes de o orchestrator habilitar materialização/agente/gates; enablement final é fail-closed.

## Open questions

1. **Toolchain exata:** quais versões exatas de Node/npm, lockfile version e configuração fechada
   reproduzem candidate generation, audit e signatures no macOS suportado? Responsável: protótipo;
   bloqueia o rollout, não a aprovação conceitual desta spec.
2. **Thresholds/freshness:** quais valores de recência, histórico, downloads, graph growth,
   deadlines, retries e validade de audit evitam tanto bypass quanto pausas excessivas? Responsável:
   baseline reproduzível; nenhum número será presumido.
3. **Sintaxe e trust offline de provenance:** o npm pinado aceita exatamente
   `npm audit signatures --json --include-attestations` e verifica signatures/attestations com trust
   Sigstore/TUF preprovisionado usando somente os hosts aprovados? Responsável: protótipo + review de
   segurança. Fixture deve cobrir package/location e `absent|valid|invalid`; resposta negativa bloqueia
   rollout, e host adicional exige novo ADR/policy.

## Implementation plan

1. Prototipar reports npm pinados, SRI, downloads e trust Sigstore/TUF offline com fixture de attestations (`scripts/workflow/prototype-dependency-vetting.cjs`, `scripts/workflow/fixtures/dependency-signatures.json`, `docs/audits/prosa-dependency-vetting-prototype.md`) — **3 paths**.
2. Introduzir step v4 e policy fechada sem enablement (`schemas/step.schema.json`, `workflow/dependency-policy.yaml`, `scripts/workflow/lib/dependency-policy.cjs`, `scripts/workflow/test-contracts.cjs`, `scripts/workflow/test-dependency-policy.cjs`) — **5 paths**.
3. Fechar sandbox coercitivo do broker/toolchain antes de qualquer integração (`scripts/workflow/lib/dependency-broker.cjs`, `scripts/workflow/lib/sandbox.cjs`, `scripts/workflow/lib/process.cjs`, `scripts/workflow/test-dependency-broker.cjs`, `scripts/workflow/test-sandbox.cjs`) — **5 paths**.
4. Tornar executor genericamente incapaz de project/tool/interpreter exec e isolar provider transport (`scripts/workflow/lib/opencode.cjs`, `scripts/workflow/lib/cursor.cjs`, `scripts/workflow/lib/local-adapter.cjs`, `scripts/workflow/test-opencode.cjs`, `scripts/workflow/test-cursor.cjs`) — **5 paths**.
5. Remover registry/config npm do executor e fechar capabilities/resources (`workflow/resources.yaml`, `scripts/workflow/lib/catalogs.cjs`, `scripts/workflow/lib/sandbox.cjs`, `scripts/workflow/test-catalogs.cjs`, `scripts/workflow/test-sandbox.cjs`) — **5 paths**.
6. Implementar safe Git wrapper, preflight config/attributes e testes adversariais (`scripts/workflow/lib/git.cjs`, `scripts/workflow/lib/sandbox.cjs`, `scripts/workflow/test-git.cjs`, `scripts/workflow/test-sandbox-runtime-macos.cjs`, `docs/workflows/automated-spec-pipeline-runbook.md`) — **5 paths**.
7. Sandboxar gates executáveis com ownership pré/pós (`scripts/workflow/lib/local-adapter.cjs`, `scripts/workflow/lib/sandbox.cjs`, `scripts/workflow/lib/process.cjs`, `scripts/workflow/test-sandbox.cjs`, `scripts/workflow/test-adapter.cjs`) — **5 paths**.
8. Fechar policies de gates locais/globais preservando MCP externo (`workflow/gates.yaml`, `scripts/workflow/lib/catalogs.cjs`, `scripts/workflow/test-catalogs.cjs`, `scripts/workflow/test-e2e.cjs`) — **4 paths**.
9. Implementar preflight raw symlink/TOCTOU-safe antes de npm, inclusive baseline (`scripts/workflow/lib/dependency-broker.cjs`, `scripts/workflow/lib/contracts.cjs`, `scripts/workflow/test-dependency-broker.cjs`, `scripts/workflow/test-contracts.cjs`) — **4 paths**.
10. Implementar graph/closure/removal/grandfathering e fast path pós-hash (`scripts/workflow/lib/dependency-graph.cjs`, `scripts/workflow/lib/dependency-vetting.cjs`, `scripts/workflow/test-dependency-graph.cjs`, `scripts/workflow/test-dependency-vetting.cjs`) — **4 paths**.
11. Implementar metadata mínima, downloads endpoint/granularity e not-found (`scripts/workflow/lib/dependency-metadata.cjs`, `scripts/workflow/test-dependency-metadata.cjs`) — **2 paths**.
12. Validar audit/signatures/attestations pelo npm pinado e trust offline (`scripts/workflow/lib/dependency-reports.cjs`, `scripts/workflow/lib/dependency-broker.cjs`, `scripts/workflow/test-dependency-reports.cjs`, `scripts/workflow/test-dependency-broker.cjs`) — **4 paths**.
13. Gerar/revalidar candidate exato e SRI forte, sem enablement (`scripts/workflow/lib/dependency-broker.cjs`, `scripts/workflow/lib/contracts.cjs`, `scripts/workflow/test-dependency-broker.cjs`, `scripts/workflow/test-contracts.cjs`) — **4 paths**.
14. Definir state v5, completion completo e artifacts minimizados (`schemas/state.schema.json`, `scripts/workflow/lib/dependency-vetting.cjs`, `scripts/workflow/lib/artifacts.cjs`, `scripts/workflow/test-state.cjs`, `scripts/workflow/test-artifacts.cjs`) — **5 paths**.
15. Persistir materialization authorization atômica e recovery da decisão consumida (`scripts/workflow/lib/hitl-decision.cjs`, `scripts/workflow/lib/runtime.cjs`, `scripts/workflow/lib/artifacts.cjs`, `scripts/workflow/test-hitl-decision.cjs`, `scripts/workflow/test-state.cjs`) — **5 paths**.
16. Materializar/selar/descartar operation incompleta com adapters ainda disabled (`scripts/workflow/lib/dependency-broker.cjs`, `scripts/workflow/lib/local-adapter.cjs`, `scripts/workflow/lib/runtime.cjs`, `scripts/workflow/test-dependency-broker.cjs`, `scripts/workflow/test-adapter.cjs`) — **5 paths**.
17. Validar lifecycle de todos os nodes baseline e new/changed sem executar hooks (`scripts/workflow/lib/dependency-broker.cjs`, `scripts/workflow/lib/dependency-vetting.cjs`, `scripts/workflow/test-dependency-broker.cjs`, `scripts/workflow/test-dependency-vetting.cjs`) — **4 paths**.
18. Integrar remoção approval e classificação máxima sem nova pausa (`scripts/workflow/lib/dependency-vetting.cjs`, `scripts/workflow/lib/risk-signals.cjs`, `scripts/workflow/test-dependency-vetting.cjs`, `scripts/workflow/test-risk-signals.cjs`) — **4 paths**.
19. Executar shadow materialization baseline/change local e integrada sem liberar processos (`scripts/workflow/lib/dependency-broker.cjs`, `scripts/workflow/lib/runtime.cjs`, `scripts/workflow/lib/local-adapter.cjs`, `scripts/workflow/test-dependency-broker.cjs`, `scripts/workflow/test-e2e.cjs`) — **5 paths**.
20. Atualizar documentação operacional, safe Git e follow-up MCP antes do enablement (`docs/workflows/automated-spec-pipeline.md`, `docs/workflows/automated-spec-pipeline-runbook.md`, `docs/workflows/prosa-development.md`) — **3 paths**.
21. Registrar evidência manual e shadow final da ordem segura, Git, process isolation, reports e recovery (`docs/audits/prosa-dependency-vetting-manual.md`) — **1 path**.
22. Fazer enablement transacional final fail-closed, expirando atomicamente a exceção de bootstrap (`scripts/workflow/lib/orchestrator.cjs`, `scripts/workflow/lib/state-machine.cjs`, `scripts/workflow/lib/local-adapter.cjs`, `scripts/workflow/test-state.cjs`, `scripts/workflow/test-e2e.cjs`) — **5 paths**.
