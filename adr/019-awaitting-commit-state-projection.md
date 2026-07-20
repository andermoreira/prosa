# ADR 019 — `AWAITING_COMMIT` como projeção de `ACCEPTED`

**Status:** Accepted
**Data:** 2026-07-17
**Spec:** [Pipeline automatizado de execução de specs](../specs/automated-spec-pipeline.md)

## Context

A spec do pipeline define a máquina de estados do step com a sequência:

```
ACCEPTING -> ACCEPTED -> AWAITING_COMMIT -> COMMITTED
```

A implementação (`state-machine.cjs`) registra `ACCEPTED` como estado na máquina e
projeta `ACCEPTED` como `AWAITING_COMMIT` no contrato de `openRun`
(`local-adapter.cjs:618`). Ambas as representações descrevem o mesmo estado lógico:
o step foi aceito deterministicamente e aguarda um commit — humano ou automático.

O alias existe porque a distinção semântica entre "aceito, aguardando commit" e "aceito,
commit em andamento" é transitória (~ms no auto-commit) e não justifica um estado
real na máquina enquanto o comportamento for o mesmo.

## Problem

A spec declara `AWAITING_COMMIT` como estado distinto; a implementação o trata como
projeção de `ACCEPTED`. Essa divergência entre spec e código é débito de design que:

1. Viola o diagrama de estados da spec.
2. Complica futuras transições específicas saindo de `AWAITING_COMMIT` (ex: timeout
   de espera humana).
3. Dificulta a leitura do código por novos contribuidores.

## Alternatives Considered

### A. Adicionar `AWAITING_COMMIT` como estado real na máquina

- **Pros:** alinha spec e implementação sem ambiguidade.
- **Contras:** adiciona um estado sem contrapartida funcional hoje (KISS). Exigiria
  migração de estados persistidos, transições extras e duplicação de lógica de
  reconciliação.

### B. Registrar ADR clarifying que `AWAITING_COMMIT` é projeção

- **Pros:** resolve a divergência documental sem mexer na máquina. Preserva a
  simplicidade atual. Fácil de reverter se o comportamento futuro exigir distinção.
- **Contras:** a spec continua com o diagrama "errado" até uma futura revisão.

## Decision

**Alternativa B.** `AWAITING_COMMIT` é uma **projeção de `ACCEPTED` para consumo
externo** (`openRun` e contratos do orchestrator), não um estado distinto na máquina
de estados.

O gatilho para promover `AWAITING_COMMIT` a estado real é a introdução de
comportamento diferente entre os dois — por exemplo, timeout de espera humana com
transição `AWAITING_COMMIT → BLOCKED` ou política de expiração de worktree.

## Consequences

- **Positive:** spec e implementação agora têm uma explicação documentada para a
  divergência. Nenhuma mudança de código necessária.
- **Negative:** o diagrama da spec permanece impreciso até a próxima revisão da spec.
- **Neutral / to monitor:** se a spec evoluir para exigir comportamento distinto de
  `AWAITING_COMMIT`, este ADR deve ser revisitado e a Alternativa A reconsiderada.

## Trade-offs

Aceita-se a simplicidade da máquina de estados atual (4 estados de step ativos ao
invés de 5) em troca de uma imprecisão documental conhecida. O custo de manutenção é
baixo porque `openRun` isola a projeção em um único ponto do código.
