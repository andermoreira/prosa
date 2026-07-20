# ADR 016 — Política Git, worktree e commit

**Status:** Accepted
**Data:** 2026-07-16
**Spec:** [Pipeline automatizado de execução de specs](../specs/automated-spec-pipeline.md)

## Context

O pipeline executará agentes e gates locais capazes de alterar arquivos. É necessário isolar o estado Git por step, comparar o resultado contra uma referência confiável, controlar escopo e impedir commits/publicação acidentais. Worktrees ajudam na separação de branches e diffs, mas não limitam privilégios do processo.

## Problem

Qual política Git deve governar base, worktrees, contagem de arquivos, commits e PR para que efeitos mutáveis sejam explícitos, auditáveis e recuperáveis?

## Assumptions

- O operador controla o repositório local e aprova um base SHA limpo.
- Git hooks locais podem bloquear commits e devem ser respeitados.
- O limite de escopo desta feature conta todos os paths afetados, não apenas produção.

## Alternatives Considered

### A. Executar e commitar diretamente no checkout atual

- **Prós:** implementação simples e sem cleanup de worktrees.
- **Contras:** mistura steps, aumenta risco de perda/conflito e dificulta atribuir diff e evidência ao parent correto.

### B. Worktree por step com commit automático por default

- **Prós:** isolamento Git e histórico granular com pouca intervenção.
- **Contras:** surpreende o operador, pode consolidar resultado antes do consentimento e confunde isolamento Git com sandbox.

### C. Worktree por step, base aprovada e efeitos opt-in

- **Prós:** diffs atribuíveis, validação de parent, autorização explícita e recuperação local; mantém push fora do pipeline.
- **Contras:** exige lifecycle/cleanup, integração ordenada e tratamento de interrupções.

## Decision

Adotar a alternativa **C**.

1. Toda execução começa de base SHA limpa, existente e explicitamente aprovada.
2. Cada step executa em worktree próprio e é comparado ao parent esperado.
3. Worktree é somente isolamento de estado Git; não é declarado ou usado como sandbox.
4. O limite absoluto é cinco paths afetados por step, incluindo produção, testes, docs, untracked, deleções e os dois paths de rename. Não existe override.
5. Diff fora dos paths previstos pelo step bloqueia acceptance.
6. Commit exige a conjunção de política validada `autoCommit: true` e flag CLI `--allow-commit`; o default é não commitar.
7. Resume verifica se o commit esperado já existe antes de qualquer nova tentativa, evitando duplicação.
8. PR é opcional e posterior ao aceite global. O pipeline não faz `push`; branch sem publicação gera pré-condição não atendida.

## Consequences

- **Positive:** cada step possui diff, evidência e parent claros.
- **Positive:** commits e PRs não ocorrem por configuração unilateral ou default oculto.
- **Positive:** steps excessivos são refatiados antes de integração.
- **Negative:** renames consomem duas posições e podem exigir steps menores.
- **Negative:** worktrees remanescentes e commits parciais demandam diagnóstico/cleanup explícito.
- **Neutral / to monitor:** paralelismo não é assumido; futura execução concorrente exigirá política de ownership e conflitos.

## Risks

| Risco | Mitigação |
|---|---|
| Worktree ser vendido como sandbox | Avisos explícitos na CLI/docs e threat model com privilégios reais. |
| Commit duplicado após crash | Persistir hash e reconciliar Git antes de retomar. |
| Hook falhar depois do aceite | Tratar commit como fase separada; preservar diff e reportar falha sem bypass. |
| PR induzir push implícito | Proibir push no contrato e testar branch sem upstream. |
| Rename burlar limite | Contar origem e destino a partir do diff estruturado. |

## Edge cases

- Checkout dirty, base removida, branch movida e worktree já existente com identidade divergente.
- Arquivo case-only em filesystem case-insensitive, symlink, submodule e arquivo untracked.
- Crash entre commit e gravação do runtime.
- `autoCommit: true` sem flag ou flag com `autoCommit: false`.
- Branch aceita apenas localmente ao solicitar PR; o pipeline para sem push.

## Acceptance Criteria

1. Base não limpa, não existente ou não aprovada bloqueia antes de criar worktree.
2. Cada step é executado e medido contra parent esperado em worktree próprio.
3. Mais de cinco paths ou path não previsto bloqueia, com rename contado como dois.
4. Nenhuma combinação incompleta de autorização cria commit.
5. Resume não duplica commit após interrupção.
6. A opção de PR nunca executa push e explica branch/upstream ausente.

## Trade-offs

Aceitamos custo de lifecycle e menor conveniência em troca de efeitos Git previsíveis. A dupla autorização é deliberadamente redundante: configuração representa política e flag representa consentimento da invocação. Não adicionaremos override do limite, pois isso transformaria uma garantia de revisabilidade em recomendação. Paralelismo ou push automatizado exigirão novo ADR.
