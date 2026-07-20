---
schemaVersion: 1.0.0
id: spec-mcp-gates
title: Gates MCP para a pipeline automática de prosa
status: approved
source:
  path: specs/mcp-gates.md
  hash: 7a0103e27ebe37fdfeb865d6588239e8f5749f76fb6a466e5dc115bdad2557d5
  baseSha: 63d73372a5230284d7bfad0e05c11f3585bf5feb
approval:
  approvedBy: user
  approvedAt: 2026-07-17
  baseSha: 63d73372a5230284d7bfad0e05c11f3585bf5feb
goal: Adicionar suporte a servidores MCP como tipo de gate no catálogo, permitindo que a prosa valide steps contra conhecimento externo (documentação de bibliotecas, web search, GitHub code search) de forma determinística, com budget, evidência e revalidation — igual aos gates executáveis atuais.
nonGoals:
  - "Expor MCPs como ferramentas dos agentes (executor/reviewer usariam MCP durante a execução). Os agentes permanecem com mcp_*: deny."
  - "Gerenciar o lifecycle de servidores MCP (start/stop). Servidores stdio são efêmeros por invocação; servidores HTTP são pré-existentes."
  - Substituir ou duplicar gates executáveis existentes. MCP gates complementam, não substituem.
acceptanceCriteria:
  - id: AC-01
    description: O catálogo de gates aceita entradas do tipo mcp com server, tool, args e schema de validação.
  - id: AC-02
    description: O gate runner spawna um subprocesso MCP via stdio, invoca tools/list, tools/call e coleta o resultado como artifact.
  - id: AC-03
    description: Gates MCP respeitam budget (timeoutMs, maxOutputBytes), são executados em sandbox isolado e produzem evidência auditável.
  - id: AC-04
    description: O reviewer recebe o resultado do gate MCP no snapshot fechado e pode cruzar com o diff do step.
  - id: AC-05
    description: "Pelo menos 3 MCPs produtivos estão catalogados: context7 (docs de bibliotecas), websearch (busca web), gh-grep (GitHub code search)."
  - id: AC-06
    description: O adapter MCP é testado com servidores reais (stdio) e rejeita servers não catalogados, args inseguros e respostas que excedem o budget.
implementationNotes: []
documentationImpact:
  kind: paths
  paths:
    - docs/workflows/prosa-development.md
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
  - specs-lint
---
# Gates MCP para a prosa

**Status:** draft
**Data:** 2026-07-17

## Goal

Adicionar suporte a servidores MCP (Model Context Protocol) como tipo de gate no catálogo da prosa. Um gate MCP invoca uma tool específica de um servidor MCP via stdio, coleta o resultado como artifact auditável, e o expõe ao reviewer no snapshot fechado — com o mesmo contrato de budget, timeout, sandbox e revalidation dos gates executáveis atuais.

## Non-goals

- **Não** expor MCPs como ferramentas dos agentes (executor/reviewer). Os agentes permanecem com `mcp_*: deny` — o conhecimento externo entra como evidência de gate, não como ferramenta do agente.
- **Não** gerenciar o lifecycle de servidores MCP. Servidores stdio são spawnados por invocação (efêmeros); servidores HTTP são pré-existentes (já rodando).
- **Não** substituir gates executáveis. MCP gates são um novo tipo, complementar.
- **Não** inventar um protocolo próprio. O contrato é o MCP padrão (`tools/list` → `tools/call`), sem extensões proprietárias.

## Assumptions

- `npx` está disponível no ambiente (vem com Node), então servidores stdio `npx -y` fazem download sob demanda.
- Chaves de API (`BRAVE_API_KEY`, `GITHUB_TOKEN`) são pré-requisitos opcionais: sua ausência bloqueia apenas o gate que as exige, com erro claro, não o pipeline inteiro.
- Servidores MCP catalogados são read-only (`readOnly: true`); o gate runner nunca invoca tools de escrita.
- O contrato MCP dos servidores segue a versão de protocolo negociada no `initialize` (`2024-11-05`).

## User stories

### Gate MCP valida uso de biblioteca

**Given** um step que adiciona `react-router` como dependência,
**When** o gate `context7-check` é declarado em `verification.gateIds`,
**Then** o gate runner spawna o servidor MCP `context7`, invoca `resolve-library-id` com `libraryName: "react-router"`, coleta a doc mais recente, e expõe o resultado como artifact. O reviewer recebe a doc no snapshot e pode cruzar com o diff do step.

### Gate MCP audita padrão de segurança

**Given** um step que implementa autenticação JWT,
**When** o gate `websearch-verify` é declarado,
**Then** o gate runner invoca `websearch` com a query `"JWT best practices OWASP 2025"`, coleta os resultados, e o reviewer verifica se o diff segue as recomendações.

### Gate MCP falha controlado

**Given** um servidor MCP indisponível ou que retorna erro,
**When** o gate é executado,
**Then** o gate runner classifica o erro (timeout, conexão recusada, resposta inválida), persiste a evidência e bloqueia o step. O budget do gate (timeoutMs, maxOutputBytes) é respeitado; o sandbox isola HOME e TMPDIR.

### Múltiplos MCPs no mesmo step

**Given** um step complexo que mexe em autenticação e UI,
**When** o step declara `verification.gateIds: [context7-check, websearch-verify]`,
**Then** ambos os gates rodam sequencialmente, cada um com seu próprio budget e sandbox, e ambos os resultados aparecem no snapshot do reviewer.

## Architecture and contracts

### Novo tipo de gate no catálogo

`workflow/gates.yaml` ganha um novo formato:

```yaml
- id: context7-check
  type: mcp
  server: context7
  tool: resolve-library-id
  args:
    libraryName: "react-router"
  cwd: repo-root
  timeoutMs: 30000
  maxOutputBytes: 262144
  category: validation
```

Campos específicos de gate MCP:

| Campo | Descrição |
|-------|-----------|
| `type` | `"mcp"` (novo) — distingue de gates executáveis (`executable` + `args`) |
| `server` | ID do servidor MCP no catálogo de resources |
| `tool` | Nome da tool MCP a ser invocada |
| `args` | Argumentos passados para a tool (objeto JSON, não array de strings) |

### Novo tipo de resource no catálogo

`workflow/resources.yaml` ganha entradas para servidores MCP:

```yaml
- id: context7
  type: mcp-server
  executable: npx
  args: [-y, @upstash/context7-mcp]
  capabilities: [mcp:tools]
  envAllowlist: [HOME, PATH, TMPDIR]
  cwd: repo-root
  timeoutMs: 30000
  maxOutputBytes: 262144
  readOnly: true
- id: websearch
  type: mcp-server
  executable: npx
  args: [-y, @anthropic/mcp-server-brave-search]
  capabilities: [mcp:tools]
  envAllowlist: [BRAVE_API_KEY, HOME, PATH, TMPDIR]
  cwd: repo-root
  timeoutMs: 30000
  maxOutputBytes: 262144
  readOnly: true
- id: gh-grep
  type: mcp-server
  executable: npx
  args: [-y, @anthropic/mcp-server-github]
  capabilities: [mcp:tools]
  envAllowlist: [GITHUB_TOKEN, HOME, PATH, TMPDIR]
  cwd: repo-root
  timeoutMs: 30000
  maxOutputBytes: 262144
  readOnly: true
```

### Protocolo MCP via stdio

O gate runner spawna o servidor MCP como subprocesso (`shell: false`) e se comunica via stdio usando o protocolo JSON-RPC 2.0:

1. **Initialize**: envia `initialize` request com capabilities do cliente
2. **tools/list**: descobre as tools disponíveis (valida que a tool declarada existe)
3. **tools/call**: invoca a tool específica com os args do gate
4. **Coleta**: captura stdout como artifact, preserva stderr para diagnóstico

O processo é terminado após a resposta (não mantém conexão persistente). Timeout e maxOutputBytes são aplicados pelo `runProcess`.

### Contrato do adapter MCP

O adapter `mcp.cjs` expõe uma função `runMcpGate(input)` que:

1. Recebe `{ server, tool, args, worktree, timeoutMs, maxOutputBytes }`
2. Resolve o resource do servidor MCP no catálogo
3. Spawna `executable args` com `shell: false`, cwd no worktree
4. Envia JSON-RPC `initialize` → `tools/list` → `tools/call`
5. Valida que a tool declarada existe no `tools/list`
6. Retorna `{ ok, passed, resultRef, content }` — mesmo contrato de `runGate`

### Segurança

- **Servidor não catalogado**: rejeitado. O gate só pode referenciar servidores declarados em `resources.yaml`.
- **Tool não listada**: rejeitado. Se o servidor não expuser a tool em `tools/list`, o gate falha.
- **Args inseguros**: sanitizados. Args são passados como JSON; strings com null bytes ou controle são rejeitadas.
- **Sandbox**: `HOME` e `TMPDIR` são isolados (igual aos gates executáveis). `PATH` é herdado.
- **Read-only**: todo servidor MCP no catálogo é `readOnly: true`. O gate runner não executa tools de escrita.

### Evidência

O artifact do gate MCP contém:
- `server`: ID do servidor
- `tool`: nome da tool invocada
- `request`: JSON-RPC request enviado
- `response`: conteúdo da resposta (sanitizado)
- `process`: metadata do subprocesso (exitCode, durationMs, bytes)

O reviewer recebe esse artifact no snapshot fechado, igual aos gates executáveis.

### MCP servers catalogados (fase 1)

| Server ID | Tool | Propósito | Provider |
|-----------|------|-----------|----------|
| `context7` | `resolve-library-id` | Consultar documentação atualizada de bibliotecas | `@upstash/context7-mcp` |
| `websearch` | `search` | Buscar recomendações de segurança/padrões na web | `@anthropic/mcp-server-brave-search` |
| `gh-grep` | `search_code` | Auditar padrões de código no GitHub (ex: anti-patterns) | `@anthropic/mcp-server-github` |

## Data model

### Gate catalog extension (`gates.yaml`)

```yaml
gates:
  # executável (existente)
  - id: specs-lint
    resourceId: node-runtime
    executable: node
    args: [scripts/lint-specs.cjs]
    ...

  # MCP (novo)
  - id: context7-check
    type: mcp
    server: context7
    tool: resolve-library-id
    args:
      libraryName: "react-router"
    cwd: repo-root
    timeoutMs: 30000
    maxOutputBytes: 262144
    category: validation
```

### Resource catalog extension (`resources.yaml`)

```yaml
resources:
  # agent (existente)
  - id: opencode
    type: agent
    ...

  # mcp-server (novo)
  - id: context7
    type: mcp-server
    executable: npx
    args: [-y, @upstash/context7-mcp]
    capabilities: [mcp:tools]
    envAllowlist: [HOME, PATH, TMPDIR]
    cwd: repo-root
    timeoutMs: 30000
    maxOutputBytes: 262144
    readOnly: true
```

### Artifact do gate MCP

```json
{
  "id": "context7-check",
  "server": "context7",
  "tool": "resolve-library-id",
  "args": { "libraryName": "react-router" },
  "passed": true,
  "content": { "libraryId": "react-router", "version": "7.1.0", "docs": "..." },
  "process": { "exitCode": 0, "durationMs": 1234, "stdoutBytes": 4096 },
  "isolation": { "home": "isolated-temporary", "networkSandbox": false }
}
```

## Error handling

- **Servidor não catalogado**: `MCP_SERVER_UNKNOWN` → gate falha, step bloqueia
- **Tool não encontrada**: `MCP_TOOL_NOT_FOUND` → gate falha (servidor não expõe a tool declarada)
- **Timeout**: `MCP_TIMEOUT` → classificada como `timeout`, sem retry
- **Conexão recusada / crash**: `MCP_SERVER_UNAVAILABLE` → classificada como `transient`, elegível para retry
- **Resposta excede maxOutputBytes**: `MCP_OUTPUT_LIMIT` → truncada com marcador, gate falha
- **Resposta não-JSON ou malformada**: `MCP_RESPONSE_INVALID` → gate falha, evidência preservada

## Observability

- Logs estruturados incluem `server`, `tool`, `durationMs`, `exitCode`
- O artifact do gate MCP é preservado com o mesmo contrato de provenance dos gates executáveis
- O resultado aparece no snapshot do reviewer como parte de `sources.gates`

## Threat model

| Ameaça | Controle |
|---|---|
| Servidor MCP malicioso | Catálogo fechado (só servidores declarados em resources.yaml) |
| Tool modifica o worktree | `readOnly: true` obrigatório; gate runner não executa tools de escrita |
| Args injection | Args são JSON validado; strings com null bytes/controle rejeitadas |
| Data exfiltration pelo servidor | Sandbox isola HOME/TMPDIR; envAllowlist restrito |
| Loop infinito / custo | Budget: timeoutMs, maxOutputBytes; classificação de erro para retry |
| Servidor não responde | Timeout → `MCP_TIMEOUT` → `timeout` → sem retry |

## Risks

| Risco | Mitigação |
|---|---|
| Servidores MCP não instalados (npm) | `npx -y` faz download automático; pré-requisito documentado no runbook |
| Chaves de API ausentes (BRAVE_API_KEY, GITHUB_TOKEN) | Gate falha com erro claro; documentado como pré-requisito opcional |
| MCP gate lento (network I/O) | Budget de timeoutMs por gate; gates rodam sequencialmente |
| Versão do MCP incompatível | `initialize` negocia capabilities; versão fixada no adapter |

## Edge cases

- Servidor MCP que não suporta `tools/list` (protocolo antigo)
- Servidor que retorna `tools/list` vazio
- Tool declarada no gate que não aparece no `tools/list`
- Args vazios vs args omitidos
- Servidor HTTP (não stdio) — fase futura
- Múltiplos gates MCP no mesmo step (sequencial, sem paralelismo)

## Open questions

1. Servidores HTTP como alternativa a stdio? (fase 2)
2. Cache de respostas MCP entre steps? (evitaria chamadas repetidas à mesma tool com mesmos args)
3. MCP como ferramenta dos agentes? (fase 3 — requer redesenho do modelo de permissão)

> Os critérios de aceite (AC-01…AC-06) são a fonte única no frontmatter (`acceptanceCriteria`), conforme ADR 020 — não duplicados aqui.

## Implementation plan

1. Estender schemas de catálogo (`catalogs.cjs`) para aceitar `type: mcp` em gates e `type: mcp-server` em resources.
2. Criar `scripts/workflow/lib/mcp.cjs` — adapter que spawna servidor MCP via stdio, faz handshake JSON-RPC, invoca tool e coleta resultado.
3. Integrar `mcp.cjs` no `runGate` do `local-adapter.cjs` — rotear por `gate.type === 'mcp'`.
4. Adicionar 3 MCPs ao catálogo: `context7`, `websearch`, `gh-grep` com tools e args padrão.
5. Criar testes: servidor MCP real (stdio), server não catalogado, tool não encontrada, timeout, resposta inválida.
6. Atualizar documentação: runbook com pré-requisitos (npx, chaves de API), prosa-development.md com exemplos de gates MCP.
