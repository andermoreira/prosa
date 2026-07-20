# ADR 017 — Execução segura por catálogo e trust boundary

**Status:** Accepted
**Data:** 2026-07-16
**Spec:** [Pipeline automatizado de execução de specs](../specs/automated-spec-pipeline.md)

## Context

Specs, steps, diffs e saídas de agentes são texto controlável por conteúdo do repositório e podem conter prompt injection ou strings de shell. O pipeline precisa executar gates e um coding agent com privilégios locais. O base SHA aprovado é a referência auditada, enquanto o worktree muda durante a execução.

Ajv e `yaml` fornecem validação estrutural, mas não substituem política semântica, confinamento de paths nem isolamento de sistema operacional. Reviewer e diagnostician também não podem receber autoridade para corrigir o próprio objeto avaliado.

## Problem

Como permitir execução local extensível o suficiente para os gates aprovados, impedindo que conteúdo mutável defina comandos ou converta narrativa de agente em aceite?

## Assumptions

- O catálogo presente no base SHA passou por review humano e é mais confiável que o worktree.
- O processo local conserva os privilégios do usuário; esta decisão não cria sandbox.
- OpenCode é o único executor inicial, atrás de adapter estreito.

## Alternatives Considered

### A. Comandos shell declarados livremente nos steps

- **Prós:** flexibilidade e baixa cerimônia para adicionar checks.
- **Contras:** command injection, quoting dependente de plataforma e mistura requisitos com capacidade executável.

### B. Allowlist de prefixos sobre strings de shell

- **Prós:** restringe executáveis conhecidos sem catálogo detalhado.
- **Contras:** prefixos são contornáveis, argumentos continuam não confiáveis e shell mantém expansão/redirecionamento.

### C. Gates por ID em catálogo do base SHA, spawn por argv e aceite estruturado

- **Prós:** separa seleção de capacidade de definição do comando, elimina shell parsing e ancora política no conteúdo aprovado.
- **Contras:** novos gates exigem mudança revisada no catálogo; comandos ainda executam com privilégios locais.

## Decision

Adotar a alternativa **C**.

1. Specs/configuração selecionam gates apenas por IDs estáveis.
2. O catálogo efetivo é carregado do base SHA aprovado e validado com parser `yaml`, schema Ajv e invariantes semânticas.
3. Cada gate resolve executable e argumentos separados; spawn usa `shell: false`, cwd confinado, ambiente mínimo, timeout e saída limitada/redigida.
4. Gate desconhecido, catálogo inválido ou tentativa de escape falha fechado. Texto de spec, step, diff ou agente nunca é executado.
5. OpenCode fica atrás de adapter inicial com input/output validado. O core não infere sucesso de prosa livre.
6. Após execução e gates, revalidation verifica base, spec, steps e catálogo antes de review.
7. Reviewer e diagnostician são processos fresh e read-only sobre snapshot; diagnostician explica, mas não corrige nem aprova.
8. Acceptance é função determinística de predicados e evidência estruturada. Finding bloqueante, resposta inválida ou mutação durante review resulta em rejeição.

## Consequences

- **Positive:** conteúdo mutável não escolhe argv arbitrário nem ganha autoridade por prompt.
- **Positive:** catálogo e decisões de aceite são auditáveis e testáveis.
- **Positive:** reviewer independente reduz autocorreção interessada pelo executor.
- **Negative:** catálogo torna-se superfície sensível de review e manutenção.
- **Negative:** `shell: false` não impede comportamento perigoso de um executable já permitido.
- **Neutral / to monitor:** sandbox e isolamento de rede/credenciais continuam controles externos e podem ser fase futura.

## Risks

| Risco | Mitigação |
|---|---|
| Executable catalogado ser perigoso | Review no base, argv explícito, ambiente mínimo e documentação de privilégio. |
| YAML abusivo ou schema permissivo | Limites de parse, Ajv fechado e validação semântica. |
| OpenCode alterar saída | Teste contratual e falha explícita do adapter. |
| Reviewer ser persuadido por prompt injection | Snapshot tratado como dado, sem tools de escrita e aceite fora do modelo. |
| Saída vazar secrets | Ambiente mínimo, limite e redaction antes de persistir. |

## Edge cases

- ID válido duplicado, campo desconhecido, executable vazio, argumento não string e cwd por symlink.
- Catálogo no worktree diverge do base: a cópia mutável é ignorada e o drift é reportado.
- Processo termina por timeout/sinal ou gera saída ilimitada.
- OpenCode retorna texto bem-formado, mas schema/exit status incompatível.
- Reviewer tenta escrever, retorna severidade desconhecida ou omite hash do snapshot.

## Acceptance Criteria

1. Todo gate executado corresponde a ID e entrada validados do catálogo no base SHA.
2. Nenhum spawn de gate usa shell ou concatena conteúdo não confiável.
3. Catálogo/configuração inválidos falham antes do executor.
4. Adapter OpenCode valida contrato e não concede aceite por texto livre.
5. Revalidation detecta drift antes de criar o snapshot de review.
6. Reviewer/diagnostician fresh não conseguem alterar o worktree pelo contrato do pipeline.
7. Acceptance pode ser recalculada das evidências e produz a mesma decisão para os mesmos predicados.

## Trade-offs

Aceitamos menor extensibilidade ad hoc para obter uma trust boundary compreensível. O catálogo reduz command injection, mas não é sandbox; essa limitação deve permanecer visível. Também aceitamos depender de resultado estruturado do reviewer sem delegar a ele a decisão final. Novos tipos de executor, gates dinâmicos ou execução em CI exigem reavaliar a fronteira em novo ADR.
