# ADR 023 — Schema versionado conservador para risco e HITL

**Status:** Accepted
**Data:** 2026-07-19
**Spec:** [Política de human-in-the-loop por risco na prosa](../specs/prosa-risk-hitl.md)
**Supersedes:** [ADR 022 — Política de risco e HITL da prosa](022-politica-de-risco-e-hitl-da-prosa.md)

## Context

O ADR 022 decidiu usar `changeType` autoral com policy externa, sinais monotônicos e checkpoints
HITL. Ele também pressupôs migração imediata dos steps ativos. O repositório possui 37 steps v1
válidos sem `changeType`, incluindo os handoffs desta feature no `baseSha` aprovado. Exigir migração
em massa criaria um bootstrap fora da própria spec e faria os documentos se autoeditarem enquanto
revalidation tenta protegê-los.

## Problem

Como introduzir `changeType` obrigatório sem fallback permissivo, mas preservar execução concreta dos
steps v1 e evitar migração em massa ou autoedição do workflow em curso?

## Assumptions

- `schemaVersion` distingue contratos autorais completos; v1 e v2 não são modos implícitos do mesmo
  contrato.
- Os 37 steps ativos v1 são entradas conhecidas e válidas no base atual.
- Compatibilidade só é segura se a ausência de `changeType` nunca produzir autonomia.
- A policy e a classificação continuam vindo do `baseSha` aprovado.

## Alternatives Considered

### A. Rejeitar v1 e migrar todos os steps antes do rollout

- **Prós:** um único formato após a migração.
- **Contras:** exige mudança em massa, cria bootstrap fora da spec e amplia o diff sem ganho
  funcional imediato.

### B. Aceitar `changeType` opcional no mesmo schema

- **Prós:** implementação curta e compatibilidade transparente.
- **Contras:** confunde versões, permite ausência silenciosa e favorece fallback acidental para
  `autonomous`.

### C. Aceitar v1 e classificá-lo pela taxonomia legada `behaviorType`

- **Prós:** preserva mensagens e poderia reduzir pausas.
- **Contras:** transforma um marcador textual de commit em autoridade de risco e mantém duas
  taxonomias normativas.

### D. Contratos v1/v2 explícitos com v1 sempre `restricted`

- **Prós:** compatibilidade concreta, fail-closed conservador, rollout gradual e trilha auditável.
- **Contras:** mantém dois contratos temporariamente e todo step v1 exige duas aprovações.

## Decision

Adotar a alternativa **D**, supersedendo os trechos do ADR 022 que exigiam migração imediata:

1. O step schema v1 existente permanece aceito como contrato fechado sem `changeType`.
2. O step schema v2 exige `changeType` estruturado e reconhecido pela policy. Em v2, ausência ou
   valor desconhecido é erro; `changeType` não é opcional.
3. Todo step v1 recebe nível base e efetivo mínimo `restricted` antes de qualquer efeito, com razão e
   sinal auditável `legacy-step-without-change-type`. `behaviorType` não participa dessa decisão.
4. A migração v1→v2 é gradual e ocorre somente quando a spec ou o step for naturalmente alterado.
   Esta feature não migra os 37 steps nem autoedita seus próprios 14 handoffs.
5. Os 14 handoffs desta feature permanecem v1 no schema atual e, após implementação, passam pelo
   fluxo `restricted`, incluindo aprovação pré-execução e pós-review local ligada ao diff.
6. O mapeamento legado de commit pode ler `behaviorType` apenas para v1. Steps v2 derivam mensagem de
   commit de `changeType`; nenhuma dessas taxonomias autoriza commit ou PR.
7. Policy externa, sinais monotônicos, estados reais de espera, decision file, bindings single-use,
   autorização Git independente, usuário local como autoridade e risco residual permanecem conforme
   o ADR 022.

## Consequences

- **Positive:** rollout não depende de uma alteração em massa e não quebra os steps ativos.
- **Positive:** ausência de `changeType` nunca concede autonomia; a compatibilidade é observável.
- **Positive:** documentos novos ou naturalmente alterados convergem para v2 sem coordenação global.
- **Negative:** steps v1 pagam o custo operacional máximo de HITL até serem promovidos.
- **Negative:** validação, testes e documentação precisam cobrir dois contratos.
- **Neutral / to monitor:** `behaviorType` continua existindo para commit v1, mas sem autoridade de
  risco e sem suporte em v2.

## Risks

| Risco | Mitigação |
|---|---|
| Compatibilidade virar fallback autônomo | Invariante v1→`restricted`, sinal obrigatório e teste negativo. |
| V1 e v2 serem confundidos | Discriminação por `schemaVersion` e contratos fechados separados. |
| Migração nunca terminar | Promoção obrigatória quando o documento for naturalmente alterado. |
| `behaviorType` influenciar risco | Uso limitado e testado apenas na mensagem de commit v1. |
| Excesso de pausas em v1 | Custo aceito como postura conservadora; migrar durante mudança natural. |

## Edge cases

- Run misto com steps v1 `restricted` e steps v2 `autonomous` ou `approval_required`.
- Step v1 com `behaviorType` ausente, desconhecido ou divergente da natureza da mudança.
- Step v2 sem `changeType`, com tipo desconhecido ou contendo marcador `behaviorType` residual.
- Resume de v1 após policy drift ou após novo sinal sem mudança de rank.
- Handoff desta feature tentando editar a si próprio durante revalidation.

## Acceptance Criteria

1. Schema v1 válido continua aceito e sempre gera assessment `restricted` com o sinal legado.
2. Schema v2 válido exige `changeType`; ausência ou valor desconhecido falha fechado.
3. Nenhum path converte v1 em `autonomous` ou usa `behaviorType` para reduzir risco.
4. Commit mapping usa `behaviorType` somente em v1 e `changeType` somente em v2.
5. Os 14 handoffs permanecem v1 e não são autoeditados por esta feature.
6. Migração gradual e troubleshooting estão documentados.

## Trade-offs

Aceitamos dois contratos e mais pausas para steps legados em troca de compatibilidade sem bootstrap
especial. A escolha favorece segurança e revalidation sobre conveniência: v1 continua executável,
mas nunca autônomo. Reavaliar por novo ADR quando não houver mais steps v1 ativos ou quando o custo
operacional justificar uma campanha de migração explicitamente aprovada.
