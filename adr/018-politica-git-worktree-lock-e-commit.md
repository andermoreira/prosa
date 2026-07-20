# ADR 018 — Política Git, worktree, lock e commit

**Status:** Accepted
**Data:** 2026-07-16
**Supersedes:** [ADR 016 — Política Git, worktree e commit](016-politica-git-worktree-e-commit.md)
**Spec:** [Pipeline automatizado de execução de specs](../specs/automated-spec-pipeline.md)

## Context

O ADR 016 definiu base aprovada, worktree por step, efeitos Git opt-in e limite de cinco arquivos, mas contou origem e destino de todo rename separadamente. A política aprovada agora distingue rename inequivocamente identificado pelo Git de delete+add ambíguo. O pipeline também requer exclusão mútua por repositório para que duas execuções não compartilhem runtime/worktrees ou disputem commits.

## Problem

Como contar arquivos lógicos em renames e coordenar efeitos Git concorrentes preservando base confiável, worktrees não-sandbox, commits opt-in e PR sem push?

## Assumptions

- O diff estruturado do Git informa quando um rename foi identificado inequivocamente.
- Similaridade ambígua ou não reconhecida permanece delete+add.
- Lock de filesystem coordena instâncias cooperantes do pipeline, não processos externos.

## Alternatives Considered

### A. Manter origem e destino como dois arquivos em todo rename

- **Prós:** contagem simples e conservadora.
- **Contras:** penaliza uma única mudança lógica e contradiz a política aprovada.

### B. Contar qualquer delete+add semelhante como um rename

- **Prós:** reduz contagem em refactors e movimentações.
- **Contras:** exige heurística própria, pode unir arquivos distintos e torna acceptance não determinística.

### C. Contar rename inequívoco do Git como um arquivo lógico e ambíguo como dois, sob lock por repositório

- **Prós:** usa evidência estruturada, preserva determinismo, evita heurística própria e impede duas execuções cooperantes simultâneas.
- **Contras:** comportamento depende da classificação do Git e lock stale requer recuperação cuidadosa.

## Decision

Adotar a alternativa **C**.

1. A execução mutável exige lock atômico e exclusivo por identidade real do repositório.
2. Lock registra repo identity, runId, PID, host e timestamps. Lock existente bloqueia; stale recovery exige provar processo ausente, validar identidade e obter confirmação explícita.
3. Base SHA deve existir, estar limpa e ser aprovada; cada step usa worktree próprio comparado ao parent esperado. Worktree não é sandbox.
4. O limite absoluto é cinco **arquivos lógicos** por step, incluindo produção, testes, docs, config, untracked e deleções.
5. Rename inequivocamente identificado pelo Git conta como um arquivo lógico; origem e destino permanecem na evidência. Delete+add ou rename ambíguo conta dois. Não há override.
6. Path fora da declaração do step bloqueia mesmo quando a contagem total não excede cinco.
7. Commit exige `autoCommit: true` e `--allow-commit`, respeita hooks e é reconciliado no resume.
8. PR é opt-in após acceptance global e nunca faz push.

## Consequences

- **Positive:** movimentação inequívoca não consome duas posições artificialmente.
- **Positive:** evidência conserva origem/destino sem confundir contagem lógica.
- **Positive:** lock reduz corrida entre runs cooperantes.
- **Negative:** classificação ambígua continua custando dois arquivos.
- **Negative:** stale lock exige intervenção segura e pode atrasar retomada.
- **Neutral / to monitor:** processos externos ao pipeline ainda podem alterar Git e serão detectados por revalidation.

## Risks

| Risco | Mitigação |
|---|---|
| Heurística diferente da saída Git | Consumir status estruturado e não recalcular similaridade. |
| PID reutilizado liberar lock vivo | Combinar PID, host, repo identity, runId e confirmação. |
| Crash após commit | Reconciliar parent/tree/commit antes de repetir. |
| Worktree interpretado como sandbox | Aviso e threat model explícitos. |
| PR provocar publicação implícita | Não expor push e testar argv. |

## Edge cases

- Case-only rename reconhecido pelo Git conta um; se representado como delete+add, conta dois.
- Rename com edição continua um quando o Git o classifica inequivocamente.
- Dois renames inequívocos contam dois arquivos lógicos, embora quatro paths apareçam na evidência.
- Lock stale em outro host não é removido apenas por idade.
- Crash entre aquisição do lock e persistência do run exige reconciliação antes de recovery.

## Acceptance Criteria

1. Rename inequívoco conta um arquivo lógico e preserva origem/destino na evidência.
2. Delete+add/rename ambíguo conta dois sem heurística própria.
3. Sexto arquivo lógico ou path não previsto bloqueia.
4. Duas execuções mutáveis não adquirem simultaneamente lock do mesmo repositório.
5. Stale recovery exige prova, identidade e confirmação.
6. Commit mantém dupla autorização e resume idempotente.
7. PR nunca executa push.

## Trade-offs

Aceitamos depender da classificação estruturada do Git para evitar uma heurística paralela e preservar a noção de arquivo lógico. Também aceitamos bloqueio conservador de locks duvidosos em troca de não liberar execução ativa. Este ADR substitui integralmente o ADR 016; o documento anterior permanece imutável como registro histórico.
