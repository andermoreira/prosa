---
schemaVersion: 1.0.0
id: spec-public-release-readiness
title: Prontidão para publicação pública do Prosa
status: approved
source:
  path: specs/public-release-readiness.md
  hash: c2ae82b7ff1532ddab3144693a5f747237385f4b746bc7bfdd1f588ebd9b38fa
  baseSha: efe8dabe50acf4250e82adbb726f199648a53d60
approval:
  approvedBy: user
  approvedAt: 2026-07-26
  baseSha: efe8dabe50acf4250e82adbb726f199648a53d60
goal: Publicar o Prosa como uma alpha pública, segura e reproduzível, capaz de demonstrar sua proposta de orquestração de agentes sem depender de credenciais, serviços pagos ou contexto do repositório privado ia.
nonGoals:
  - Publicar o Prosa como pacote npm neste primeiro ciclo.
  - Declarar estabilidade de API, compatibilidade retroativa ou prontidão para produção.
  - Implementar dependency vetting ou spec-code drift além do estado já existente nas respectivas specs.
  - Publicar, transferir ou fixar o repositório sem uma aprovação humana específica posterior.
  - Transformar o ia em dependência pública ou requisito para experimentar o Prosa.
acceptanceCriteria:
  - id: AC-01
    description: A suíte padrão passa em clone limpo Ubuntu sem opencode, MCP real, credenciais ou serviços externos.
  - id: AC-02
    description: Existe teste específico que prova o fail-closed OPENCODE_COMMAND_UNAVAILABLE quando uma operação exige o executável ausente.
  - id: AC-03
    description: Testes de capacidade que exigem agente, MCP ou sandbox real estão separados, têm pré-requisitos explícitos e não mascaram falhas da suíte padrão.
  - id: AC-04
    description: Três execuções consecutivas do GitHub Actions concluem verdes após a correção.
  - id: AC-05
    description: A demonstração pública cobre validação, execução confinada, gate, review, decisão humana e relatório sem serviço pago.
  - id: AC-06
    description: README e documentação distinguem capacidades implementadas, experimentais e planejadas, incluindo limites por plataforma.
  - id: AC-07
    description: Auditoria datada cobre árvore, histórico, segredos, paths pessoais, dados privados, autoria, licença e THIRD_PARTY_NOTICES, sem finding bloqueante aberto.
  - id: AC-08
    description: O repositório pode ser instalado, testado e demonstrado sem acesso ao ia.
  - id: AC-09
    description: O contrato público declara estágio alpha, suporte, política de segurança e estratégia de distribuição repo-only.
  - id: AC-10
    description: Visibilidade, release, metadata externa, pin e README do perfil permanecem inalterados até aprovação explícita após todos os gates.
implementationNotes:
  - id: NOTE-01
    content: A distribuição inicial é repo-only e package.json permanece private enquanto não houver decisão separada sobre npm.
    approvedBy: user
    approvedAt: 2026-07-26
    baseSha: efe8dabe50acf4250e82adbb726f199648a53d60
  - id: NOTE-02
    content: O primeiro ciclo recebe vulnerability reports, mas não promete triagem de contribuições externas.
    approvedBy: user
    approvedAt: 2026-07-26
    baseSha: efe8dabe50acf4250e82adbb726f199648a53d60
  - id: NOTE-03
    content: A marca usa Prosa em texto e prosa em identificadores técnicos.
    approvedBy: user
    approvedAt: 2026-07-26
    baseSha: efe8dabe50acf4250e82adbb726f199648a53d60
documentationImpact:
  kind: paths
  paths:
    - README.md
    - SECURITY.md
    - THIRD_PARTY_NOTICES.md
    - docs/workflows/public-alpha.md
    - docs/audits/public-release-readiness-2026-07-26.md
budgets:
  maxAttemptsPerStep: 3
  maxAttemptsTotal: 15
  maxAgentCallsPerStep: 6
  maxAgentCallsTotal: 30
  maxReviewCyclesPerStep: 2
  maxReviewCyclesTotal: 10
  maxDiagnosisCyclesPerStep: 2
  maxDiagnosisCyclesTotal: 10
  maxElapsedMinutesPerStep: 180
  maxElapsedMinutesTotal: 900
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
  - verify-pack
---
# Prontidão para publicação pública do Prosa

**Status:** aprovado em 26/07/2026.

## User stories

### Avaliação externa

**Given** um visitante sem acesso a repositórios privados e sem agente instalado,
**When** ele abre o repositório e segue a demonstração principal,
**Then** entende o problema, as garantias implementadas e acompanha um fluxo verificável em até
dez minutos.

### Clone limpo e CI

**Given** um clone limpo em Ubuntu com a versão suportada do Node.js,
**When** a suíte padrão é executada,
**Then** todos os testes determinísticos passam sem `opencode`, MCP real, credenciais ou serviços
externos.

### Dependência opcional indisponível

**Given** uma operação que realmente exige um executável de agente,
**When** o executável não está disponível,
**Then** o Prosa falha fechado com código estável e orientação acionável, sem contaminar a suíte
hermética.

### Gate de publicação reprovado

**Given** CI vermelha, finding de exposição, licença incompatível ou claim não demonstrado,
**When** a publicação é avaliada,
**Then** a mudança de visibilidade, a release e a integração ao perfil permanecem bloqueadas.

## Assumptions

- O repositório será publicado inicialmente em `andersonmalves/prosa`.
- A distribuição alpha será pelo código-fonte do repositório; `"private": true` continuará no
  `package.json` enquanto não houver decisão separada sobre npm.
- O `ia` será citado apenas como origem histórica da extração, sem ser necessário para build,
  testes ou uso.
- O contrato já aprovado em `specs/automated-spec-pipeline.md`, especialmente AC-20 e AC-23,
  continua sendo a fonte normativa para uma suíte reproduzível e sem agentes reais na CI.
- A falha atual `OPENCODE_COMMAND_UNAVAILABLE` em testes com seams falsas é uma regressão desse
  contrato existente, não uma nova decisão arquitetural.
- A visibilidade só será alterada após auditoria do histórico completo e nova aprovação explícita.

## Risks

- **Exposição irreversível de histórico:** auditar árvore e todos os commits antes da mudança de
  visibilidade; não confiar em voltar o repositório para privado como forma de revogação.
- **CI verde por redução indevida de cobertura:** substituir dependências reais por seams
  controladas apenas nos testes determinísticos e preservar testes fail-closed e suites de
  capacidade separadas.
- **README prometer capacidades ainda não implementadas:** classificar cada claim como
  implementado, experimental ou planejado e ligar garantias a evidências reproduzíveis.
- **Dependência oculta do ambiente do autor:** validar clone limpo em Linux e macOS suportados e
  documentar pré-requisitos por modo.
- **Confusão entre Prosa e `ia`:** posicionar o Prosa como motor independente e o `ia` apenas como
  origem e consumidor.
- **Abertura prematura a contribuições:** não adicionar contrato de contribuição até existir
  capacidade real de triagem e manutenção.

## Error handling

- Falhas de teste, audit, secret scanning, proveniência ou licença bloqueiam a publicação.
- Dependências opcionais indisponíveis retornam códigos estáveis e instruções de correção.
- Testes dependentes de plataforma devem ser identificados e separados; não podem desaparecer
  silenciosamente nem ser convertidos em sucesso.
- A demonstração deve parar de forma segura e limpar artefatos temporários quando um gate falhar.
- Nenhuma automação desta mudança pode tornar o repositório público, publicar pacote, criar release
  ou editar o perfil sem autorização específica.

## Observability

- GitHub Actions registra separadamente testes herméticos, audit e secret scanning.
- A demonstração expõe a sequência de estados e um relatório final sanitizado, sem telemetria
  remota.
- A auditoria de publicação gera um registro datado em `docs/audits/` com escopo, comandos,
  findings e decisão.
- Skips por plataforma aparecem no resultado dos testes com justificativa explícita.

## Quality attributes

- Em clone limpo Ubuntu, a suíte padrão completa deve passar sem binário de agente, credenciais ou
  acesso a serviços pagos.
- Em macOS e Linux suportados, indisponibilidade de capacidades específicas deve produzir skip
  documentado ou erro contratual, nunca falha ambígua.
- Um visitante técnico deve conseguir compreender e acompanhar o happy path documentado em até dez
  minutos, medido por dry run realizado a partir do README.
- Três execuções consecutivas do workflow principal devem concluir com sucesso antes da
  publicação.

## Threat model

- **Ativos:** histórico Git, código-fonte, credenciais locais, paths pessoais, artifacts de
  execução, identidade do autor e reputação do projeto.
- **Entradas não confiáveis:** specs, diffs, saída de agentes, artifacts, variáveis de ambiente,
  dependências npm e conteúdo de repositórios temporários.
- **Vetores de abuso:** segredo no histórico, path traversal ou symlink em fixtures, exfiltração
  por processo/agente, logs com dados sensíveis, dependency confusion e instruções maliciosas em
  exemplos.
- **Controles exigidos:** secret scanning da árvore e do histórico, sanitização de exemplos e
  artifacts, dependências fixadas, CI com permissões mínimas e preservação das políticas
  fail-closed existentes.
- **AuthN/AuthZ:** não há serviço multiusuário novo nesta mudança; tokens de agentes e GitHub não
  podem ser requisito da suíte ou demonstração públicas.
- **PII:** exemplos e fixtures usam somente dados fictícios; e-mails e paths pessoais não
  necessários devem ser removidos ou generalizados.

## Rollout / Rollback

1. Restaurar o contrato de testes herméticos sem mudar visibilidade.
2. Criar e validar a demonstração e a documentação pública.
3. Auditar árvore, histórico, licenças, proveniência e claims.
4. Obter três execuções consecutivas verdes e realizar dry run sem autenticação.
5. Apresentar o relatório final e solicitar aprovação específica para publicação.
6. Após aprovação, tornar público, aplicar metadata, criar release alpha e integrar ao perfil.

Antes da publicação, rollback é a reversão normal das mudanças locais. Depois da publicação,
tornar o repositório privado pode reduzir acesso futuro, mas não revoga clones nem conteúdo já
exposto; qualquer segredo ou material indevido deve ser removido do histórico antes do rollout.

## Open questions

- Nenhuma questão bloqueante. A aprovação confirmou distribuição repo-only com `"private": true`,
  recebimento inicial apenas de vulnerability reports e uso de “Prosa” na marca.

## Implementation plan

1. Restaurar a hermeticidade coberta por AC-20/AC-23 da spec aprovada da pipeline e separar testes de capacidade.
2. Criar uma demonstração determinística e sua documentação arquitetural, sem agente ou serviço pago obrigatório.
3. Executar e registrar a auditoria completa de exposição, proveniência e licenças.
4. Alinhar contrato público, segurança, suporte, estágio alpha e artefatos locais de apresentação ao comportamento verificável.
5. Validar todos os gates e produzir o handoff que solicita aprovação específica para visibilidade, release e integração ao perfil.
