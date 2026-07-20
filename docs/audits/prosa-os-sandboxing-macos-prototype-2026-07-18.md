# Protótipo do sandbox de SO da prosa no macOS

**Data:** 2026-07-18
**Runtime:** `@anthropic-ai/sandbox-runtime@0.0.66`
**Plataforma:** macOS (`darwin`), backend `sandbox-exec`
**Node:** 26.5.0

## Objetivo

Validar os controles necessários antes de integrar o SRT às chamadas de agente da prosa. O
experimento usou um diretório descartável fora do repositório e não criou um modo sem sandbox no
pipeline.

## Método

O pacote foi baixado pelo npm com versão exata, instalado com scripts ignorados e executado pelo
CLI `srt --settings <arquivo>`. As policies de teste tinham rede e Unix sockets vazios. O executor
podia escrever na fixture; o reviewer tinha `allowWrite: []`. A fixture continha `.env` declarado
em `credentials.files` com `mode: deny`.

Vetores executados:

1. leitura de arquivo comum no target;
2. leitura de `.env` dentro do target permitido;
3. escrita do reviewer no target;
4. HTTPS para domínio fora da allowlist;
5. criação de Unix socket com `net.Server.listen`;
6. round-trip de argv com espaço, `$()`, aspas e `;`;
7. benchmark de processo Node vazio, com warm-up e 15 amostras por modo.

## Resultados

| Vetor | Resultado observado |
|---|---|
| Arquivo comum | Leitura permitida. |
| `.env` no target | Bloqueado com `EPERM` por `credentials.files: deny`. |
| Escrita do reviewer | Bloqueada com `EPERM`. |
| Rede com allowlist vazia | Bloqueada; a conexão não alcançou o destino. |
| Unix socket `listen` | Bloqueado com `EPERM`. |
| Argv adversarial | Valores chegaram inalterados; nenhum metacaractere foi executado. |

Saída observada no teste de argv:

```json
["space value","$(touch injected)","'; exit 99; '"]
```

## Latência

Medianas de 15 amostras no mesmo host:

| Modo | Mediana |
|---|---:|
| Processo Node sem wrapper | 51,97 ms |
| Processo Node via SRT | 247,14 ms |
| Overhead absoluto | 195,17 ms |
| Overhead relativo | 375,6% |

O percentual alto descreve um processo vazio de aproximadamente 52 ms. Não é SLO nem estimativa
direta para chamadas de IA, cujo tempo de execução é muito maior. O valor útil para planejamento é
o custo fixo observado de aproximadamente 195 ms por inicialização.

## Limitações

- O experimento não validou Linux, Windows nem modos enfraquecidos.
- O Docker socket não existia no host; o bloqueio de IPC foi provado criando um Unix socket local.
- A allowlist de endpoints reais dos providers deve ser validada separadamente por resource.
- O CLI reporta uma versão genérica quando executado fora do npm; a integração deve verificar a
  versão pinada pelo package metadata/lock, não confiar em `srt --version`.
- O SRT usa shell internamente no macOS. A integração só pode aceitar executable e argv estruturados
  e deve manter o serializer privado e coberto por vetores adversariais.

## Repetição após integração

A bateria de produção foi repetida no mesmo dia por
`scripts/workflow/test-sandbox-runtime-macos.cjs`. Os cinco vetores passaram usando a mesma porta
consumida pelos adapters. Uma nova rodada de 15 amostras mediu 38,10 ms raw e 174,18 ms via SRT:
overhead absoluto de 136,08 ms e relativo de 357,1%. A variação confirma que o custo deve ser
reportado como baseline do host, não como SLO fixo.

`npm audit --audit-level=high` reportou zero vulnerabilidades e a suíte workflow concluiu com 154
testes aprovados e um skip esperado do benchmark opt-in.

## Decisão derivada

O protótipo suporta a adoção descrita no [ADR 021](../../adr/021-sandbox-de-so-para-chamadas-de-agentes.md):
SRT pinado, camada anticorrupção única, policies por resource, fail-closed e persistência da policy
efetiva antes de cada chamada.
