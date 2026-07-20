# ADR 022 — Política de risco e HITL da prosa

**Status:** Accepted
**Data:** 2026-07-19
**Spec:** [Política de human-in-the-loop por risco na prosa](../specs/prosa-risk-hitl.md)

## Context

A prosa já valida entradas aprovadas, executa steps em worktrees isoladas, aplica gates e mantém
autorizações Git explícitas. Esse desenho não distingue, porém, mudanças rotineiras de mudanças que
exigem julgamento humano antes de efeitos mutáveis. A spec aprovada define uma política versionada,
pausas recuperáveis e decisões auditáveis sem transformar aprovação humana em bypass técnico.

## Problem

Como classificar e elevar risco de forma determinística, inserir checkpoints humanos reais e retomar
o run sem replay, mantendo policy, sinais, decisões técnicas e autorizações Git em fronteiras
independentes?

## Assumptions

- O usuário local que invoca a CLI é a autoridade humana nesta etapa.
- A policy confiável pode ser carregada do `baseSha` aprovado antes de qualquer efeito.
- O review local ocorre antes de acceptance e de qualquer efeito Git.
- Identidade forte, múltiplos aprovadores e defesa contra processo malicioso da mesma identidade
  local permanecem fora de escopo.

## Alternatives Considered

### A. Codificar risco diretamente em cada step

- **Prós:** classificação visível no documento e implementação curta.
- **Contras:** permite ao autor escolher o próprio nível, duplica taxonomia e dificulta elevar áreas
  sensíveis de forma uniforme.

### B. Inferir risco apenas de paths e findings no orchestrator

- **Prós:** dispensa uma policy externa.
- **Contras:** acopla classificação, pausa e execução; torna regras opacas e exige alterar o core
  para cada novo sinal.

### C. Usar `changeType` autoral com policy externa e sinais monotônicos

- **Prós:** separa intenção, classificação e fatos observados; policy é legível, versionada e
  fail-closed; novos produtores reutilizam um envelope estável.
- **Contras:** exige migração dos steps, novo estado persistido e dois checkpoints para mudanças
  `restricted`.

### D. Delegar aprovações a um serviço externo

- **Prós:** identidade forte, RBAC e trilha centralizada.
- **Contras:** adiciona infraestrutura, disponibilidade e administração incompatíveis com o produto
  local e o escopo atual.

## Decision

Adotar a alternativa **C**, com estas invariantes:

1. `changeType` expressa a natureza da mudança, mas seu nível vem exclusivamente de uma policy
   externa versionada e carregada do `baseSha` aprovado. Tipo ausente/desconhecido, policy inválida
   ou drift bloqueiam; não existe fallback permissivo.
2. Os níveis canônicos são `autonomous`, `approval_required` e `restricted`, nessa ordem. Regras de
   área e sinais válidos calculam o máximo entre nível base e mínimos observados; nenhum evento,
   retry ou decisão reduz o maior nível alcançado no run.
3. Sinais usam envelope fechado, limitado e não confiável. Eles podem elevar risco, nunca aprovar,
   escolher ação, alterar `changeType` ou neutralizar finding técnico. Uma fonte futura entra como
   produtor do mesmo envelope, sem mudar a máquina de estados.
4. Esperas HITL são estados reais e persistidos: pré-execução para `approval_required` e
   `restricted`; pós-review local para todo step que tenha alcançado `restricted`. Espera esperada
   não é falha genérica nem consome elapsed humano.
5. `restricted` exige aprovação pré-execução e reaprovação pós-review vinculada ao diff completo e
   exato, ao review, attempt, snapshot, worktree factual, policy e assessment. Mudança de qualquer
   binding torna a decisão stale.
6. Requests e decisões são single-use. O consumo é atômico com a transição, identificado por
   transition ID e revalidado antes do efeito; replay idêntico é idempotente, enquanto replay
   contraditório ou em outro checkpoint falha fechado.
7. `resume-spec` permanece one-shot e não interativo. Recebe decisão somente por
   `--decision-file <path|->`, sob lock e após revalidation; `-` lê stdin. Justificativas não entram
   em argv e são sanitizadas antes de persistência.
8. Rejeição exige exatamente `retry`, `replan` ou `abort`; não cria correction automática. Aprovação
   de risco é independente de `allowCommit`, `autoCommit`, criação de PR e qualquer autorização Git.
9. O usuário local é a autoridade aceita. Um processo malicioso com a mesma identidade pode forjar
   decisão; esse risco residual é explícito e só pode ser removido por decisão futura sobre identidade
   forte ou serviço externo.

## Consequences

- **Positive:** classificação e escalonamento tornam-se determinísticos, auditáveis e extensíveis
  sem uma engine de plugins.
- **Positive:** pausas e resume preservam exactly-once de agentes, review, decisão e efeitos Git.
- **Positive:** aprovação humana não substitui acceptance, severidade, gates, sandbox ou autorização
  Git.
- **Negative:** todos os steps ativos precisam declarar `changeType` e runs antigos incompatíveis
  falham fechado.
- **Negative:** mudanças `restricted` adicionam duas interrupções e artifacts de contexto maiores.
- **Neutral / to monitor:** a autoridade local simplifica a operação individual, mas não oferece
  autenticação forte nem não repúdio.

## Risks

| Risco | Mitigação |
|---|---|
| Policy ou assessment adulterado | Hashes do `baseSha`, bindings factuais e revalidation antes de efeitos. |
| Aprovação reutilizada em outro diff | Request single-use e vínculo a diff/review/attempt exatos. |
| Sinal malformado reduzir risco | Schema fechado, agregação exclusiva por máximo e falha fechada. |
| HITL virar autorização Git implícita | Namespaces, flags e testes de matriz independentes. |
| Processo do mesmo usuário forjar decisão | Risco residual documentado; evolução exige novo ADR. |

## Edge cases

- Escalada para `restricted` somente após finding `high` no review local.
- Segundo attempt com diff idêntico, mas novos attempt, review e request.
- Decisão repetida, contraditória, stale ou pertencente a outro run/checkpoint.
- Policy alterada durante a espera e sinal novo sem mudança de rank.
- Crash antes ou depois da persistência/consumo da decisão.

## Acceptance Criteria

1. A policy externa deriva os três níveis a partir de `changeType`, áreas e sinais monotônicos.
2. Esperas pré-execução e pós-review são estados persistidos e retomáveis sem replay.
3. Requests e decisões têm bindings single-use; stale ou adulteração bloqueiam.
4. `resume-spec` aceita decision file/stdin e registra a decisão atomicamente após revalidation.
5. Aprovação de risco nunca autoriza commit ou PR.
6. Documentação registra o usuário local como autoridade e o risco residual aceito.

## Trade-offs

Aceitamos migração incompatível, mais estado e maior latência humana para obter controle explícito
sem introduzir um serviço de aprovação. Preservamos uma evolução futura para identidade forte porque
o contrato de decisão separa `actor` da autoridade atual, mas não fingimos garantias de autenticação
que o processo local não oferece. Um novo ADR será necessário se houver múltiplos operadores,
aprovação remota, requisito de não repúdio ou defesa contra processos da mesma identidade local.
