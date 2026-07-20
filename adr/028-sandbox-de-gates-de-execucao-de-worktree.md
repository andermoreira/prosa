# ADR 028 — Sandbox de gates de execução de worktree com policy assimétrica

**Status:** Accepted
**Data:** 2026-07-19
**Spec:** Hardening de gates da prosa (a criar)
**Supersedes parcialmente:** [ADR 021 — Sandbox de SO para chamadas de agentes](021-sandbox-de-so-para-chamadas-de-agentes.md), [ADR 017 — Execução segura por catálogo e trust boundary](017-execucao-segura-por-catalogo-e-trust-boundary.md)

## Context

O ADR 021 moveu executor, reviewer e diagnostician para uma trust boundary imposta pelo SO, com
filesystem confinado, rede allowlist, sockets negados e credenciais deny. Ele deixou explícito que
gates, MCP servers e Git permaneciam fora daquela decisão.

A revisão ponta a ponta do sandbox constatou que os gates locais executam **código do worktree que o
executor acabou de escrever, sem sandbox**. Em `runGate`, o gate roda por `runProcess` direto; o
único isolamento é `HOME`/`TMPDIR` temporários e `networkSandbox: false` explícito. O processo do
gate mantém rede real, filesystem real por path absoluto (o `HOME` efêmero só quebra expansão de
`~`) e Unix sockets reais. O gate executa no worktree do step, na fase `GATING`, **antes** do review
e do commit humano.

`workflow-tests` é `node --test scripts/workflow/test-*.cjs`, e nas specs da própria prosa
`allowedAreas` inclui `scripts/workflow`. Um executor confinado — ou um modelo seguindo instrução
injetada por dependência, README ou diff — escreve um arquivo de teste e o gate o executa com
privilégio pleno do usuário. A fronteira mais cara do sistema (SRT no executor, ~375% de overhead)
fica contornável pelo caminho mais barato: um arquivo de teste.

Fatos verificados que restringem a solução: `verify.sh` usa `npm ci --dry-run` (offline); os testes
de workflow são unitários com mocks e não requerem rede real; `node_modules` fica na raiz do repo,
acima do worktree, exigindo leitura ampla de qualquer gate sandboxado. Gates `type: mcp` acessam
servidores externos por design e correm por outro caminho (`runMcpGate`), fora de `createGateEnvironment`.

O escopo operacional permanece single-user na máquina do desenvolvedor (NOTE-03 da spec risk-hitl: o
usuário local é a autoridade; defesa contra processo malicioso do mesmo usuário está fora de escopo).
O adversário realista é prompt injection / modelo desalinhado, não um processo local hostil do dono.

## Problem

Como impor uma trust boundary aos gates que executam código do worktree, fechando o bypass do
sandbox de agente, sem herdar a fragilidade de manutenção do deny-read agressivo da policy de agente,
sem quebrar gates legítimos que precisam de leitura ampla, e sem reabrir shell, MCP ou execução
direta?

## Assumptions

- O código executado por um gate de worktree é não confiável na mesma medida que o output do executor.
- O pior desfecho realista é **exfiltração** (credencial ou código saindo da máquina) e, em segundo
  lugar, **persistência fora do worktree** (plantar artefato que não entra no diff revisado).
- Leitura de segredo pelo gate, sem rede para vazá-lo e sem escrita fora do worktree, é dano contido:
  conteúdo escrito dentro do worktree entra no diff que o humano revisa antes de commitar.
- Gates MCP mantêm sua rede por design e permanecem fora desta decisão.
- O catálogo do base SHA continua a única fonte confiável de policy; o worktree não define privilégios.

## Alternatives Considered

### A. Sandboxar os gates com a mesma policy dos agentes (deny-read agressivo, allowlist estreita)

- **Pros:** um único modelo de policy; segredos invisíveis também ao gate.
- **Cons:** a policy de agente usa `denyRead: ['/']` com allowlist estreita; cada leitura de
  bootstrap negada vira um probe a suprimir à mão. `node --test` e `verify.sh` invocam dezenas de
  ferramentas (node, bash, git, o pack inteiro), multiplicando a lista frágil já apontada na revisão.
  Exige ainda expor `node_modules` ancestral e possivelmente rede para partes do verify. Custo e
  manutenção desproporcionais ao ganho num sistema single-user.

### B. Aceitar como risco residual e apenas documentar

- **Pros:** custo zero de implementação.
- **Cons:** deixa um bypass do mesmo tamanho ao lado da fronteira que a etapa 1 pagou caro para
  fechar. O gate reabre exatamente o vetor de prompt injection que o sandbox de agente eliminou.

### C. Reordenar para revisar antes de rodar os gates

- **Pros:** o humano veria o arquivo hostil antes da execução.
- **Cons:** não resolve — testar a mudança é executar código não confiável; o gate ainda roda o
  código. Além disso inverte a lógica de o gate fornecer evidência ao review.

### D. Policy de gate assimétrica na mesma porta: leitura ampla, sem rede, sem escrita externa, sem sockets

- **Pros:** corta os dois desfechos que importam (exfiltração e persistência externa) com a fração
  do custo de A. Como a leitura é ampla, quase nada é negado no filesystem e a lista de supressão de
  violações praticamente não cresce — a fragilidade de A desaparece por inversão do deny-read.
  Reutiliza a porta e a engine já pinadas; nenhuma dependência nova.
- **Cons:** o gate ainda pode ler segredos (contido por não ter rede) e escrever dentro do worktree
  (contido pelo review humano do diff). Aceita risco residual coerente com single-user.

## Decision

Adotar a alternativa **D**, com as seguintes invariantes:

1. Gates executáveis não-MCP que rodam sobre o worktree passam a executar pela porta sandboxada do
   ADR 021 (`@anthropic-ai/sandbox-runtime@0.0.66`, backend `sandbox-exec`, macOS), não mais por
   `runProcess` direto. Gates `type: mcp` permanecem fora desta decisão.
2. A **policy de gate** é catalogada e distinta da policy de agente, deliberadamente assimétrica:
   - **filesystem:** leitura ampla (inclui o worktree e o `node_modules` ancestral necessário);
     **escrita negada fora do worktree**; a fronteira é a contenção de escrita, não a ocultação de leitura.
   - **rede:** allowlist **vazia** — nenhum destino de saída.
   - **unixSockets:** negados; sem Apple Events e sem modos fracos, como no ADR 021.
3. A origem da policy é exclusivamente o catálogo do base SHA aprovado. Worktree, spec, step e output
   de agente não definem paths, rede ou opções do gate.
4. O deny-read agressivo do ADR 021 **não** se aplica ao gate: reintroduzir supressão de leituras de
   bootstrap para a cadeia do gate é explicitamente rejeitado, porque a leitura ampla é o que mantém
   a lista de violações pequena e o objetivo do gate é contenção de saída, não sigilo de entrada.
5. Falha de runtime, backend, init ou cleanup do gate falha fechado com os mesmos códigos estáveis do
   ADR 021; não há fallback para execução direta do gate.
6. O threat model alvo permanece single-user. A leitura ampla é aceitável somente sob essa premissa;
   executar o pipeline em CI ou máquina compartilhada exige nova decisão que restaure o deny-read
   completo, aceitando a fragilidade correspondente.

## Consequences

- **Positive:** o bypass do sandbox de agente pelos gates é fechado para os dois piores desfechos
  (exfiltração e persistência externa), com custo e fragilidade muito menores que a policy de agente.
- **Positive:** a inversão leitura-ampla/rede-vazia mantém a lista de supressão de violações pequena,
  em vez de multiplicá-la pela cadeia de ferramentas do gate.
- **Positive:** reutiliza a engine já pinada e auditada; nenhuma dependência nova.
- **Negative:** cada gate de worktree paga o startup do sandbox, somando ao overhead já medido no ADR 021.
- **Negative:** um gate hostil ainda lê o filesystem local (contido por ausência de rede) e escreve
  dentro do worktree (contido pelo review humano); ambos são risco residual aceito.
- **Neutral / to monitor:** a premissa single-user está embutida na leitura ampla; mudança de ambiente
  de execução é o gatilho documentado para reabrir a decisão.

## Trade-offs

Aceitamos que o gate leia dados locais e escreva no worktree para não pagar o custo de manutenção do
deny-read agressivo num sistema single-user, cortando em troca os canais de saída — rede e escrita
externa — que transformam leitura em dano real. Preservamos a opção de endurecer para deny-read
completo se o ambiente de execução mudar. Reabrir esta decisão se a versão pinada do SRT deixar de
garantir negação de rede ou contenção de escrita para a policy de gate, se a leitura ampla deixar de
ser aceitável por mudança de threat model, ou se a fragilidade de supressão reaparecer apesar da
leitura ampla. Uma mudança desse tipo exige novo ADR; não se relaxa para execução direta do gate.
