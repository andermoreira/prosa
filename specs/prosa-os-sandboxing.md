---
schemaVersion: 1.0.0
id: spec-prosa-os-sandboxing
title: Sandboxing de sistema operacional na prosa
status: approved
source:
  path: specs/prosa-os-sandboxing.md
  hash: e4fe94daef7286ff6f4d5f1f63f89c1046a6edd1f79789c71d23a5b9a54be1aa
  baseSha: 7fb3c4b5659e5e8a69ceb032a27a25307d4f5ced
approval:
  approvedBy: user
  approvedAt: 2026-07-18
  baseSha: 7fb3c4b5659e5e8a69ceb032a27a25307d4f5ced
goal: Executar cada agente da prosa com privilégios mínimos impostos pelo sistema operacional, mantendo uma política auditável e reproduzível por step sem alterar a governança existente do pipeline.
nonGoals:
  - Substituir o Anthropic Sandbox Runtime por containers, microVMs ou serviços remotos.
  - Implementar as quatro etapas seguintes do roadmap de melhoria da prosa.
  - Alterar severidades, acceptance, budgets, vertical slices ou limite de cinco arquivos.
  - Sandboxed gates, MCP servers, Git, notificações, commit ou criação de PR nesta etapa.
  - Permitir fallback ou modo operacional sem sandbox para agentes.
acceptanceCriteria:
  - id: AC-01
    description: OpenCode e Cursor nos três papéis sempre passam pelo sandbox compatível com o papel.
  - id: AC-02
    description: Executor só escreve nas áreas permitidas e papéis read-only não escrevem no target.
  - id: AC-03
    description: Arquivos e diretórios sensíveis documentados não podem ser lidos por nenhum papel.
  - id: AC-04
    description: Unix sockets são negados por default e o Docker socket não fica acessível.
  - id: AC-05
    description: Rede deny-by-default permite provider por resource e npm/GitHub somente ao executor.
  - id: AC-06
    description: Policy normalizada por papel aparece no state por step antes do spawn e attempt referencia seu hash.
  - id: AC-07
    description: Resume reaplica policy idêntica e bloqueia qualquer drift de privilégio.
  - id: AC-08
    description: Runtime ausente, degradado ou com init/cleanup falho bloqueia sem fallback.
  - id: AC-09
    description: Sandbox Runtime está pinado exatamente em 0.0.66 no manifest e lockfile.
  - id: AC-10
    description: Violações e stderr aparecem sanitizados e legíveis sem secrets.
  - id: AC-11
    description: Teste macOS real prova sandbox-exec, segredos, read-only, rede e sockets.
  - id: AC-12
    description: Benchmark reproduzível reporta baseline e overhead sem modo produtivo sem sandbox.
  - id: AC-13
    description: Documentação durável explica policy, ajuste, pré-requisitos, erros e upgrade.
  - id: AC-14
    description: Governança anterior mantém o comportamento fora do encapsulamento dos agentes.
  - id: AC-15
    description: ADR registra a mudança da trust boundary e o vínculo policy-step-attempt.
implementationNotes:
  - id: NOTE-01
    content: Reviewer e diagnostician usam exceção explícita somente para endpoints do provider; executor acrescenta npm e GitHub.
    approvedBy: user
    approvedAt: 2026-07-18
    baseSha: 7fb3c4b5659e5e8a69ceb032a27a25307d4f5ced
documentationImpact:
  kind: paths
  paths:
    - docs/workflows/automated-spec-pipeline.md
    - docs/workflows/automated-spec-pipeline-runbook.md
    - docs/workflows/prosa-development.md
    - CHANGELOG.md
    - THIRD_PARTY_NOTICES.md
budgets:
  maxAttemptsPerStep: 3
  maxAttemptsTotal: 27
  maxAgentCallsPerStep: 6
  maxAgentCallsTotal: 54
  maxReviewCyclesPerStep: 2
  maxReviewCyclesTotal: 18
  maxDiagnosisCyclesPerStep: 2
  maxDiagnosisCyclesTotal: 18
  maxElapsedMinutesPerStep: 120
  maxElapsedMinutesTotal: 1080
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
globalGates: [workflow-tests, specs-lint, verify-pack]
---
# Sandboxing de sistema operacional na prosa

**Status:** ativa, aprovada para implementação
**Data:** 2026-07-18
**Roadmap:** etapa 1 de 5

## Goal

Executar cada agente da prosa com privilégios mínimos impostos pelo sistema operacional, mantendo uma política auditável e reproduzível por step sem alterar a governança existente do pipeline.

## Non-goals

- Substituir o Anthropic Sandbox Runtime por containers, microVMs ou serviços remotos.
- Implementar human-in-the-loop por risco, drift spec-código, vetting de dependências ou observabilidade geral do pipeline.
- Alterar severidades do reviewer, acceptance determinística, schema de vertical slices, budgets, rollout em três fases ou limite de cinco arquivos lógicos.
- Sandboxed gates, MCP servers, Git, notificações, commit ou criação de PR nesta etapa; o escopo coercitivo inicial cobre apenas executor, reviewer e diagnostician.
- Criar fallback, flag operacional ou modo de compatibilidade que permita executar agentes sem sandbox.

## User stories

### Execução isolada

**Given** um step validado e um resource de executor catalogado,
**When** a prosa invoca o agente,
**Then** todo o processo e seus filhos rodam via `@anthropic-ai/sandbox-runtime@0.0.66`, com leitura confinada ao worktree sanitizado, escrita somente nas areas permitidas, segredos invisíveis, sockets locais bloqueados e rede limitada aos endpoints aprovados do resource, GitHub e npm.

### Review e diagnóstico em lockdown

**Given** um snapshot fechado para review ou diagnóstico,
**When** o papel read-only é invocado,
**Then** ele lê somente o snapshot sanitizado, não escreve no target, não acessa Docker ou outros Unix sockets e usa rede exclusivamente para os endpoints do provider explicitamente catalogados.

### Retomada com a mesma política

**Given** um run interrompido depois que a política efetiva foi persistida,
**When** o operador usa `/resume-spec`,
**Then** a prosa reaplica exatamente a política registrada para qualquer nova chamada e bloqueia se resource, versão do runtime, paths, allowlist ou hash divergirem.

### Falha segura

**Given** pacote ausente, backend indisponível, inicialização inválida, modo degradado ou cleanup não comprovado,
**When** uma chamada de agente seria iniciada,
**Then** o step é bloqueado com erro explícito de trust boundary e nenhum processo do agente é executado fora do sandbox.

### Violação legível

**Given** uma tentativa de ler `.env`, escrever em snapshot read-only, abrir Docker socket ou acessar domínio não permitido,
**When** o sandbox bloqueia a operação,
**Then** o pipeline expõe diagnóstico sanitizado e legível, correlacionado ao papel e ao hash da política, sem registrar tokens ou conteúdo sensível.

## Assumptions

- Executor, reviewer e diagnostician já são subprocessos separados nos adapters OpenCode e Cursor; a integração reutilizará esse seam.
- Reviewer e diagnostician precisam de uma exceção de rede para o próprio provider remoto. A allowlist será explícita por resource; nenhum outro domínio será permitido.
- O executor recebe os endpoints do provider e, desde o primeiro rollout, os endpoints oficiais necessários de npm e GitHub. A allowlist de domínio reduz destinos, mas não autoriza `push`, publicação ou mudança das regras de argv, tools e acceptance.
- Credenciais relacionadas ao provider podem ser injetadas pelo ambiente mínimo já catalogado; variáveis não relacionadas continuam ausentes. O processo não recebe o HOME real para descobrir credenciais adicionais.
- O primeiro suporte validado é macOS, usando `sandbox-exec`; Linux permanece compatível por desenho, mas só será declarado suportado após validação própria de `bubblewrap`, `socat`, `ripgrep` e seccomp.
- `@anthropic-ai/sandbox-runtime` é research preview. A versão inicial é exatamente `0.0.66`, publicada no npm com provenance, e todo bump exige mudança explícita de manifest e lockfile, review e repetição dos testes adversariais.
- A política nasce de configuração confiável no base SHA aprovado, associada ao resource. Specs e steps não podem fornecer paths, domínios, sockets ou opções do fornecedor livremente.
- O benchmark sem sandbox será um harness inofensivo e isolado de medição; não será um modo disponível no pipeline produtivo.

## Risks

| Risco | Mitigação |
|---|---|
| API ou config `0.0.x` mudar | Pin exato, camada anticorrupção local, testes contratuais e bump manual. |
| Wrapper do SRT reintroduzir shell parsing | Prototipar quoting/argv adversarial; nenhuma string vem de spec sem validação; preservar o contrato do comando original e bloquear se a versão não oferecer execução segura. |
| Allowlist do provider ser ampla demais | Domínios por resource, sem wildcard quando endpoints exatos forem conhecidos, revisão no catálogo e rede negada por padrão. |
| Domínio permitido ser usado para exfiltrar segredos | HOME/TMP isolados, deny-read de credenciais e arquivos sensíveis, ambiente mínimo e snapshots sanitizados. |
| `allowRead` reabrir `.env` dentro do worktree | Negar padrões sensíveis explicitamente e validar com fixture real antes do rollout; se a precedência do backend impedir a garantia, usar staging sanitizado sem esses arquivos. |
| Symlink escapar do path permitido | Resolver realpaths e ancestrais, rejeitar symlinks em areas graváveis e verificar contenção antes/depois da chamada. |
| Docker ou IPC local escapar do isolamento | `allowUnixSockets: []`, `allowAllUnixSockets: false`, sem Apple Events e sem modos fracos. |
| Crash entre persistência e spawn | Persistir policy hash antes da chamada; tentativa sem resultado comprovado segue a reconciliação conservadora atual. |
| Estado antigo não provar sandbox | Evoluir a versão do state schema; runs antigos devem ser concluídos/cancelados ou bloqueados, nunca promovidos silenciosamente. |
| Overhead comprometer a operação local | Medir baseline e sandbox no mesmo comando inofensivo, reportando tempo absoluto e percentual sem inventar threshold prévio. |

## Data model

O `state.json` passa a registrar a política efetiva normalizada por step, antes de qualquer chamada. O contrato canônico é independente do formato de configuração do SRT:

```json
{
  "steps": [
    {
      "id": "feature-step-1",
      "sandbox": {
        "policyVersion": "2",
        "engine": {
          "name": "@anthropic-ai/sandbox-runtime",
          "version": "0.0.66",
          "backend": "sandbox-exec",
          "platform": "darwin"
        },
        "roles": {
          "executor": {
            "resourceId": "opencode",
            "filesystem": {
              "readPaths": ["<canonical-worktree>"],
              "writePaths": ["<canonical-allowed-area>"],
              "denyRead": ["<normalized-sensitive-patterns>"],
              "denyWrite": ["<normalized-sensitive-patterns>"]
            },
            "network": {
              "mode": "allowlist",
              "allowedDomains": ["<provider>", "github.com", "registry.npmjs.org"]
            },
            "unixSockets": [],
            "git": {
              "mode": "private-ephemeral-v1",
              "privateGitDir": "<canonical-worktree>/.workflow-sandbox/git",
              "objectDirectory": "<canonical-common-gitdir>/objects",
              "expectedHead": "<approved-head>",
              "configProfile": "status-only-v1"
            },
            "policyHash": "<sha256>"
          },
          "reviewer": {
            "resourceId": "opencode-reviewer",
            "filesystem": {
              "readPaths": ["<canonical-snapshot>"],
              "writePaths": [],
              "denyRead": ["<normalized-sensitive-patterns>"],
              "denyWrite": ["<normalized-sensitive-patterns>"]
            },
            "network": {
              "mode": "allowlist",
              "allowedDomains": ["<provider>"]
            },
            "unixSockets": [],
            "policyHash": "<sha256>"
          },
          "diagnostician": {
            "resourceId": "opencode-diagnostician",
            "filesystem": {
              "readPaths": ["<canonical-snapshot>"],
              "writePaths": [],
              "denyRead": ["<normalized-sensitive-patterns>"],
              "denyWrite": ["<normalized-sensitive-patterns>"]
            },
            "network": {
              "mode": "allowlist",
              "allowedDomains": ["<provider>"]
            },
            "unixSockets": [],
            "policyHash": "<sha256>"
          }
        },
        "aggregateHash": "<sha256>"
      }
    }
  ],
  "attempts": [
    {
      "id": "attempt-feature-step-1-1",
      "sandboxPolicyHash": "<sha256>"
    }
  ]
}
```

Invariantes:

- A representação persistida não contém valores de credenciais.
- Arrays e objetos são normalizados antes do hash para produzir resultado determinístico.
- Cada attempt de execução referencia `sandboxPolicyHash`; applications distintas registram a política de executor, reviewer e diagnostician.
- Paths efêmeros ficam explícitos para auditoria e são revalidados por realpath no resume.
- Executor em linked worktree recebe gitdir privado efêmero; config, index e estado do CLI não
  escrevem no gitdir compartilhado, enquanto objects são lidos por alternate catalogado na policy.
- Um artifact de resposta só pode ser reconciliado quando operation ID, attempt e `sandboxPolicyHash` coincidem.
- `state.schema.json` deve evoluir de forma incompatível e explícita; ausência da política nunca significa política default.

## Error handling

Erros novos terão códigos estáveis e mensagens sanitizadas:

| Código | Condição | Resultado |
|---|---|---|
| `SANDBOX_RUNTIME_UNAVAILABLE` | Pacote, CLI ou backend não disponível | Bloqueia antes do agente. |
| `SANDBOX_INITIALIZATION_FAILED` | Configuração ou proxy não inicializa | Bloqueia antes do agente. |
| `SANDBOX_POLICY_INVALID` | Paths, domínio, papel ou opção não passam invariantes | Bloqueia antes do agente. |
| `SANDBOX_POLICY_DRIFT` | Política persistida diverge no resume | Bloqueia sem regenerar. |
| `SANDBOX_VIOLATION` | Filesystem, rede ou socket bloqueado | Falha a tentativa e expõe regra/recurso sanitizados. |
| `SANDBOX_DEGRADED` | Runtime tenta modo fraco ou backend incompleto | Bloqueia; não aceita warning como sucesso. |
| `SANDBOX_CLEANUP_FAILED` | Reset/cleanup não é comprovado | Bloqueia novas chamadas e exige intervenção. |

`stderr`, eventos de violação e erros do proxy passam pela sanitização existente. Headers, query strings, bodies, env values e conteúdo de arquivo nunca entram no diagnóstico persistido.

## Observability

Esta tarefa não cria a observabilidade geral prevista na etapa 5 do roadmap. Ela produz somente os sinais estruturados que essa etapa consumirá:

- política efetiva e hash por papel/step;
- engine, versão, backend e plataforma;
- duração de inicialização, execução e cleanup do sandbox;
- violações sanitizadas correlacionadas por operation ID e attempt;
- código estável de falha do sandbox.

O output humano mostra o papel, a regra bloqueada e o recurso normalizado, por exemplo `reviewer: write blocked for snapshot/path` ou `executor: connection blocked for example.com`, sem engolir o stderr original sanitizado.

## Quality attributes

- **Segurança:** sob qualquer falha de disponibilidade ou inicialização do SRT, nenhum processo de agente pode ser spawnado diretamente; verificado por teste que substitui/omite o runtime e observa zero chamadas ao runner não sandboxado.
- **Recuperabilidade:** após crash, uma nova ação usa o mesmo policy hash persistido ou bloqueia com `SANDBOX_POLICY_DRIFT`; verificado por fixture de state alterado.
- **Compatibilidade:** no macOS suportado, os testes adversariais provam bloqueio de leitura, escrita, rede e sockets pelo backend `sandbox-exec` real.
- **Performance:** no mesmo host e comando inofensivo, registrar mediana de execuções com e sem wrapper, tempo absoluto e overhead percentual. O relatório desta tarefa estabelece o baseline; não há limite inventado antes da medição.

## Threat model

### Ativos

- Código e histórico Git do projeto.
- Credenciais locais, chaves SSH/GPG/cloud, tokens de registry/provider e arquivos `.env`.
- Host do desenvolvedor, sockets locais e serviços Docker/Podman.
- Integridade do `state.json`, artifacts e decisões de acceptance.

### Entradas não confiáveis

- Specs, steps, código, comentários, READMEs, diffs e artifacts.
- Dependências baixadas e seus scripts/metadados.
- Respostas e instruções produzidas por modelos externos.

### Fronteiras e controles

- O orchestrator confiável resolve uma policy ID catalogada no base SHA; o worktree não define privilégios.
- O sandbox envolve o CLI do agente e toda a árvore de filhos.
- Filesystem corta acesso a dados privados; rede corta destinos não aprovados; sockets locais ficam negados.
- A governança atual continua ativa como defesa em profundidade: ambiente mínimo, tools deny-first, argv sem shell no pipeline, worktree, limite de cinco arquivos, scope, revalidation, snapshots e acceptance determinística.
- `allowAppleEvents`, `enableWeakerNestedSandbox`, `enableWeakerNetworkIsolation`, `allowAllUnixSockets` e Docker socket são proibidos, não configuráveis por step.

### Risco residual aceito

- Um domínio permitido do provider ainda é um canal de saída. A mitigação principal é impedir que segredos entrem no sandbox, não confiar apenas na allowlist.
- O SRT é research preview e `sandbox-exec` é uma primitive legada do macOS; ambos exigem pin, teste real e revisão a cada upgrade.
- Gates e MCPs continuam fora desta camada nesta tarefa e mantêm os controles existentes.

## Rollout / Rollback

- Preservar as três fases existentes da prosa; o sandbox é obrigatório em todas as chamadas de agente dentro da fase em que for habilitado.
- Antes do wiring, executar um protótipo descartável para provar argv/quoting, backend, negação de `.env` e HOME, read-only, rede, sockets, timeout e cleanup.
- Ativar primeiro no macOS e bloquear outras plataformas com erro explícito até validação correspondente.
- Não existe rollback para execução sem sandbox. Reverter a mudança de código e schema é permitido somente interrompendo/cancelando runs novos; runs com state schema novo não podem ser retomados por versão antiga.
- Runs antigos sem prova de sandbox não são migrados implicitamente. Devem terminar antes do rollout ou ser cancelados.

## Acceptance criteria

- **AC-01:** Executor OpenCode e Cursor, reviewer e diagnostician são sempre invocados pelo sandbox de SO com policy compatível com o papel; nenhum caminho chama o agente diretamente.
- **AC-02:** O executor só escreve no worktree/areas permitidas; reviewer e diagnostician não escrevem no snapshot nem no worktree, comprovado por teste adversarial real no macOS.
- **AC-03:** `.env`, `.env.*`, `credentials.json`, `.ssh`, `.aws`, `.gnupg`, `.docker`, `.npmrc`, `.netrc`, arquivos PEM/key e equivalentes documentados não podem ser lidos por nenhum papel, mesmo quando estão sob o target permitido.
- **AC-04:** Unix sockets são negados por default e um teste comprova que nenhum papel abre Docker socket.
- **AC-05:** Rede é negada por default; reviewer/diagnostician acessam somente endpoints explícitos do provider e executor acrescenta somente endpoints aprovados de npm/GitHub.
- **AC-06:** A política efetiva normalizada de executor, reviewer e diagnostician aparece nas applications do `state.json` antes do spawn, e cada attempt de execução referencia seu `sandboxPolicyHash`.
- **AC-07:** Resume reaplica política idêntica e bloqueia alteração de resource, versão, path, domínio, socket ou hash.
- **AC-08:** Ausência, inicialização inválida, modo degradado ou cleanup falho do runtime bloqueiam com erro claro e zero fallback sem sandbox.
- **AC-09:** `@anthropic-ai/sandbox-runtime` está pinado exatamente em `0.0.66` no manifest e lockfile; audit e integridade do lock são verificados.
- **AC-10:** Violações e stderr do sandbox aparecem de forma legível e sanitizada no output e nos artifacts, sem secrets.
- **AC-11:** Um teste manual automatizável no macOS prova o backend `sandbox-exec`, bloqueio de `.env`/HOME, read-only de reviewer/diagnostician, rede negada e socket negado.
- **AC-12:** Um benchmark reproduzível reporta baseline, tempo sandboxado e overhead absoluto/percentual sem expor um modo sem sandbox no pipeline.
- **AC-13:** Documentação durável explica política por papel, origem da allowlist, ajuste revisado, pré-requisitos, erros e procedimento de upgrade.
- **AC-14:** Schemas, budgets, reviewer JSON, severidades, vertical slices, acceptance, rollout e limite de cinco arquivos mantêm o comportamento anterior fora do encapsulamento das chamadas.
- **AC-15:** Um novo ADR registra a mudança da trust boundary do ADR 017, a camada anticorrupção, o fail-closed e o vínculo policy-step-attempt.

## Open questions

- **Endpoints exatos do provider:** levantar em ambiente controlado para cada resource OpenCode/Cursor antes do wiring. Responsável: implementador do protótipo. Domínio observado mas não aprovado mantém a chamada bloqueada; não autoriza wildcard amplo.
- **Execução argv-safe no SRT 0.0.66:** o protótipo deve provar que argumentos adversariais não viram shell injection. Se a API/CLI não preservar o contrato necessário, a implementação deve bloquear e registrar a limitação, não relaxar `shell: false` silenciosamente.
- **Arquivos internos indispensáveis ao provider:** identificar o mínimo necessário e materializar apenas configuração não sensível em HOME efêmero. Responsável: implementador do protótipo.

## Implementation plan

1. Prototipar `sandbox-runtime@0.0.66` no macOS e registrar argv, backend, filesystem, rede, sockets, cleanup, endpoints do provider e overhead.
2. Registrar a decisão arquitetural em novo ADR e definir a policy canônica independente do fornecedor.
3. Adicionar a dependência pinada e uma porta sandboxada fail-closed com testes unitários/contratuais.
4. Catalogar policies por resource e validar semanticamente papéis, domínios, filesystem, sockets e opções proibidas.
5. Evoluir `state.json` para persistir policy por step e vinculá-la a attempts, artifacts, revalidation e resume.
6. Encapsular OpenCode executor/reviewer/diagnostician e validar violações/erros sanitizados.
7. Encapsular Cursor executor/reviewer/diagnostician sob o mesmo contrato e validar credencial/provider.
8. Executar testes adversariais reais, suíte de regressão, audit da dependência e benchmark no macOS.
9. Atualizar a documentação durável e o changelog com política, ajuste, pré-requisitos, versão e medição.
