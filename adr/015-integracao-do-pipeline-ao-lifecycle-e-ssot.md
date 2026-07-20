# ADR 015 — Integração do pipeline ao lifecycle e SSOT

**Status:** Accepted
**Data:** 2026-07-16
**Spec:** [Pipeline automatizado de execução de specs](../specs/automated-spec-pipeline.md)

## Context

O repositório adota Discovery → Spec → ADR → Atomic Steps → Handoff → Review. Specs e steps ativos são artefatos versionados de mudança; documentação durável recebe a verdade viva depois da conclusão. A automação precisa executar esse fluxo sem criar um backlog, plano ou estado normativo paralelo.

O pipeline também precisa sobreviver a interrupções e registrar evidências operacionais. Esses dados têm lifecycle diferente dos requisitos e não devem contaminar `specs/`, `adr/` ou documentação durável.

## Problem

Como integrar execução automatizada ao lifecycle existente, representar dependências e persistir estado operacional sem introduzir um segundo SSOT?

## Assumptions

- Spec e atomic steps foram aprovados antes da execução.
- A estrutura canônica continua definida por `docs/workflows/spec-process.md`.
- Estado de execução pode ser descartado; requisitos e decisões não.

## Alternatives Considered

### A. Manifesto DAG versionado como entrada primária

- **Prós:** formato explícito e simples para uma engine consumir; poderia carregar estado e políticas no mesmo arquivo.
- **Contras:** duplica plano e dependências dos steps, cria drift e converte uma automação local em nova fonte normativa.

### B. Board ou banco local como backlog canônico

- **Prós:** boa visualização e atualização de status; facilita scheduling futuro.
- **Contras:** requisitos saem do Git, lifecycle deixa de ser auditável por diff e a ferramenta vira dependência do processo.

### C. DAG derivado dos artefatos canônicos e runtime descartável

- **Prós:** preserva spec/steps como SSOT, detecta inconsistências antes de executar e separa verdade normativa de evidência operacional.
- **Contras:** exige derivação e revalidation rigorosas; estado perdido precisa ser reconstruído com cautela.

## Decision

Adotar a alternativa **C**.

1. A spec ativa e seus atomic steps são as únicas fontes do plano, requisitos e dependências.
2. O pipeline deriva o DAG a cada início e retomada; não cria nem aceita manifesto DAG como autoridade.
3. `.workflow-runtime/` contém somente estado efêmero, hashes, snapshots e relatórios da execução.
4. Resume revalida base, artefatos canônicos e catálogo antes de reutilizar evidência.
5. O pipeline respeita os estados do lifecycle: só executa spec aprovada, não arquiva automaticamente e não altera documentação normativa a partir da retrospectiva.
6. OpenCode é o adapter inicial; novos adapters não mudam o SSOT e exigem preservar o mesmo contrato de evidência.

## Consequences

- **Positive:** requisitos continuam revisáveis e versionados em um único lugar.
- **Positive:** UI, relatório ou adapter podem evoluir como projeções do mesmo DAG derivado.
- **Positive:** perda do runtime não apaga decisões nem requisitos.
- **Negative:** derivação, hashing e resume têm regras mais estritas.
- **Negative:** o pipeline não pode usar edição ad hoc do DAG para contornar um step mal especificado; a spec deve ser corrigida e reaprovada.
- **Neutral / to monitor:** projeções futuras devem continuar descartáveis e nunca aceitar edição normativa fora do lifecycle.

## Risks

| Risco | Mitigação |
|---|---|
| Runtime virar SSOT de fato | Proibir requisitos/dependências autorais no runtime e reconstruir o DAG dos Markdown. |
| Resume reutilizar evidência obsoleta | Hashes e revalidation de spec, steps, base e catálogo. |
| Parser inferir dependência ambígua | Falhar fechado e exigir correção no step canônico. |
| Automação arquivar trabalho prematuramente | Archive permanece ação posterior ao review aprovado, conforme workflow canônico. |

## Edge cases

- Runtime ausente ou parcialmente escrito não autoriza presumir step concluído.
- Step órfão, item de plano sem step, ciclo ou numeração duplicada bloqueiam derivação.
- Alteração legítima da spec durante a execução invalida o run e exige nova aprovação.
- Relatório pode ser promovido manualmente a documentação, mas não altera o SSOT por si só.

## Acceptance Criteria

1. Nenhum manifesto DAG versionado ou runtime é necessário para compreender o plano aprovado.
2. O DAG é derivado com correspondência 1:1 entre Implementation plan e steps e rejeita ciclos/órfãos.
3. `.workflow-runtime/` pode ser removido sem perda de requisitos.
4. Resume bloqueia quando hashes ou base divergem.
5. O pipeline não arquiva specs nem reescreve ADRs/documentação normativa automaticamente.

## Trade-offs

Aceitamos reconstrução e validação adicionais em troca de eliminar drift entre plano humano e plano executável. Isso limita scheduling dinâmico e edição por UI, mas preserva a propriedade central do repositório: mudanças e decisões são auditadas no Git. Um novo ADR será necessário se houver demanda comprovada por um modelo de workflow autoral que não possa ser expresso pelos atomic steps.
