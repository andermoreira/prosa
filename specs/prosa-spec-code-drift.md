---
schemaVersion: 1.0.0
id: spec-prosa-spec-code-drift
title: Detecção de drift spec-código na prosa
status: approved
source:
  path: specs/prosa-spec-code-drift.md
  hash: a674bc6d961186ed1bd7871e776b7419ff57d9ebe8d8091fe833b7df1a7042a1
  baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0
approval:
  approvedBy: user
  approvedAt: 2026-07-19
  baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0
goal: Impedir que a prosa aceite uma implementação cuja estrutura observável diverge do contrato aprovado do step, preservando revisão humana, recuperação determinística e a governança HITL já implantada.
nonGoals:
  - Reconciliar, reescrever ou aprovar automaticamente spec, step ou código.
  - Fazer type checking global, module resolution, análise semântica interprocedural ou executar o código analisado.
  - Criar plugin engine, DSL, waiver de drift, nova pausa ou state machine paralela.
  - Implementar vetting geral de dependências ou observabilidade das etapas seguintes do roadmap.
acceptanceCriteria:
  - {id: AC-01, description: "Step schema v3 é fechado, exige implementationContract e rejeita campos, tipos ou referências inválidas antes de efeitos."}
  - {id: AC-02, description: "Coverage representa cada AC exatamente uma vez como estrutural ou comportamental com referências válidas."}
  - {id: AC-03, description: "V1/v2 seguem legíveis para diagnóstico, mas execução mutável após enablement bloqueia cedo e exige replan ou migração v3."}
  - {id: AC-04, description: "Dispatcher aceita somente node-symbol, structured-data e openapi-operation sem código dinâmico."}
  - {id: AC-05, description: "Babel 7.29.7 é pinado e vetado, e detectores não executam código nem acessam resolução global ou remota."}
  - {id: AC-06, description: "Matriz testada cobre JS/CJS/MJS/TS e decide JSX/TSX/CTS/MTS; casos não suportados nunca ficam aligned."}
  - {id: AC-07, description: "JSON/YAML e OpenAPI usam seletores e expectativas locais, fechados e sem referências remotas."}
  - {id: AC-08, description: "Detector usa representação canônica própria e não persiste AST ou fonte integral."}
  - {id: AC-09, description: "Análise fica confinada a até cinco paths exatos capturados com segurança e vinculados por hash."}
  - {id: AC-10, description: "Limites centrais baseados em baseline são coercitivos; excesso resulta inconclusive, nunca alinhamento truncado."}
  - {id: AC-11, description: "CHECKING_DRIFT é fase real entre GATING e REVALIDATING e preserva REVIEWING."}
  - {id: AC-12, description: "State v4 registra driftCheck completo por attempt sem sobrescrever histórico."}
  - {id: AC-13, description: "Somente aligned satisfaz acceptance; ausência, confirmed e inconclusive bloqueiam."}
  - {id: AC-14, description: "Resultados negativos emitem RiskSignal restricted idempotente sem alterar o agregador."}
  - {id: AC-15, description: "Reviewer roda para todos os resultados e somente o checkpoint HITL pós-review existente é reutilizado."}
  - {id: AC-16, description: "Approved não sobrepõe drift do attempt atual; somente retry, replan ou abort são válidos."}
  - {id: AC-17, description: "Contexto e documentação distinguem retry de replan sem reconciliação generativa."}
  - {id: AC-18, description: "Recovery reutiliza somente resultado íntegro e exatamente vinculado, recalcula ausência e falha fechado em corrupção."}
  - {id: AC-19, description: "Resultado, signal e aprovação nunca são reutilizados entre attempts."}
  - {id: AC-20, description: "Testes adversariais comprovam confinamento, limites e minimização de artifacts com fail-closed."}
  - {id: AC-21, description: "Teste manual de rename observa confirmed, artifact, review, rejeição de approved e uma rejeição acionável."}
  - {id: AC-22, description: "Documentação durável cobre contrato v3, detectores, recovery, resultados, retry/replan e troubleshooting."}
  - {id: AC-23, description: "Global gates incluem workflow-tests, specs-lint e verify-pack, acrescidos de checks de commands quando aplicáveis."}
implementationNotes:
  - {id: NOTE-01, content: "Step v3 fechado exige implementationContract com coverage bijetiva e somente três assertions built-in.", approvedBy: user, approvedAt: 2026-07-19, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
  - {id: NOTE-02, content: "Babel 7.29.7 fica pinado e vetado; parsing ocorre sem execução ou resolução e sob worker e limites coercitivos definidos por baseline.", approvedBy: user, approvedAt: 2026-07-19, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
  - {id: NOTE-03, content: "CHECKING_DRIFT é fase built-in recuperável; somente aligned passa acceptance, mas reviewer e HITL existentes são preservados.", approvedBy: user, approvedAt: 2026-07-19, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
  - {id: NOTE-04, content: "Drift negativo emite signal restricted, porém aprovação humana nunca funciona como waiver do predicado técnico.", approvedBy: user, approvedAt: 2026-07-19, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
  - {id: NOTE-05, content: "A exceção de bootstrap autoriza somente os 15 handoffs v2 desta spec, vinculados ao source.hash aprovado, ao baseSha e aos IDs exatos; não é compatibilidade geral nem waiver.", approvedBy: user, approvedAt: 2026-07-19, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
  - {id: NOTE-06, content: "Componentes v3 e drift permanecem shadow ou dormant nos Steps 1 a 14; o Step 15 encerra a exceção e habilita fail-closed atomicamente apenas para novos runs e resumes futuros.", approvedBy: user, approvedAt: 2026-07-19, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
documentationImpact:
  kind: paths
  paths: [README.md, docs/workflows/automated-spec-pipeline.md, docs/workflows/automated-spec-pipeline-runbook.md, docs/workflows/prosa-development.md, docs/audits/prosa-spec-code-drift-prototype.md, docs/audits/prosa-spec-code-drift-manual.md]
budgets:
  maxAttemptsPerStep: 3
  maxAttemptsTotal: 45
  maxAgentCallsPerStep: 6
  maxAgentCallsTotal: 90
  maxReviewCyclesPerStep: 2
  maxReviewCyclesTotal: 30
  maxDiagnosisCyclesPerStep: 2
  maxDiagnosisCyclesTotal: 30
  maxElapsedMinutesPerStep: 180
  maxElapsedMinutesTotal: 2700
  maxEstimatedCostPerStep: null
  maxEstimatedCostTotal: null
  maxTokensPerStep: null
  maxTokensTotal: null
execution: {adapter: opencode, autoCommit: false, pullRequest: false, correctionStep: false, notificationResourceIds: []}
isolation: {strategy: git-worktree, operatingSystemSandbox: true, shell: false, reviewerReadOnly: true, diagnosticianReadOnly: true}
review: {local: true, final: true, globalAcceptance: true, freshSessions: true, blockingSeverities: [critical, high]}
globalGates: [workflow-tests, specs-lint, verify-pack]
---
# Detecção de drift spec-código na prosa

**Status:** aprovada para implementação

**Data:** 2026-07-19
**Roadmap:** etapa 3 de 5
**ADRs aceitos:** [ADR 024](../adr/024-contrato-estruturado-de-implementacao-do-step.md) e
[ADR 025](../adr/025-fase-recuperavel-de-deteccao-de-drift.md)

## Goal

Impedir que a prosa aceite uma implementação cuja estrutura observável diverge do contrato aprovado
do step, preservando revisão humana, recuperação determinística e a governança HITL já implantada.

## Non-goals

- Reconciliar, reescrever ou aprovar automaticamente spec, step ou código.
- Fazer type checking global, module resolution, análise semântica interprocedural ou execução/import
  do código analisado.
- Buscar imports, schemas OpenAPI ou `$ref` remotos.
- Criar uma engine de plugins, DSL, detector autoral ou carregamento dinâmico de código.
- Detectar equivalência comportamental completa; comportamento não estrutural continua comprovado
  pelas evidence requirements existentes.
- Criar novo gate no catálogo, nova pausa, novo agregador de risco ou state machine paralela de
  aprovação.
- Oferecer waiver de drift na v1 ou permitir que aprovação de risco substitua o predicado técnico.
- Implementar vetting de dependências ou a observabilidade geral das etapas seguintes do roadmap.

## User stories

### Caminho feliz: contrato alinhado

**Given** um step v3 válido, com `implementationContract` fechado e cobertura total e não duplicada
de suas ACs, e um attempt cujos arquivos declarados podem ser analisados pelos detectores v1,
**When** os gates locais passam e a fase `CHECKING_DRIFT` compara o contrato com a identidade factual
do diff,
**Then** o attempt registra `aligned`, segue para `REVALIDATING`, `REVIEWING` e acceptance, sem criar
uma pausa adicional.

### Caminho de erro: rename proposital

**Given** uma assertion que exige um campo, símbolo ou operação com nome explícito,
**When** a implementação renomeia esse elemento sem atualizar o contrato aprovado, mesmo que os gates
locais passem,
**Then** o detector registra `confirmed`, cria artifact sanitizado, emite `RiskSignal` `restricted`,
executa o reviewer read-only e impede acceptance daquele attempt.

### Resultado inconclusivo

**Given** CJS dinâmico, sintaxe não suportada, documento inválido, limite excedido ou cobertura que o
detector não consegue provar,
**When** a fase de drift é executada,
**Then** o resultado é `inconclusive`, nunca `aligned`; o reviewer ainda roda e acceptance permanece
bloqueada.

### Decisão humana contextual

**Given** um checkpoint pós-review existente cujo assessment contém drift `confirmed` ou
`inconclusive`,
**When** o operador envia o decision file,
**Then** apenas `rejected+retry`, `rejected+replan` ou `rejected+abort` são válidos; `approved` falha
com `DRIFT_APPROVAL_CANNOT_OVERRIDE` sem consumir a solicitação como aprovação.

### Recovery e replay

**Given** um crash durante ou depois de `CHECKING_DRIFT`,
**When** o run é retomado,
**Then** um resultado completo só é reutilizado com bindings exatos; resultado ausente é recalculado
read-only, signal ausente é reconciliado idempotentemente, órfão sem state não recebe autoridade e
state que referencia artifact inválido falha terminalmente sem reutilização entre attempts.

### Compatibilidade conservadora

**Given** uma spec ou step v1/v2 reconhecível,
**When** uma operação somente de leitura o inspeciona,
**Then** a versão e a causa de incompatibilidade são diagnosticadas; quando uma execução mutável é
solicitada após o rollout v3, ela bloqueia cedo e exige replan/migração, sem executar silenciosamente.

## Assumptions

- As etapas 1 (sandbox de SO) e 2 (risco/HITL) estão implantadas; esta etapa reutiliza sandbox,
  `RiskSignal`, `recordRiskSignals`, decision file e checkpoint pós-review existentes.
- Specs e steps já possuem campos estruturados, porém nomes de campos, assinaturas e endpoints ainda
  aparecem em texto livre e não são comparáveis de forma mecânica.
- Cada step continua limitado a no máximo cinco arquivos lógicos afetados, incluindo produção,
  testes, docs, config, deleções, untracked e gerados.
- `predictedFiles` fornece os paths exatos que podem ser analisados; `implementationContract` não
  amplia escopo nem concede acesso adicional.
- A identidade factual do worktree e o diff já são capturados de forma hasheada antes de review.
- Evidence requirements comportamentais existentes permanecem a fonte de prova para ACs que não
  podem ser reduzidas a assertions estruturais locais.
- O parser Node será `@babel/parser@7.29.7`, em `devDependencies`, com pin exato no manifest e
  lockfile.
- A inclusão do parser exige vetting mínimo bloqueante de origem, licença, manutenção, provenance,
  advisories, integridade do lockfile, `npm audit --audit-level=high` e instalação com
  `npm ci --ignore-scripts`; a futura etapa 4 generalizará esse controle para dependências analisadas
  pela prosa, mas não dispensa a verificação desta dependência própria.
- O rollout interrompe ou cancela runs incompatíveis; state v3 não é promovido implicitamente a v4.
- Valores numéricos para bytes, nós, profundidade e tempo só serão fixados após o protótipo produzir
  baseline reproduzível.
- Os 15 handoffs desta spec usam schema v2 e foram aprovados pelo usuário em 2026-07-19 antes do
  rollout. A exceção de bootstrap é limitada aos IDs `spec-prosa-spec-code-drift-step-1` até
  `spec-prosa-spec-code-drift-step-15`, ao `baseSha` aprovado e ao `source.hash` desta spec; qualquer
  divergência falha fechado. Ela não autoriza outro step v2, não constitui compatibilidade geral e
  não funciona como waiver de drift.
- Contratos v3, state v4, detector e enforcement permanecem em modo shadow/dormant nos Steps 1 a 14,
  de modo que a própria sequência de handoffs v2 não seja bloqueada. O Step 15 conclui a evidência e
  habilita transacionalmente o fail-closed para novos runs e resumes futuros, encerrando a exceção no
  mesmo marco; o run de bootstrap em curso termina sob o contrato v2 aprovado.

## Architecture and contracts

### Step schema v3

`schemaVersion: 3.0.0` é um contrato fechado e exige `implementationContract`. V1 e v2 continuam
reconhecíveis para leitura e diagnóstico, mas, depois do rollout, não iniciam nem retomam execução
mutável. O erro deve orientar `replan` ou migração explícita para v3. Essa regra supersede
parcialmente a migração gradual decidida no ADR 023; o ADR aceito não será editado.

O contrato normalizado possui esta forma conceitual própria, sem persistir AST Babel:

```json
{
  "version": "1",
  "assertions": [
    {
      "id": "assert-user-export",
      "type": "node-symbol",
      "file": "src/user.ts",
      "symbol": "createUser",
      "expect": {
        "declaration": "function",
        "export": "named",
        "async": true,
        "parameters": [
          { "name": "input", "optional": false, "rest": false }
        ]
      }
    }
  ],
  "coverage": [
    {
      "acceptanceCriterionId": "AC-01",
      "kind": "structural",
      "assertionIds": ["assert-user-export"]
    },
    {
      "acceptanceCriterionId": "AC-02",
      "kind": "behavioral",
      "evidenceRequirementIds": ["evidence-user-flow"],
      "rationale": "O resultado depende de execução e não é demonstrável por estrutura local."
    }
  ]
}
```

Invariantes de validação:

1. Cada AC declarada no step aparece exatamente uma vez em `coverage`; ausência, repetição ou AC
   desconhecida bloqueia antes do worktree.
2. Coverage `structural` referencia uma ou mais assertions existentes e coverage `behavioral`
   referencia uma ou mais evidence requirements existentes, além de `rationale` não vazia.
3. IDs de assertions e evidence requirements são únicos em seus namespaces. Assertion órfã,
   referência inexistente ou array vazio é inválido.
4. `file` precisa ser um dos paths exatos de `predictedFiles`; glob, diretório, path absoluto,
   traversal e path calculado são proibidos.
5. O contrato descreve somente fatos locais aceitos pelos tipos fechados abaixo. Campos adicionais e
   versões desconhecidas são rejeitados.
6. `contractHash` é SHA-256 da representação canônica normalizada do `implementationContract`, sem
   dados derivados do parser.

### Assertions fechadas v1

#### `node-symbol`

- Suporta arquivos JS, CJS, MJS e TS; JSX, TSX, CTS e MTS entram somente se o protótipo comprovar
  suporte determinístico da configuração adotada do parser.
- Seleciona um arquivo e um `symbol` explícito e compara declaração, forma de export (`named`,
  `default` ou `none`) e assinatura sintática solicitada.
- A assinatura pode declarar forma do símbolo, `async`, `generator`, parâmetros ordenados com nome,
  optional/rest e, quando localmente representável, anotação de retorno em forma canônica limitada.
- Reexport estático local só pode ser aceito quando a assertion o declarar e o alvo estiver entre os
  paths exatos do step; não há resolução geral de módulos.
- Export calculado, mutação dinâmica de `module.exports`, `require()` calculado, alias cuja resolução
  não seja local e inequívoca ou sintaxe fora da matriz suportada produz `inconclusive`.
- A saída canônica contém apenas fatos de domínio normalizados; AST, offsets extensos e código-fonte
  integral não são persistidos.

#### `structured-data`

- Suporta JSON e YAML locais.
- Seleciona valor por JSON Pointer RFC 6901 e permite expectativas fechadas de `exists`, `type`,
  valor escalar/estrutural canônico e `requiredKeys` para objetos.
- Chaves duplicadas, alias/anchor YAML não suportado, tag customizada, documento múltiplo ou parse
  ambíguo não são tratados como alinhamento; resultam em `inconclusive` ou erro de contrato quando a
  ambiguidade é autoral.
- Comparação de valor é exata após normalização definida pelo formato; coerção implícita é proibida.

#### `openapi-operation`

- Suporta documento OpenAPI JSON/YAML local e seleciona `path` literal + `method` normalizado.
- Compara existência da operação e, quando declarados, `operationId`, referências de request e mapa
  de status/resposta.
- Somente `$ref` locais por fragmento são permitidos, resolvidos dentro do mesmo documento e sob os
  mesmos limites. `$ref` de arquivo ou URL torna o resultado `inconclusive`.
- Não valida a semântica completa de OpenAPI nem acessa rede.

### Dispatch e parser

O dispatcher é uma tabela fechada entre `type` e detector built-in. Não há registro de plugin,
import por nome vindo do step, callback autoral, `eval`, VM ou subprocesso do arquivo analisado.

`@babel/parser@7.29.7` recebe source bytes como dados dentro de worker built-in terminável. O
detector nunca executa, importa ou requer o arquivo, nunca chama type checker global e nunca resolve
dependências. Erro do parser, extensão suportada com construção não coberta ou configuração que não
prove o fato esperado retorna `inconclusive`. O protótipo deve fechar uma matriz explícita de
extensões/plugins antes do wiring.

### Confinamento e limites

- No máximo os cinco arquivos lógicos do step podem ser capturados, sempre por path exato declarado
  e confinado ao worktree do attempt. `realpath` isolado não é prova suficiente.
- A captura usa a primitive de snapshot fechado existente ou descritor aberto com `O_NOFOLLOW`,
  `fstat` de arquivo regular, validação segura de ancestrais e hash dos bytes efetivamente lidos. O
  detector analisa somente a cópia read-only no runtime restrito; identidade factual é conferida
  imediatamente antes e depois da captura. Troca concorrente produz `inconclusive`/drift, nunca
  `aligned`.
- Arquivo ou ancestral symlink é rejeitado; rename conta conforme a identidade lógica já usada pelo
  pipeline, mas o detector lê somente o path factual final declarado e vinculado ao diff e ao hash
  dos bytes capturados.
- Bytes totais/por arquivo, nós sintáticos, profundidade estrutural e tempo são impostos por uma
  configuração central, versionada e testável, nunca por campos do step.
- O limite de bytes é aplicado antes do parse. Babel, YAML e resolução de `$ref` local rodam em worker
  terminável com deadline externo e limites de heap/stack; timeout ou término forçado produz
  `inconclusive`. YAML desabilita aliases/tags antes de materializar dados. Resolução de `$ref` usa
  conjunto de visitados e orçamento de dereferences, sem recursão ilimitada.
- Exceder limite ou deadline produz `inconclusive`, artifact sanitizado e bloqueio técnico; não há
  truncamento que possa virar `aligned`.
- O protótipo medirá fixtures normais e adversariais para propor números. Até esses números serem
  aprovados, rollout mutável permanece desabilitado.

### Posição no pipeline

O fluxo do step passa a ser:

```text
GATING -> CHECKING_DRIFT -> REVALIDATING -> REVIEWING
```

`CHECKING_DRIFT` é fase built-in, read-only e idempotente, executada depois de todos os gates locais
e antes de revalidation/reviewer. Funcionalmente é o **gate de drift**, mas não entra em
`workflow/gates.yaml`: gates catalogados encerram o caminho antes do reviewer quando falham, enquanto
drift precisa preservar o review de qualidade mesmo quando `confirmed` ou `inconclusive`.

O reviewer recebe snapshot e artifact de drift sanitizados. Depois dele, o checkpoint pós-review
HITL existente é reutilizado. Não há estado de espera adicional, segundo decision file ou máquina
de aprovação paralela.

### Semântica do resultado

- `aligned`: todas as assertions foram avaliadas e satisfeitas sob os bindings exatos.
- `confirmed`: pelo menos uma assertion válida foi conclusivamente contrariada e nenhuma condição
  de integridade impede confiar nessa constatação.
- `inconclusive`: pelo menos uma assertion não pôde ser provada, ou parser/limite/formato impediu uma
  conclusão completa. Ausência de resultado também nunca equivale a `aligned`.

Somente `aligned` satisfaz o predicado técnico de acceptance. `confirmed` e `inconclusive` emitem,
via `recordRiskSignals`, um `RiskSignal` genérico com `minimumLevel: restricted`, `evidenceRefs` para
o artifact e fingerprint idempotente derivado dos bindings e status. O agregador não muda. Aprovação
de risco não altera o resultado nem permite acceptance.

### Operação, bindings e recovery

O operation ID é derivado deterministicamente de:

```text
runId + stepId + attemptId + contractHash + factualIdentityHash + detectorBundleHash
```

`detectorBundleHash` cobre versão dos detectores, canonicalização, parser/plugins pinados, matriz de
suporte e configuração central de limites. Qualquer mudança capaz de alterar o resultado muda esse
hash e impede replay de conclusão anterior.

O resultado também se vincula a `diffHash`, hashes dos bytes capturados, artifact hash e paths
factuais. Artifact e state seguem publicação em duas fases: o artifact é escrito em temporário,
validado, hasheado e renomeado atomicamente; somente depois o `driftCheck` completo é persistido. As
regras de recovery são:

1. Resultado completo, artifact íntegro e todos os bindings exatos: reutilizar sem novo parse.
2. Resultado ausente: executar novamente a operação read-only com o mesmo operation ID.
3. Temporário órfão sem referência no state: remover/quarentenar e recalcular read-only. Artifact
   publicado sem state completo permanece órfão sem autoridade e pode ser ignorado na reconciliação.
4. State referenciando artifact ausente, inválido ou com binding divergente indica corrupção, não
   crash comum: falhar terminalmente o run com diagnóstico auditável e exigir novo run; não editar
   state manualmente nem completar por inferência.
5. Resultado completo sem o signal esperado: reconciliar `recordRiskSignals` pelo fingerprint
   idempotente antes de continuar.
6. Signal sem resultado íntegro correspondente: falhar fechado como state inconsistente.
7. Novo attempt: novo operation ID e novo resultado, mesmo com diff idêntico; nunca reutilizar
   resultado ou aprovação entre attempts.

### Escolha humana entre `retry` e `replan`

- `rejected+retry`: usar quando o contrato v3 aprovado continua correto e o código do attempt deve
  ser descartado/corrigido para voltar a alinhá-lo. A orientação humana é dado sanitizado, não
  instrução executada automaticamente.
- `rejected+replan`: usar quando a descoberta mostra que spec/step/contrato aprovado precisa mudar.
  Cancela o run atual; a pessoa revisa e aprova novos documentos v3 e inicia outro run.
- `rejected+abort`: encerrar sem nova tentativa nem mudança documental.

Com drift não resolvido no `driftCheck` íntegro e vinculado ao **attempt atual**, `outcome: approved`
é semanticamente inválido. A validação não consulta apenas o histórico monotônico de signals: após
`retry`, signals antigos continuam auditáveis e o risco permanece `restricted`, mas um novo attempt
`aligned` não fica tecnicamente bloqueado pelo resultado anterior. A validação ocorre antes do
consumo da decisão e retorna `DRIFT_APPROVAL_CANNOT_OVERRIDE` (ou código estável equivalente),
mantendo o request pendente para uma decisão válida.

## Data model

### Step v3

- `StepV3.implementationContract.version`: versão da representação canônica de assertions.
- `StepV3.implementationContract.assertions[]`: fatos estruturais fechados e locais.
- `StepV3.implementationContract.coverage[]`: partição total das ACs entre prova `structural` e
  `behavioral`.
- `ImplementationAssertion`: união discriminada de `node-symbol`, `structured-data` e
  `openapi-operation`.
- `AcceptanceCoverage`: exatamente uma entrada por AC do step.

### State schema v4

Cada attempt preserva seu próprio registro, sem sobrescrever histórico:

```text
attempts[].driftCheck:
  operationId
  status: aligned | confirmed | inconclusive
  contractHash
  detectorBundleHash
  factualIdentityHash
  diffHash
  sourceBytesHash
  artifactRef: id + hash
  checkedAt
```

`checkedAt` é metadado auditável e não participa do resultado semântico ou fingerprint. Detalhes,
assertions avaliadas, limites atingidos e mismatches ficam apenas no artifact sanitizado. O state
guarda referência e hash. `state.schemaVersion` passa a `4.0.0`; ausência de
`driftCheck` nunca recebe default `aligned`.

### Artifact de drift

O artifact contém versão, operation ID, bindings, resumo por assertion, razões de `inconclusive` e
mismatches limitados. Valores observados brutos são proibidos: registrar somente assertion ID, path
lógico, presença, tipo, shape/chaves permitidas, comprimento limitado e, quando indispensável,
digest keyed e escopado ao run em vez de hash reutilizável de valor potencialmente pouco entrópico.
Não contém AST Babel, arquivo integral, segredo/PII, comentários não
necessários ou payload remoto. O artifact tem sensibilidade `restricted`; provenance liga artifact
a run, step, attempt, contrato, diff, snapshot e identidade factual.

Não há API HTTP ou mensageria nova. Os contratos públicos desta mudança são schemas de documentos,
state/artifact e a semântica existente do decision file.

## Error handling

| Código | Condição | Comportamento |
|---|---|---|
| `STEP_V3_REQUIRED` | Execução mutável recebe step v1/v2 após rollout | Bloqueia antes do worktree e orienta replan/migração. |
| `IMPLEMENTATION_CONTRACT_INVALID` | Contrato aberto, referência ou assertion inválida | Bloqueia validação. |
| `IMPLEMENTATION_COVERAGE_INVALID` | AC ausente, duplicada ou referência órfã | Bloqueia validação. |
| `DRIFT_CONFIRMED` | Mismatch conclusivo | Persiste `confirmed`, emite signal, revisa e bloqueia acceptance. |
| `DRIFT_INCONCLUSIVE` | Parse, sintaxe, formato, limite ou cobertura não comprovável | Persiste `inconclusive`, emite signal, revisa e bloqueia acceptance. |
| `DRIFT_BINDING_MISMATCH` | Contrato, diff, attempt ou identidade diverge | Bloqueia recovery sem reaproveitar resultado. |
| `DRIFT_ARTIFACT_INCOMPLETE` | State referencia artifact ausente, parcial ou com hash inválido | Falha terminalmente o run, preserva diagnóstico e exige novo run. |
| `DRIFT_STATE_INCONSISTENT` | Signal sem resultado íntegro ou estado impossível | Bloqueia fail-closed. |
| `DRIFT_APPROVAL_CANNOT_OVERRIDE` | `approved` com drift não resolvido | Rejeita semanticamente a decisão sem liberar acceptance. |

Temporário órfão de crash é reconciliado como ausência e pode ser recalculado. State que referencia
artifact inválido representa corrupção e termina o run com diagnóstico, preservando evidência e
exigindo novo run. Erros de conteúdo analisável não são convertidos em crash genérico. O detector produz
`inconclusive` quando consegue persistir resultado íntegro; falha de integridade/persistência
bloqueia sem fabricar resultado. Mensagens são sanitizadas e indicam `retry`, `replan` ou ação de
recuperação aplicável.

## Observability

- Registrar transições de entrada/saída de `CHECKING_DRIFT`, operation ID, duração, detector bundle hash,
  status e contagem de assertions por tipo, sem source bytes.
- Projetar no state consultável status por attempt, hashes, artifact ref e `checkedAt`.
- Registrar reconciliação (`reused`, `recomputed`, `signal-reconciled` ou `blocked`) e motivo.
- Expor no contexto pós-review o resumo de mismatch/inconclusão, evidence refs e a orientação entre
  `retry` e `replan`.
- Medir bytes/nós/profundidade/tempo no protótipo e depois contadores de limite atingido, sem criar
  dashboard ou backend remoto nesta etapa.

## Quality attributes

- **Determinismo:** mesmos bytes, contrato, detector bundle hash e bindings produzem o mesmo status e
  artifact semântico; timestamp não altera a decisão.
- **Recuperabilidade:** crash/replay reutiliza somente evidência íntegra e exatamente vinculada, ou
  repete apenas a leitura/análise sem repetir agente, gates ou reviewer já comprovados.
- **Fail closed:** qualquer ausência, ambiguidade, limite ou versão incompatível impede `aligned`.
- **Confinamento:** o detector analisa snapshot fechado de no máximo cinco paths exatos, sem symlink,
  rede, import ou execução, em worker terminável com recursos limitados.
- **Auditabilidade:** state e artifact permitem reconstruir contrato, identidade factual, resultado,
  signal e decisão humana de cada attempt.

## Threat model

| Ameaça | Controle |
|---|---|
| Código analisado executa payload | Parser trata bytes como dados; sem import/require/eval/VM/subprocesso. |
| Path traversal, symlink ou troca concorrente escapa do worktree | Snapshot fechado ou descriptor `O_NOFOLLOW`/`fstat`, ancestrais validados, hash dos bytes e identidade antes/depois. |
| Parser bomb ou documento profundamente aninhado exaure recursos | Byte limit pré-parse, worker terminável com heap/stack/deadline, YAML sem aliases/tags e `$ref` com visited/budget. |
| `$ref` ou import exfiltra dados/rede | Resolução remota e module resolution proibidas; OpenAPI aceita somente fragmento local. |
| Step escolhe detector/código privilegiado | União fechada e dispatcher built-in, sem plugin/DSL/código dinâmico. |
| Contrato omite AC difícil | Coverage bijetiva; cada AC aparece exatamente uma vez e behavioral exige evidence + justificativa. |
| Resultado antigo é aplicado a novo código | Bindings por attempt, contrato, diff e identidade factual; novo attempt nunca reutiliza. |
| Humano aprova drift para contornar acceptance | `approved` inválido no contexto e predicado técnico exige `aligned`. |
| Artifact vaza fonte, segredo ou PII | Nenhum valor bruto observado; somente shape/metadados/hashes, sensibilidade restricted e testes adversariais. |
| Parser comprometido processa input hostil | Pin/lock, provenance, licença/manutenção/advisories revisados, npm audit e instalação sem scripts. |

Risco residual: análise sintática local não prova semântica em runtime. ACs comportamentais continuam
dependentes das evidências e do reviewer, e qualquer falsa confiança deve resultar em
`inconclusive`, não em inferência otimista.

## Risks

| Risco | Mitigação |
|---|---|
| Contrato v3 ficar excessivamente verboso | Tipos pequenos, fechados e focados em fatos de API; sem AST autoral ou DSL. |
| Falso `confirmed` por normalização incorreta | Representação canônica versionada, fixtures positivas/negativas e protótipo antes do rollout. |
| `inconclusive` frequente bloquear produtividade | Matriz de suporte documentada, métricas locais e expansão somente por nova decisão/revisão. |
| Migração v1/v2 interromper runs existentes | Rollout explícito, diagnóstico read-only, cancelamento preservando artifacts e replan v3. |
| Limites arbitrários rejeitarem projetos reais | Baseline reproduzível antes de fixar números; configuração central testada. |
| Novo estado conflitar com HITL atual | Uma única fase técnica e reutilização do signal/agregador/checkpoint existentes. |
| Reviewer ser pulado em drift | Transição obrigatória até `REVIEWING` e testes para `confirmed`/`inconclusive`. |
| Signal faltar após crash | Reconciliação idempotente por fingerprint antes de continuar. |
| Documento estruturado malicioso explorar parser | Dependências pinadas, sem tags remotas/customizadas e limites adversariais. |

## Edge cases

- Step sem AC, com AC repetida, coverage duplicada, assertion órfã ou evidence requirement ausente.
- Uma AC comportamental com rationale vazia ou uma AC estrutural sem assertion.
- Dois arquivos exportam o mesmo símbolo; a seleção continua inequívoca pelo path exato.
- Export default anônimo, reexport local, overload TypeScript, parâmetro destructuring ou assinatura
  inferida que o contrato não consegue representar.
- `module.exports` estático simples versus atribuição CJS dinâmica/calculada.
- JSX/TSX/CTS/MTS aceito ou recusado conforme a matriz fechada produzida pelo protótipo.
- JSON Pointer para chave vazia, escapes `~0`/`~1`, array index inexistente e YAML com chave duplicada.
- OpenAPI com método em casing diferente, response `default`, `$ref` local cíclico ou `$ref` remoto.
- Arquivo declarado que não existe, foi renomeado, é symlink ou muda entre captura factual e parse.
- Quinto arquivo válido versus sexto arquivo, arquivo enorme, AST profunda e deadline excedido.
- Mismatch conclusivo coexistindo com uma assertion inconclusiva: o status conservador é
  `inconclusive` se a avaliação total não puder ser completada; mismatches já confirmados permanecem
  no artifact, sem permitir `aligned`.
- Crash antes do artifact, entre artifact e state, ou entre state e `recordRiskSignals`.
- Temporário órfão, artifact órfão completo e state referenciando artifact corrompido.
- Retry com bytes idênticos, mas novo attempt; novo contrato com diff idêntico; signal duplicado.
- Attempt 1 `confirmed`, `retry`, attempt 2 `aligned`: signal histórico mantém risco restricted, mas
  não torna o novo resultado tecnicamente não resolvido.
- Decision file `approved` para drift, decisão válida repetida e request stale após novo diff.
- Step v1/v2 em validate read-only, run mutável novo e resume de state v3 depois do rollout.

## Rollout / Rollback

1. Prototipar parser, extensões e limites sem habilitar execução mutável; registrar baseline e matriz
   de sintaxe/formato.
2. Introduzir validação v3 e documentação, mantendo leitura diagnóstica de v1/v2.
3. Introduzir state v4 e detector em modo de fixture/teste, sem tratar resultado como acceptance de
   runs reais.
4. Habilitar `CHECKING_DRIFT` somente quando schemas, recovery, signal, reviewer e HITL contextual
   estiverem cobertos; a partir desse marco, runs mutáveis exigem step v3.
5. Executar evidência manual com rename proposital e comprovar state, artifact, review, decisão
   inválida e rejeição acionável.

Rollback interrompe novos runs e preserva state v4/artifacts para auditoria. Versão anterior não
retoma state v4 nem executa steps v3 por downgrade implícito. Runs incompatíveis são cancelados; a
reversão nunca converte resultado ausente em `aligned` nem reabilita execução mutável v1/v2.

## Acceptance criteria

- **AC-01:** Step schema v3 é fechado, exige `implementationContract` e bloqueia campos/tipos extras
  ou referências inválidas antes de qualquer efeito.
- **AC-02:** Toda AC do step aparece exatamente uma vez em `coverage`; `structural` referencia
  assertions mecânicas e `behavioral` referencia evidence requirements existentes com justificativa.
- **AC-03:** V1/v2 permanecem reconhecíveis em leitura/diagnóstico, mas qualquer execução mutável
  após rollout bloqueia cedo com orientação de replan/migração v3, sem fallback silencioso.
- **AC-04:** O dispatcher aceita somente `node-symbol`, `structured-data` e `openapi-operation`, sem
  plugin engine, DSL ou código carregado dinamicamente.
- **AC-05:** `@babel/parser@7.29.7` está pinado exatamente como `devDependency`; nenhum detector
  executa/importa código, faz type checking global, module resolution ou acesso remoto; vetting
  mínimo de origem/licença/manutenção/provenance/advisories e instalação sem scripts é registrado.
- **AC-06:** A matriz testada cobre JS/CJS/MJS/TS e documenta o resultado do protótipo para
  JSX/TSX/CTS/MTS; CJS dinâmico, parser inválido e sintaxe não suportada nunca resultam em `aligned`.
- **AC-07:** JSON/YAML usa JSON Pointer e expectativas fechadas de existência/tipo/valor/required
  keys; OpenAPI usa path+method e operationId/request/response refs exclusivamente locais.
- **AC-08:** O detector usa representação canônica própria e não persiste AST Babel ou source
  integral.
- **AC-09:** A análise lê no máximo cinco paths exatos declarados e confinados ao worktree, rejeita
  symlink e não expande glob, diretório ou path remoto; analisa snapshot/bytes capturados por
  descritor seguro e vinculados por hash, sem janela de troca silenciosa.
- **AC-10:** Limites centrais testáveis de bytes, nós, profundidade e tempo são definidos a partir de
  baseline e aplicados antes/durante parse em worker terminável; excedê-los produz `inconclusive`,
  nunca análise truncada considerada alinhada.
- **AC-11:** `CHECKING_DRIFT` é fase real entre `GATING` e `REVALIDATING`, não gate catalogado, e
  preserva a ordem até `REVIEWING`.
- **AC-12:** O resultado por attempt no state schema v4 contém status, `contractHash`,
  `detectorBundleHash`, `factualIdentityHash`, `diffHash`, source bytes hash, artifact id/hash e
  `checkedAt`; histórico de attempts não é sobrescrito e pode ser consultado.
- **AC-13:** Somente `aligned` satisfaz acceptance; ausência, `confirmed` e `inconclusive` jamais são
  equivalentes a sucesso.
- **AC-14:** `confirmed` e `inconclusive` emitem `RiskSignal` genérico `restricted` via
  `recordRiskSignals`, com `evidenceRefs` e fingerprint idempotente, sem alterar o agregador.
- **AC-15:** Reviewer read-only roda mesmo com `confirmed`/`inconclusive`; depois dele, somente o
  checkpoint pós-review HITL existente é usado, sem pausa ou state machine paralela.
- **AC-16:** Com drift não resolvido, `outcome: approved` falha com código estável equivalente a
  `DRIFT_APPROVAL_CANNOT_OVERRIDE`; a condição usa somente o driftCheck do attempt atual; apenas
  rejeição com `retry`, `replan` ou `abort` é válida.
- **AC-17:** Documentação e contexto explicam que `retry` mantém o contrato e refaz código, enquanto
  `replan` cancela o run para atualizar e aprovar spec/step v3; nenhuma reconciliação generativa
  ocorre.
- **AC-18:** Recovery reutiliza resultado somente com bindings/artifact exatos, recalcula resultado
  ausente read-only, trata temporário/artifact órfão sem autoridade, falha terminalmente corrupção
  referenciada e reconcilia signal ausente idempotentemente.
- **AC-19:** Resultado, signal ou aprovação nunca são reutilizados entre attempts, mesmo com diff
  idêntico.
- **AC-20:** Testes adversariais cobrem traversal, symlink, arquivo extra, bombs de bytes/nós/
  profundidade, timeout coercitivo, troca concorrente, `$ref` remoto/cíclico, YAML ambíguo e parser
  malformado com comportamento fail-closed e sem persistir valores brutos.
- **AC-21:** Teste manual proposital renomeia um campo/símbolo contratado, mantém gates locais
  passando, observa `confirmed` no state consultável, artifact e review, rejeita `approved` e conclui
  com uma das três rejeições válidas.
- **AC-22:** Documentação durável descreve step v3, assertions/coverage, matriz de suporte, estados,
  recovery, interpretação de resultados, escolha retry/replan e troubleshooting.
- **AC-23:** Os global gates futuros incluem `workflow-tests`, `specs-lint` e `verify-pack`; se
  `docs/commands` ou adapters de commands forem alterados, incluem também os checks de commands
  aplicáveis.

## Open questions

1. **Limites numéricos:** quais valores de bytes por arquivo/total, nós, profundidade e tempo
   acomodam fixtures reais sem abrir DoS local? Responsável: protótipo do parser/limites; decisão
   antes de habilitar rollout mutável.
2. **Matriz Babel:** quais plugins/configurações exatas de `@babel/parser@7.29.7` suportam
   deterministicamente JSX, TSX, CTS e MTS sem heurística por conteúdo? Responsável: protótipo; a
   extensão não comprovada fica `inconclusive`.
3. **Assinaturas TypeScript:** qual subconjunto mínimo de anotações de retorno e overloads pode ser
   canonicalizado sem virar type checker? Responsável: protótipo e review arquitetural; fora do
   subconjunto permanece `inconclusive`.
4. **Configuração do worker:** quais `resourceLimits`, estratégia de deadline/terminate e limites de
   stack/heap encerram Babel/YAML de modo coercitivo sem instabilidade nas fixtures normais?
   Responsável: protótipo; não se habilita rollout sem contenção testada.

## Implementation plan

1. Prototipar parser, worker, matriz, canonicalização, vetting e limites com baseline, mantendo tudo shadow/dormant (`package.json`, `package-lock.json`, `scripts/workflow/prototype-spec-code-drift.cjs`, `docs/audits/prosa-spec-code-drift-prototype.md`).
2. Evoluir step v3 e coverage bijetiva (`schemas/step.schema.json`, `scripts/workflow/lib/contracts.cjs`, `scripts/workflow/test-contracts.cjs`).
3. Implementar representação canônica e `node-symbol` (`scripts/workflow/lib/spec-code-drift.cjs`, `scripts/workflow/test-spec-code-drift.cjs`).
4. Acrescentar `structured-data` e `openapi-operation` no mesmo domínio (`scripts/workflow/lib/spec-code-drift.cjs`, `scripts/workflow/test-spec-code-drift.cjs`).
5. Isolar parsing em worker com limites coercitivos (`scripts/workflow/lib/spec-code-drift-worker.cjs`, `scripts/workflow/lib/spec-code-drift.cjs`, `scripts/workflow/test-spec-code-drift.cjs`).
6. Capturar snapshot seguro e artifact sem valores brutos (`scripts/workflow/lib/local-adapter.cjs`, `scripts/workflow/lib/artifacts.cjs`, `scripts/workflow/test-adapter.cjs`, `scripts/workflow/test-artifacts.cjs`).
7. Evoluir state v4 por attempt e referências (`schemas/state.schema.json`, `scripts/workflow/lib/runtime.cjs`, `scripts/workflow/test-state.cjs`).
8. Implementar publicação/recovery e bundle hash (`scripts/workflow/lib/spec-code-drift.cjs`, `scripts/workflow/lib/local-adapter.cjs`, `scripts/workflow/lib/runtime.cjs`, `scripts/workflow/test-adapter.cjs`, `scripts/workflow/test-state.cjs`).
9. Inserir `CHECKING_DRIFT` preservando reviewer (`scripts/workflow/lib/state-machine.cjs`, `scripts/workflow/lib/orchestrator.cjs`, `scripts/workflow/lib/local-adapter.cjs`, `scripts/workflow/test-state.cjs`, `scripts/workflow/test-e2e.cjs`).
10. Produzir signals restricted idempotentes (`scripts/workflow/lib/risk-signals.cjs`, `scripts/workflow/lib/orchestrator.cjs`, `scripts/workflow/test-risk-signals.cjs`, `scripts/workflow/test-e2e.cjs`).
11. Restringir decisão contextual por attempt atual (`scripts/workflow/lib/hitl-decision.cjs`, `scripts/workflow/lib/local-adapter.cjs`, `scripts/workflow/test-hitl-decision.cjs`, `scripts/workflow/test-adapter.cjs`).
12. Tornar `aligned` predicado de acceptance (`scripts/workflow/lib/acceptance.cjs`, `scripts/workflow/lib/local-adapter.cjs`, `scripts/workflow/test-acceptance.cjs`, `scripts/workflow/test-adapter.cjs`).
13. Cobrir e2e de v1/v2, rename, inconclusive, retry alinhado e crash (`scripts/workflow/test-e2e.cjs`, `scripts/workflow/test-adapter.cjs`).
14. Atualizar documentação durável (`README.md`, `docs/workflows/automated-spec-pipeline.md`, `docs/workflows/automated-spec-pipeline-runbook.md`, `docs/workflows/prosa-development.md`).
15. Registrar evidência manual e habilitar transacionalmente o fail-closed para runs futuros, encerrando a exceção bootstrap (`scripts/workflow/lib/orchestrator.cjs`, `scripts/workflow/lib/local-adapter.cjs`, `scripts/workflow/test-e2e.cjs`, `docs/audits/prosa-spec-code-drift-manual.md`).
