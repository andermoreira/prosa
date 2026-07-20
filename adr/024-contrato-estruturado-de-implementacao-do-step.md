# ADR 024 — Contrato estruturado de implementação do step

**Status:** Accepted
**Data:** 2026-07-19
**Spec:** [Detecção de drift spec-código na prosa](../specs/prosa-spec-code-drift.md)
**Supersedes partially:** [ADR 023 — Schema versionado conservador para risco e HITL](023-schema-versionado-conservador-para-risco-hitl.md)

## Context

A prosa já possui specs e steps estruturados, limita cada step a cinco arquivos e mantém evidence
requirements por AC. Nomes de símbolos, assinaturas, campos de documentos e endpoints, porém, ainda
estão em texto livre. Não existe uma representação mecânica e local que permita comparar esses fatos
com o diff sem executar o código.

O ADR 023 preservou steps v1 sem `changeType` e definiu migração gradual para v2. Essa decisão foi
adequada ao bootstrap de risco/HITL, mas não fornece informação suficiente para detecção de drift.
Executar v1/v2 sob a nova garantia daria uma aparência falsa de proteção.

## Problem

Como tornar a intenção estrutural do step verificável, completa em relação às suas ACs e segura para
análise local, sem transformar o contrato em AST persistida, DSL executável ou type checker global?

## Assumptions

- V1/v2 ainda precisam ser reconhecidos para leitura e diagnóstico operacional.
- Runs mutáveis após o rollout podem exigir replan/migração explícita em vez de compatibilidade
  executável silenciosa.
- Evidence requirements existentes continuam adequadas para provas comportamentais.
- O limite vigente é de cinco arquivos lógicos por step.
- Números de limites de recursos dependem de baseline e não serão inventados neste ADR.

## Alternatives Considered

### A. Continuar inferindo contratos da prosa livre

- **Prós:** nenhuma migração de schema; baixo custo autoral imediato.
- **Contras:** parsing heurístico, cobertura impossível de provar, falsos alinhamentos e baixa
  auditabilidade.

### B. Persistir AST Babel ou permitir assertions em uma DSL/plugin

- **Prós:** grande expressividade e proximidade da representação do parser.
- **Contras:** acoplamento ao fornecedor/versão, superfície de execução, schema instável e risco de o
  step escolher código detector privilegiado.

### C. Executar testes/type checker e considerar gates como prova de alinhamento

- **Prós:** reutiliza ferramentas conhecidas e cobre parte do comportamento.
- **Contras:** gates não provam que toda AC está representada, type checking exige resolução global e
  um rename pode continuar verde sem corresponder ao contrato aprovado.

### D. Step v3 fechado com contrato canônico próprio e detectores built-in locais

- **Prós:** cobertura verificável, dispatch limitado, análise sem execução e evolução versionada.
- **Contras:** exige migração explícita, mais autoria no step e suporte inicial deliberadamente
  restrito.

## Decision

Adotar a alternativa **D**:

1. Criar o step schema `3.0.0`, fechado e obrigatório para runs mutáveis depois do rollout. V1/v2
   permanecem reconhecíveis para leitura/diagnóstico, mas bloqueiam cedo antes de efeitos e exigem
   replan/migração v3.
2. Essa regra supersede parcialmente os itens 1, 3 e 4 da Decision do ADR 023 **somente quanto à
   execução após o rollout v3**: a migração deixa de ser apenas gradual para qualquer step que
   pretenda executar. O ADR 023 permanece histórico e imutável; suas decisões de risco/HITL não
   afetadas continuam válidas.
3. V3 exige `implementationContract` com representação canônica própria, versionada e independente
   da AST do parser.
4. Cada AC do step deve aparecer exatamente uma vez em `coverage`. Coverage `structural` referencia
   assertions mecânicas; `behavioral` referencia evidence requirements existentes e contém
   justificativa. Ausência, duplicidade ou referência órfã invalida o step.
5. A primeira versão aceita somente `node-symbol`, `structured-data` e `openapi-operation`, por
   dispatcher built-in fechado. Não haverá plugin engine, DSL, callback autoral ou carregamento
   dinâmico.
6. `node-symbol` usa `@babel/parser@7.29.7` como `devDependency` com pin exato para JS/CJS/MJS/TS e
   para JSX/TSX/CTS/MTS apenas quando a matriz do protótipo comprovar suporte. Código analisado nunca
    é executado/importado; não há type checking global ou module resolution.
   A inclusão exige vetting mínimo documentado de origem, licença, manutenção, provenance,
   advisories, integridade do lockfile, audit de severidade alta e instalação sem scripts.
7. `structured-data` usa JSON Pointer sobre JSON/YAML. `openapi-operation` compara path+method,
   `operationId` e referências de request/response exclusivamente locais. Imports e `$ref` remotos
   são proibidos.
8. CJS dinâmico, parser/formato inválido, sintaxe não suportada ou prova incompleta resulta em
   `inconclusive`, nunca em alinhamento presumido.
9. O detector captura no máximo os cinco paths exatos declarados em snapshot fechado. `realpath`
   isolado não basta: descritor seguro, `O_NOFOLLOW`, `fstat`, validação de ancestrais, hash dos bytes
   efetivamente lidos e identidade antes/depois impedem troca silenciosa. Parsing ocorre em worker
   terminável com limites de bytes, heap, stack, nós, profundidade e deadline vindos de configuração
   central testável; seus números serão fixados após protótipo e baseline.
10. Artifacts nunca persistem valores observados brutos. Guardam somente IDs, paths lógicos,
     presença, tipos/shapes, comprimentos limitados e, quando indispensável, digest keyed escopado ao
     run, com sensibilidade `restricted`.
11. O bootstrap usa exclusivamente os 15 handoffs schema v2 aprovados da spec vinculada, ligados ao
    `source.hash`, `baseSha` e IDs exatos. V3 e enforcement permanecem shadow/dormant até o Step 15,
    que encerra a exceção ao habilitar fail-closed para novos runs e resumes futuros. A exceção não é
    compatibilidade geral nem waiver e não permite iniciar outro step v2.

## Consequences

- **Positive:** intenção estrutural deixa de depender de extração heurística de prosa.
- **Positive:** coverage total torna explícita a fronteira entre prova mecânica e evidência
  comportamental.
- **Positive:** detectores são locais, determinísticos e não executam input não confiável.
- **Negative:** steps v1/v2 deixam de executar após o rollout e precisam de replan v3.
- **Negative:** autores precisam manter assertions e coverage além das evidence requirements.
- **Negative:** a v1 dos detectores não cobre semântica dinâmica ou tipos resolvidos.
- **Neutral / to monitor:** extensões e construções não comprovadas elevam a taxa de `inconclusive`,
  que deve orientar evolução explícita, não fallback.

## Risks

| Risco | Mitigação |
|---|---|
| Contrato imitar AST e ficar instável | Vocabulário pequeno de domínio, representação própria e versão independente. |
| Migração interromper trabalho ativo | Rollout anunciado, diagnóstico v1/v2 e replan explícito preservando artifacts. |
| Limites permitirem DoS ou bloquearem arquivos normais | Protótipo adversarial e baseline antes de fixar valores. |
| Coverage behavioral virar escape genérico | Evidence requirement existente, rationale obrigatória e review da cobertura. |
| Parser induzir execução/resolução | API somente de parse, dispatcher fechado e testes que proíbem import/rede/subprocesso. |
| Captura sofrer TOCTOU | Snapshot/descriptor seguro, hashes dos bytes e identidade factual antes/depois. |
| Parser bloquear o orchestrator | Worker terminável com limites coercitivos; excesso resulta inconclusive. |
| Artifact duplicar segredo ou PII | Proibir valores brutos; persistir somente shape/metadados/hashes. |
| Dependência pinada estar comprometida | Vetting mínimo, provenance/advisories, lock integrity, audit e ignore-scripts. |

## Edge cases

- AC ausente, duplicada ou referenciada por duas formas de coverage.
- Assertion aponta para path não previsto, symlink, arquivo renomeado ou sexto arquivo.
- Export CJS calculado, reexport ambíguo, overload TypeScript ou sintaxe ainda não suportada.
- JSON/YAML ambíguo, JSON Pointer escapado e OpenAPI com `$ref` remoto/cíclico.
- Limite atingido antes de completar todas as assertions.
- Operação read-only sobre v1/v2 versus tentativa de execução mutável após rollout.

## Acceptance Criteria

1. V3 é fechado e exige `implementationContract`; v1/v2 não executam silenciosamente após rollout.
2. Toda AC possui exatamente uma coverage estrutural ou comportamental válida.
3. Os três tipos de assertion e seus formatos locais estão documentados e validados por união
   discriminada fechada.
4. Babel está pinado e vetado; nenhuma análise executa código ou resolve dependências/remotos.
5. Captura, worker, limites coercitivos e minimização de artifact são centrais, testáveis e não
   configuráveis pelo step.
6. A supersedência parcial do ADR 023 é aplicada sem editar o ADR aceito.

## Trade-offs

Aceitamos uma migração incompatível e menor expressividade inicial para obter um contrato que possa
ser validado sem executar código não confiável. Coverage comportamental preserva casos que a análise
local não prova, mas custa disciplina autoral. Um novo ADR será necessário para adicionar tipo de
assertion, resolução entre arquivos além do subconjunto local, análise de tipos ou plugins; aumento
de limites numéricos, por si só, exige baseline e review, não necessariamente nova arquitetura.
