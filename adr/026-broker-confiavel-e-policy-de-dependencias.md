# ADR 026 — Broker confiável e policy de dependências

**Status:** Accepted
**Data:** 2026-07-19
**Spec:** [Vetting de dependências no pipeline prosa](../specs/prosa-dependency-vetting.md)
**Depends on:** [ADR 024](024-contrato-estruturado-de-implementacao-do-step.md) e
[ADR 025](025-fase-recuperavel-de-deteccao-de-drift.md)
**Supersedes parcialmente:** [ADR 021 — Sandbox de SO para chamadas de agentes](021-sandbox-de-so-para-chamadas-de-agentes.md), somente quanto ao acesso de executores ao registry npm; e o item 7 do [ADR 018 — Política Git, worktree, lock e commit](018-politica-git-worktree-lock-e-commit.md), somente quanto à execução de hooks em commits de worktrees materializados pelo pipeline. Dupla autorização e reconciliação no resume permanecem vigentes.

## Context

O pipeline executa agentes dentro de sandbox de SO e hoje `workflow/resources.yaml` permite
`registry.npmjs.org` aos resources de executor. O ADR 021 aceitou essa rede para destinos npm/GitHub,
mas não definiu ownership de manifest/lock, vetting do candidate graph ou uma fronteira confiável
para package manager.

Na prática, OpenCode não possui caminho suportado para `npm install`. Cursor é proibido por
prompt/PATH, mas o sandbox atual não intercepta completamente subprocessos descendentes. Portanto,
nem a ausência de uma interface no OpenCode nem a proibição do Cursor constitui uma capacidade
confiável de instalar com policy. Também seria incorreto afirmar que a interceptação atual já cobre
toda a árvore de package managers.

A etapa 2 fornece risk signals e HITL; a etapa 3 propõe step v3/state v4. Esta etapa precisa adicionar
dependências públicas sem entregar registry, package manager ou arquivos de resolução ao agente.

## Problem

Qual componente deve possuir resolução/materialização npm, rede do registry, manifest/lock/
`node_modules` e policy de aprovação, de forma que mudanças de dependência sejam declaradas e o
candidate persistido seja materializável e auditável sem
transformar o agente em autoridade sobre sua própria supply chain?

## Assumptions

- `recordRiskSignals` e checkpoints HITL existentes são reutilizáveis.
- ADRs 024/025 e a spec de drift são dependências aceitas; step v4/state v5 são sequenciais a esses
  contratos.
- O limite de cinco arquivos lógicos é absoluto e inclui manifest/lock.
- A v1 cobre somente npm público, sem credenciais, private registry ou custom `.npmrc`.
- Workspaces, links e bundled dependencies são proibidos na v1; somente a current target platform
  vinculada à toolchain é suportada.
- Node/npm/config exatos e thresholds serão fechados por protótipo antes do rollout.
- Todo worktree de agente/gate, mesmo sem dependency change, precisa de baseline materializado e
  completion próprio antes de executar processo não-broker.
- Toda operação Git que toca checkout/worktree será feita por fachada confiável; ownership checks
  continuam necessários, mas Git direto não é considerado seguro.

## Alternatives Considered

### A. Permitir npm ao agente dentro do sandbox

- **Prós:** menor wiring e experiência semelhante à de desenvolvimento manual.
- **Contras:** o agente controla request, resolução e arquivos de prova; prompt/PATH não intercepta
  descendentes de modo suficiente; registry vira canal de saída e lifecycle amplia execução.

### B. Deixar o agente editar manifest/lock e vetar somente o diff depois

- **Prós:** não muda a ordem inicial do pipeline.
- **Contras:** o pacote já influenciou o worktree/agente antes do vetting, lock malicioso pode chegar
  a gates/reviewer e a origem do candidate não é reproduzível.

### C. Proxy local transparente para todo acesso npm

- **Prós:** poderia centralizar allowlist e cache sem alterar clientes.
- **Contras:** ainda deixa o agente comandar o package manager e escolher operações; proxy aumenta
  superfície, lifecycle e recovery sem resolver ownership do manifest/lock.

### D. Serviço externo de vetting/materialização

- **Prós:** isolamento forte e possível centralização organizacional.
- **Contras:** adiciona autenticação, disponibilidade, transporte de graph e operação distribuída
  desnecessários para o produto local atual.

### E. Broker local built-in, policy do base SHA e ownership exclusivo

- **Prós:** menor privilégio, contrato fechado, candidate persistido como autoridade, reuse de state/artifacts e
  nenhuma credencial npm; separa intenção autoral da prova técnica.
- **Contras:** cria módulo confiável adicional, exige toolchain pinada e reduz arquivos restantes do
  step quando manifest/lock mudam.

## Decision

Adotar a alternativa **E**:

1. Criar um broker local built-in em módulo próprio, fora dos agentes. Somente ele pode consultar
   npm público, executar a toolchain pinada, produzir/materializar manifest+lock e criar/selar
   `node_modules` runtime.
2. Remover `registry.npmjs.org` dos resources de executor OpenCode/Cursor. O broker dedicado recebe
   allowlist exata `registry.npmjs.org` e `api.npmjs.org`, sem token, npm credentials, private
   registry, wildcard ou custom `.npmrc`.
3. Manifest, lockfile e `node_modules` passam a ser broker-owned. Sandbox aplica deny-write aos
   agentes e processos descendentes; executor só lê `node_modules` selado. Manifest/lock continuam
   obrigatórios em `predictedFiles`, diff e commit e consomem o limite de cinco arquivos.
   `node_modules` fica fora do Git apenas como materialização ignorada/untracked.
4. Introduzir step schema v4 fechado, sequencial ao v3 aceito, com `dependencyChanges` exato para
   `add|update|remove`: package name, `dependencies|devDependencies`, manifest/lock paths,
   `targetVersion` exata para add/update e `fromVersion` para update/remove quando aplicável.
5. Proibir range, tag, Git, URL, file, directory, registry privado, workspace, link, bundled
   dependency e configuração npm autoral.
   Scoped packages só usam o registry público efetivamente aprovado. Integridade é descoberta e
   provada pelo broker, não declarada pelo autor.
6. Steps v3 sem `dependencyChanges` continuam executáveis conforme a etapa 3, mas qualquer
   mudança manifest/lock é hard block `DEPENDENCY_CHANGE_UNDECLARED` antes de gates/review e exige
   replan. V1/v2 preservam a regra do draft de drift. Baseline usa contrato canônico próprio com
   mode/schema/paths/tree hash; nunca usa `dependencyContractHash` vazio ou implícito.
7. Criar `workflow/dependency-policy.yaml`, schema fechado e carregado/hasheado do `baseSha`, contendo
   registry permitido, advisory threshold, provenance semantics, heuristic bundle/freshness,
   toolchain contract e `preapproved`, inicialmente vazio.
8. Entrada futura de `preapproved` representa um root direct e contém name, exactVersion, registry,
   integrity, `canonicalClosureHash` e approval metadata/evidence. Approval runtime nunca persiste
   nem autoedita essa policy. Toda transitive/edge alterada muda a closure e perde fast path, sem
   exigir lista manual de transitives. Com a lista produtiva inicial vazia, toda adição ou update,
   inclusive major, exige ao menos approval runtime.
9. Canonicalizar candidate graph por location, name/version, source/resolved host, integrity, flags,
   platform constraints e edges. Grandfathering exige `nodeIdentityHash` idêntico parent/candidate.
   Nó já no `baseSha` pode ser baseline; nó introduzido depois exige broker provenance íntegra do
   commit/step anterior no mesmo run. Remoções continuam broker-owned e auditadas.
10. `changeType: vetted_dependency` permanece classificação de risco, nunca prova. A prova é o
    registro íntegro/fresh do broker.
11. Downloads `npx` do catálogo MCP permanecem fora desta fronteira e devem ser tratados em follow-up
    separado.
12. Exigir `dirname(manifestPath)==dirname(lockfilePath)` como npm cwd e permitir no manifest apenas
    dependency entries declaradas. Alteração de scripts, engines, packageManager, workspaces,
    overrides ou collateral lock diff é hard block.
13. Resolver Node/npm somente por path absoluto/distribuição aprovada no `baseSha`, verificando
    version/digest/origin, sem PATH/Corepack/download. Broker usa HOME/cache/TMP e config isolados,
    remove env/proxy/CA não aprovados e hasheia a configuração efetiva.
14. Aplicar limites centrais, vindos do protótipo, a HTTP/JSON/graph/tarball/scratch e subprocessos;
    excesso é hard block sem approval.
15. Todo gate executável local/global em worktree passa pela sandbox de SO deny-first, sem classifier,
    secrets ou rede, com broker-owned paths read-only e write paths mínimos. Gates MCP/read-only
    externos sem worktree materializado preservam seu contrato. Ownership é verificada antes/depois
    de cada subprocesso; check posterior não substitui sandbox.
16. Testar coercitivamente npm, npx, corepack, path absoluto, cache offline, tarball local, Git source,
    subprocess child e escrita em `node_modules` para executor e gates.
17. Separar `agent:invoke` de qualquer capability genérica de processo. A fronteira é processual:
    executor não inicia projeto, tool, interpretador, shell, script, binary, loader ou plugin, nem
    inspeciona env/processos/arquivos do pai. Credenciais do provider existem só no transport do
    adapter confiável, nunca em modelo/tool/files/logs/child env. Subprocesso interno inevitável usa
    executable+argv allowlist fechada, sem input autoral/provider env e sem rede. Adapter incapaz fica
    desabilitado fail-closed.
18. Rodar npm e todo helper do broker em sandbox de SO deny-first: toolchain/candidate/stores
    necessários read-only; scratch/cache efêmeros e paths broker-owned exatos writable; dois hosts;
    sem real HOME, secrets, sockets ou unrelated files.
19. Exigir materialização baseline e completion próprio em todo worktree local capaz de agent/gate,
    inclusive step sem `dependencyChanges`, e no worktree integrado dos gates globais. Baseline usa
    parent manifest/lock, freshness/audit, npm ci, signatures e seal; não emite signal/HITL de mudança,
    mas advisory técnico bloqueia.
20. Fazer toda operação Git que lê/escreve checkout/worktree por `scripts/workflow/lib/git.cjs`, com
    Git pinado em sandbox network-denied/no-secrets/no-child-exec e env/config fechados. Antes do
    primeiro checkout/worktree, preflight de repo config e `.gitattributes` por identidade estável
    bloqueia symlink/TOCTOU e neutraliza hooks, filters clean/smudge/process, fsmonitor, signing,
    editor/pager, credential helpers, aliases/includes e config system/global/user/repo não allowlisted.
    Git nunca executa código do projeto/dependência; runbook não instrui Git/IDE direto no worktree.
21. Antes de qualquer npm, inclusive baseline, validar raw parent manifest/lock e requests exatos com
    leitura symlink/TOCTOU-safe, bloqueando source/spec/host/redirect/path/link/workspace/bundled/config
    proibido. Todo artifact materializado exige SRI SHA-512 ou algoritmo centralmente aprovado
    igual/mais forte; SHA-1/ausência/unsupported bloqueia e não há exceção v1 sem novo ADR.
22. Implementar e provar broker sandbox, executor no-process, remoção do registry, safe Git e gate
    sandbox antes de qualquer enablement do orchestrator; a liberação final é explícita/fail-closed.

## Consequences

- **Positive:** agente deixa de controlar rede, resolução e bytes que provam a dependência.
- **Positive:** candidate graph e policy possuem uma trust root no base/parent aprovados.
- **Positive:** npm público opera sem credenciais e com hosts mínimos.
- **Positive:** manifest/lock permanecem visíveis no diff e sujeitos ao mesmo limite/review.
- **Positive:** gates que executam código do projeto deixam de herdar privilégios amplos; vetting não
  é confundido com prova de benignidade.
- **Positive:** steps sem dependency change e gates globais também recebem instalação comprovada e
  isolada, eliminando bypass pela ausência de vetting autoral.
- **Positive:** Git deixa de ser caminho implícito para hooks/filters/helpers executarem código.
- **Negative:** mudança comum de dependência consome duas das cinco posições antes do código/teste.
- **Negative:** suporte inicial exclui private packages, outros package managers e pacotes com
  lifecycle.
- **Negative:** broker e toolchain entram no trusted computing base e exigem testes adversariais.
- **Negative:** sandbox de todos os gates executáveis em worktree aumenta custo e amplia o rollout.
- **Neutral / to monitor:** grandfathering evita vetting retroativo caro, mas não equivale a
  preapproval; audit global ainda pode bloquear dependência antiga.

## Risks

| Risco | Mitigação |
|---|---|
| Broker acumular privilégios | API fechada, dois hosts exatos, sem credenciais/comando autoral e módulo separado. |
| Agent ainda alcançar npm por filho/cache/path | Deny de rede/escrita, HOME/cache/config efêmeros e matriz adversarial além de prompt/PATH. |
| Policy preapproved esconder transitive | Match root+closure exata; mudança de edge/node perde fast path. |
| Grandfathering parecer aprovação | Estado/ docs distinguem explicitamente inalterado de preapproved. |
| Limite de cinco ser contornado por generated file | Manifest/lock contam; somente `node_modules` untracked é runtime. |
| MCP ser anunciado como coberto | Non-goal e follow-up explícitos para catálogo `npx`. |
| Toolchain/config ser envenenada | Path/digest/origin aprovados, env limpo e `effectiveConfigHash`. |
| Gate executar pacote malicioso | Sandbox de SO, sem secrets/network e paths broker-owned read-only. |
| Executor executar projeto com provider credential | Capability separada, no-exec coercitivo ou adapter desabilitado. |
| Broker herdar privilégio do processo principal | Sandbox própria para todo subprocesso/helper e matriz de secrets/paths/sockets. |
| Git executar hook/filter/helper ou config maliciosa | Fachada única sandboxada, preflight config/attributes resistente a symlink/TOCTOU e config fechada. |
| Provider credential escapar pelo executor/filho | Credencial somente no transport, sem model/tool/files/log/child env; adapter sem deny processual é disabled. |
| Baseline preservar integridade fraca | SRI SHA-512 ou stronger para todo artifact; nenhuma grandfathering criptográfica v1. |

## Edge cases

- Scoped package com registry efetivo diferente do público.
- Manifest/lock em subdiretório com dirname diferente; workspace/link/bundled dependency.
- Step v3 prevê `package.json`, mas não possui `dependencyChanges`.
- Update com `fromVersion` divergente e remove de package ausente.
- Root preapproved recebe transitive/edge diferente e muda `canonicalClosureHash`.
- Dependência inalterada no parent recebe advisory high no audit atual.
- Agent/gate tenta regravar lock semanticamente equivalente, mas com bytes diferentes.
- `node_modules` aparece staged apesar da regra de ignore.
- npm/npx/corepack por PATH/path absoluto/cache/tarball/Git/child e gate tentando escrever no seal.
- Nó introduzido pós-baseSha sem broker provenance do step anterior.
- Step sem dependencyChanges com advisory high no parent: baseline bloqueia sem criar approval de mudança.
- Worktree integrado global tenta reutilizar completion de attempt local.
- Executor tenta node/loader/shebang/`node_modules/.bin`/child; adapter não consegue provar deny.
- Broker tenta ler `.env`, SSH/cloud credentials, seguir symlink/traversal ou escrever fora.
- Repo config/`.gitattributes` troca por symlink/TOCTOU ou configura hook/filter/fsmonitor/signing/
  editor/helper/include; operação bloqueia antes do primeiro worktree.
- Executor tenta shell/Python/Ruby/arbitrary binary, env/proc/parent inspection ou egress.
- Baseline contém source local/Git/workspace/bundled antes de npm ou artifact com SHA-1/sem SRI.

## Acceptance Criteria

1. Registry npm deixa todos os resources de executor e fica apenas no broker dedicado com os dois
   hosts exatos e zero credenciais.
2. Nenhum agente/descendente escreve manifest/lock/`node_modules` nem alcança package manager por
   npm/npx/corepack/path/cache/tarball/Git; executor só lê materialização selada.
3. Step v4 representa somente operações npm públicas e exatas; mudança não declarada em versão
   compatível bloqueia antes de gates/review.
4. Dependency policy vem do base SHA, começa vazia e preapproval root+closure só muda manualmente.
5. Closure alterada perde fast path; graph/node identity e provenance pós-baseSha tornam
   grandfathering auditável.
6. Manifest/lock contam no limite de cinco, aparecem no diff/commit e `node_modules` não é versionado.
7. A supersedência do ADR 021 fica limitada à rede npm do executor; suas demais decisões de sandbox
   permanecem inalteradas.
8. O risco `npx` de MCP é documentado como não coberto.
9. Manifest semantic authority, npm cwd único, no-workspace/link/bundled e collateral diff são
   validados antes da materialização.
10. Toolchain/config/digests e limites são confiáveis, fechados e testados contra poisoning/excesso.
11. Todos os gates executáveis em worktree rodam no sandbox de SO sem classifier, com env/rede/
   escrita mínimos e ownership pré/pós; MCP/read-only externo conserva contrato próprio.
12. Todo worktree local/global recebe baseline materialization/completion próprio antes de agent/gate,
   mesmo sem dependencyChanges; advisory bloqueia sem signal de mudança.
13. Executor possui somente `agent:invoke`; project exec é negado coercitivamente ou o adapter é
   desabilitado, mantendo provider config/credentials fora do projeto.
14. Todo subprocesso/helper broker é sandboxado e testes negam secrets, sockets, traversal/symlink e
    writes/hosts fora da policy.
15. Toda operação Git de checkout/worktree/add/diff/commit usa a fachada sandboxada; preflight
    fail-closed neutraliza config/attributes executáveis antes do checkout, ownership permanece e o
    runbook não usa Git/IDE direto no worktree materializado.
16. Executor não inicia qualquer processo de projeto/tool/interpreter e não vê pai/provider secrets;
    testes cobrem shell, Python, env, proc, egress e casos Node anteriores. Adapter incapaz é disabled.
17. Preflight raw parent/baseline/request ocorre antes de npm e SRI SHA-512 ou stronger é obrigatório
    para todo artifact, sem exceção v1.
18. Evidência prova broker sandbox, executor deny, registry removal, safe Git e gate sandbox antes do
    enablement final fail-closed do orchestrator.

## Trade-offs

Aceitamos aumentar o trusted computing base local com um broker pequeno para reduzir drasticamente o
privilégio do agente. Também aceitamos menor conveniência e escopo npm público/exato em troca de
materialização reproduzível do candidate persistido e auditabilidade, sem prometer re-resolução
idêntica. Um novo ADR será necessário para private registry, credenciais, outro
package manager, proxy compartilhado, serviço externo, workspace/link/bundled ou lifecycle scripts;
nenhum desses casos pode ser habilitado apenas ampliando a policy. Estendemos sandboxing a gates
porque executar testes pode carregar código de pacote; aceitar essa latência é preferível a afirmar
que vetting torna dependências benignas.
