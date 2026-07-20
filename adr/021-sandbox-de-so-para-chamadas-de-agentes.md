# ADR 021 — Sandbox de SO para chamadas de agentes

**Status:** Accepted
**Data:** 2026-07-18
**Spec:** [Sandboxing de sistema operacional na prosa](../specs/prosa-os-sandboxing.md)
**Supersedes parcialmente:** [ADR 017 — Execução segura por catálogo e trust boundary](017-execucao-segura-por-catalogo-e-trust-boundary.md)

## Context

O ADR 017 colocou gates e agentes atrás de catálogos carregados do base SHA, argv estruturado,
ambiente mínimo e aceite determinístico. Ele registrou, porém, que o processo local conservava os
privilégios do usuário, não havia sandbox de sistema operacional e OpenCode era o único executor
inicial. A inclusão do adapter Cursor e a execução de código não confiável tornam insuficiente usar
worktree, prompt e permissões da ferramenta como fronteira coercitiva.

O protótipo descartável no macOS com `@anthropic-ai/sandbox-runtime@0.0.66` confirmou que o backend
`sandbox-exec` bloqueia `.env` com `EPERM` quando o arquivo entra em `credentials.files` deny,
bloqueia escrita do reviewer com `EPERM`, bloqueia rede com allowlist vazia e bloqueia `listen` em
Unix socket com `EPERM`. Também confirmou que argv contendo espaços e metacaracteres chega ao alvo
sem alteração semântica quando serializado pelo wrapper controlado. Em 15 amostras, as medianas
foram 51,97 ms raw e 247,14 ms sandboxada: overhead de 195,17 ms, ou 375,6%.

## Problem

Como mover as chamadas de executor, reviewer e diagnostician de OpenCode e Cursor para uma trust
boundary imposta pelo SO, sem acoplar o core à API instável do fornecedor, sem permitir fallback e
sem reabrir shell arbitrário, gates ou MCP?

## Assumptions

- O catálogo do base SHA continua sendo configuração confiável; spec, step e worktree não definem
  paths, domínios, sockets ou opções do sandbox.
- O suporte inicial é macOS com `sandbox-exec`; outro backend só se torna suportado após validação
  adversarial equivalente.
- O SRT 0.0.66 requer internamente uma representação de comando interpretada por shell. Esse detalhe
  pode ser confinado à camada anticorrupção sem expor strings de comando aos demais módulos.
- Gates, MCP servers e notificadores permanecem fora desta decisão.

## Alternatives Considered

### A. Manter worktree, prompt deny-first e permissões nativas dos CLIs

- **Prós:** nenhuma dependência preview e menor latência.
- **Contras:** Cursor continua confiando no modelo; processos filhos, filesystem, rede e sockets
  permanecem com os privilégios do usuário.

### B. Chamar diretamente a API do SRT em cada adapter

- **Prós:** wiring curto por adapter.
- **Contras:** espalha tipos e comportamento `0.0.x`, duplica policy e cleanup e torna provável um
  fallback diferente entre OpenCode, Cursor e papéis.

### C. Porta canônica fail-closed e adapter único para SRT 0.0.66

- **Prós:** uma policy normalizada, um ponto auditável de quoting, lifecycle e tradução de erros;
  permite trocar o runtime sem mudar os adapters de agentes.
- **Contras:** adiciona uma camada e mantém o custo de startup medido no protótipo.

### D. Containers ou microVMs

- **Prós:** isolamento mais conhecido e portável em ambientes controlados.
- **Contras:** aumenta pré-requisitos e latência, altera o produto local e excede o escopo aprovado.

## Decision

Adotar a alternativa **C**, com as seguintes invariantes:

1. O core usa uma porta local com input estruturado (`executable`, `args`, `cwd`, ambiente mínimo,
   limites e `SandboxPolicy`). Somente `scripts/workflow/lib/sandbox.cjs` conhece
   `@anthropic-ai/sandbox-runtime`, pinado exatamente em `0.0.66` no manifest e lockfile.
2. A camada anticorrupção normaliza e valida a policy antes de inicializar o SRT, traduz sua policy
   canônica para a configuração do fornecedor, exige o backend suportado e controla init, spawn e
   cleanup. Pacote ausente, backend degradado, erro de init ou cleanup não comprovado falha fechado;
   não existe runner direto de agentes como fallback.
3. O shell interno inevitável do SRT fica encapsulado nessa camada. Nenhum chamador fornece command
   string. O wrapper serializa apenas executable e argv já validados, usando quoting determinístico
   coberto por vetores com espaços, aspas e metacaracteres. Isso não altera a proibição do ADR 017
   para gates: eles continuam em argv com `shell: false` e estão fora do sandbox desta etapa.
4. `workflow/resources.yaml` cataloga uma policy por resource de agente. A policy é deny-first:
   filesystem limitado ao target canônico; arquivos sensíveis mapeados para `credentials.files`
   deny; reviewer e diagnostician sem escrita; rede vazia por default e allowlist exata por
   resource; Unix sockets e opções fracas sempre negados. Executor pode acrescentar somente os
   destinos aprovados de GitHub/npm; papéis read-only recebem apenas endpoints do provider.
5. OpenCode e Cursor, nos papéis executor, reviewer e diagnostician, passam pela mesma porta. A
   policy é resolvida do catálogo aprovado, nunca do step. Toda a árvore de filhos do CLI fica sob o
   mesmo sandbox.
6. O state schema evolui de forma incompatível. Antes de cada spawn, persiste a policy normalizada
   por `step` e papel, seus dados de engine/backend/plataforma e hash. O `attempt` de execução
   referencia `sandboxPolicyHash`; as applications registram executor, reviewer e diagnostician.
   Artifacts e operation IDs carregam o mesmo vínculo. Resume reaplica a policy persistida e bloqueia qualquer drift de resource, runtime,
   path, domínio, socket ou hash; ausência de policy não significa default.
7. Diagnósticos registram somente código estável, papel, regra e resource normalizados, duração de
   init/exec/cleanup e stderr sanitizado. Tokens, headers, query strings, bodies, env values e
   conteúdo de arquivos não são persistidos.
8. Quando o target é um linked worktree, a policy `2` registra uma fachada Git privada e efêmera. A
   porta materializa no scratch um gitdir com config fechada, index privado e object store comum
   somente por alternate read-only; `GIT_DIR`/`GIT_WORK_TREE` impedem o CLI de escrever no gitdir
   compartilhado. Snapshots de reviewer e diagnostician não recebem fachada Git.

## Consequences

- **Positive:** a fronteira coercitiva passa de convenção do agente para filesystem, rede e IPC do
  SO, cobrindo os dois CLIs e processos filhos.
- **Positive:** policy e vínculo policy-step-attempt tornam execução e resume auditáveis.
- **Positive:** detalhes preview e o shell interno do SRT ficam concentrados e substituíveis.
- **Positive:** estado interno do CLI, como `opencode`, fica no gitdir efêmero e não altera metadata
  Git compartilhada.
- **Negative:** cada chamada paga startup relevante; o baseline atual é 195,17 ms/375,6% de
  overhead no harness curto, não um SLO de chamadas reais.
- **Negative:** macOS torna-se o único backend inicialmente suportado e upgrades exigem repetição da
  bateria adversarial.
- **Neutral / to monitor:** a allowlist reduz destinos, mas domínio permitido continua sendo canal
  de saída; a defesa principal é não disponibilizar segredos.

## Risks

| Risco | Mitigação |
|---|---|
| API `0.0.x` mudar | Pin exato, lockfile, teste contratual e upgrade manual revisado. |
| Quoting transformar argv em shell injection | Um único serializer privado e vetores adversariais de round-trip. |
| Policy ampla ou controlada pelo worktree | Origem exclusiva no catálogo do base SHA e validação semântica fechada. |
| Cleanup deixar estado global/proxy ativo | Bloqueio de novas chamadas e erro `SANDBOX_CLEANUP_FAILED`. |
| Resume regenerar privilégios diferentes | Persistência antes do spawn e comparação de policy hash fail-closed. |
| Domínio permitido exfiltrar dado | HOME/TMP isolados, ambiente mínimo e `credentials.files` deny. |

## Edge cases

- `.env` ou credencial dentro do próprio target permitido, path com symlink e troca de ancestor
  entre validação e spawn.
- Reviewer ou diagnostician tentando criar, renomear ou remover arquivo no snapshot.
- Allowlist vazia, resolução DNS para domínio não catalogado e tentativa de Unix socket `connect` ou
  `listen`.
- Argumentos vazios, com espaços, aspas, `$()`, `;`, newline ou glob, sem mudança do argv observado.
- Crash após persistir policy e antes do spawn, ou após spawn e antes de persistir artifact.
- State antigo, backend diferente, versão do SRT divergente ou cleanup sem confirmação.

## Acceptance Criteria

1. Nenhuma chamada de agente OpenCode/Cursor para os três papéis contorna a porta sandboxada.
2. Policies vêm de resources catalogados e bloqueiam filesystem sensível, escrita read-only, rede
   não aprovada e Unix sockets em teste real macOS.
3. Falha do runtime, backend, init ou cleanup produz erro estável e zero fallback.
4. State e artifacts provam o vínculo policy-step-attempt e resume bloqueia qualquer drift.
5. O shell interno do SRT não é exposto aos chamadores e os vetores adversariais preservam argv.
6. Dependência e lock estão pinados em `0.0.66`, auditados e documentados.

## Trade-offs

Aceitamos uma dependência research preview e um overhead alto em comandos artificiais curtos para
obter isolamento coercitivo local sem adotar containers. Preservamos o contrato estruturado do ADR
017 no core e abrimos uma exceção estritamente encapsulada apenas porque o SRT exige shell
internamente. Reabrir esta decisão se a versão pinada deixar de garantir deny de credenciais,
read-only, rede ou sockets, se o cleanup não for determinístico, ou se outro backend oferecer a
mesma proteção com menor acoplamento. Uma mudança desse tipo exige novo ADR; não se relaxa para
execução direta.
