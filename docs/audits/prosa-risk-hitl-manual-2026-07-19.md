# Evidência manual do rollout HITL por risco

**Data:** 2026-07-19
**Escopo:** Passo 14 de `spec-prosa-risk-hitl`
**Resultado global:** **VALIDAÇÃO AUTOMATIZADA APROVADA; EVIDÊNCIA MANUAL PENDENTE**

## Conclusão

A revalidação automatizada pós-correção comprovou os quatro comportamentos pedidos: step v1 classificado como
`restricted` antes de efeitos, step v2 autônomo escalado para `restricted` por finding `high`, decisão
consumida uma única vez com replay idempotente e independência entre risco, commit e PR.

O gate integral `verify-pack` terminou com sucesso. A suíte do workflow executou 204 testes: 202
passaram, nenhum falhou e 2 testes de ambiente foram ignorados. Os cenários do adapter de produção
comprovaram persistência dos checkpoints HITL, retomada após restart e binding pós-review ao diff e à
review exatos em repositórios temporários isolados.

Uma execução manual end-to-end com provider real não foi realizada. A implementação e a policy ainda estão
no worktree, fora do `HEAD` aprovado, e o preflight mutável exige checkout principal limpo. Esta
limitação não substitui nem invalida os testes determinísticos abaixo, mas mantém AC-17 e o Critério
de Pronto do Passo 14 pendentes. Não houve rollout operacional contra provider externo nesta auditoria.

## Histórico da revalidação

A primeira execução do gate integral encontrou 9 falhas: 192 testes passaram, 9 falharam e 2 foram
ignorados. As falhas expuseram lacunas reais no adapter local, no encaminhamento do contrato de step,
na leitura segura da decisão e na ordem do preflight. Após as correções, os mesmos cenários e o gate
integral foram repetidos e passaram. A reprovação inicial foi preservada nesta seção como histórico;
ela não representa o estado revalidado deste relatório.

Correções verificadas:

1. O adapter passou a registrar sinais e assessments iniciais e a persistir checkpoints HITL.
2. A decisão passou a ser registrada e consumida após lock e revalidation, com replay idempotente.
3. A retomada após restart passou a reidratar request, decisão e consumo persistidos.
4. O binding pós-review passou a incluir diff completo, review e identidade factual recalculada.
5. A CLI passou a aceitar decision file exportado, arquivo regular restrito e stdin limitado.
6. `schemaVersion`, `changeType` e `behaviorType` passaram a chegar corretamente ao commit.
7. O preflight passou a validar o base antes de consultar disponibilidade de agentes.
8. Retry passou a exigir aprovação vinculada ao novo attempt e assessment antes de qualquer efeito.
9. Request stale passou a ser preservada e renovada com ID novo somente após nova revalidation.
10. Rejeições `retry`/`replan` passaram a descartar o attempt não commitado; `replan` cancela o run.
11. Violações do sandbox passaram a produzir sinal `restricted` persistido.
12. Contextos de aprovação passaram a incluir request, bindings, comando de resume e ações válidas.

## Identidade e sanitização

| Item | Valor registrado |
|---|---|
| Spec | `spec-prosa-risk-hitl` |
| Step | `spec-prosa-risk-hitl-step-14` |
| `baseSha` aprovado | `f24be0c353e…` |
| `HEAD` observado | `a19887da2b0b…` |
| Policy observada | `sha256:ca468dd043aa…` |
| Step 14 observado | `sha256:7015390b36cd…` |
| Testes E2E observados | `sha256:befdbcc95dab…` |
| Testes de decisão observados | `sha256:c3c100c3db2f…` |
| Testes do adapter observados | `sha256:656ad05b6c13…` |
| Testes da CLI observados | `sha256:fa46df830215…` |

Hashes foram truncados somente neste relatório. Os comandos usaram os arquivos integrais. Paths
absolutos, conteúdo de decisões, ambiente, logs de agentes e dados pessoais não foram registrados.
Os IDs `AUTO-01` a `AUTO-06` são identificadores locais desta auditoria automatizada. Os testes de integração
criaram requests, decisions, transitions e artifacts em repositórios temporários; seus IDs e paths
efêmeros não foram publicados nem tratados como artifacts duráveis.

## Evidências

### AUTO-01: v1 conservador antes de efeitos

**Comando:**

```bash
node --test \
  --test-name-pattern='classifies legacy and mixed v2 steps from the approved-base policy before effects|legacy and approvable levels pause before effects while v2 autonomous proceeds' \
  scripts/workflow/test-e2e.cjs
```

**Outcome observado:** `PASS`, 2 testes, 0 falhas.

O cenário classificou steps v1 com `baseLevel=restricted`, `effectiveLevel=restricted` e sinal
`legacy-step-without-change-type`. A pausa ocorreu antes de attempt, worktree ou chamada de agente.
O próprio Passo 14 permanece schema v1 e segue o mesmo caminho conservador.

### AUTO-02: escalada v2 por finding high

**Comando:**

```bash
node --test \
  --test-name-pattern='a high finding escalates through the envelope but remains technically blocking after risk approval|production adapter binds post-review approval to the complete sanitized diff and exact review' \
  scripts/workflow/test-e2e.cjs scripts/workflow/test-adapter.cjs
```

**Outcome observado:** `PASS`, 2 testes, 0 falhas.

O step v2 com `changeType=documentation` iniciou em `autonomous`. O finding `high` produziu o sinal
`high-finding`, elevou o nível efetivo para `restricted` e permaneceu tecnicamente bloqueante após a
aprovação de risco. O teste não permitiu que a decisão humana convertesse o finding em aceite. O
adapter persistente vinculou a aprovação pós-review ao diff sanitizado completo, à review exata e à
identidade factual observada.

### AUTO-03: resume e consumo single-use

**Comando:**

```bash
node --test \
  --test-name-pattern='satisfies and consumes a matching approval exactly once|reconciles an identical replay by transition ID and rejects ambiguous reuse|resume consumes a bound decision only after lock and revalidation|persisted approval replay survives adapter restart and rejects a contradictory decision|decision input accepts restricted regular files and bounded stdin only' \
  scripts/workflow/test-hitl-decision.cjs scripts/workflow/test-e2e.cjs \
  scripts/workflow/test-adapter.cjs scripts/workflow/test-cli.cjs
```

**Outcome observado:** `PASS`, 5 testes, 0 falhas.

A decisão válida foi consumida uma única vez depois de lock e revalidation. O replay idêntico foi
reconciliado pelo transition ID sem novo consumo; reutilização ambígua ou contraditória foi rejeitada.
O cenário persistente repetiu o fluxo após restart do adapter. A entrada pela CLI aceitou somente
arquivo regular com permissões restritas ou stdin dentro do limite de 16 KiB.

### AUTO-04: independência Git

**Comando:**

```bash
node --test \
  --test-name-pattern='risk, commit, and PR authorizations remain independent across the full matrix' \
  scripts/workflow/test-e2e.cjs
```

**Outcome observado:** `PASS`, 1 teste, 0 falhas.

A matriz cobriu níveis `autonomous` e `restricted` contra `autoCommit`, `allowCommit` e `createPr`.
A aprovação de risco não habilitou commit nem PR. A condição observada para commit permaneceu
`autoCommit && allowCommit`; PR permaneceu dependente de autorização própria e do commit elegível.

Nenhum comando desta auditoria passou `--allow-commit` ou `--create-pr`. O `HEAD` permaneceu
`a19887da2b0b…`; nenhum commit, PR ou push foi produzido pelos cenários.

### AUTO-05: gates declarados

**Comandos:**

```bash
node scripts/lint-specs.cjs
npm run test:workflow
npm run verify:workflow
git rev-parse --verify HEAD
git diff --check
```

**Outcomes observados:**

| Gate | Resultado | Resumo |
|---|---|---|
| `specs-lint` | `PASS` | 6 specs ativas, steps e archive estruturalmente consistentes. |
| Suíte do workflow | `PASS` | 204 testes: 202 passaram, 0 falharam e 2 foram ignorados. |
| `verify-pack` | `PASS` | Todas as verificações concluídas com sucesso. |
| `revalidation` | `PASS` | `HEAD=a19887da2b0b…`; diff sem erro de whitespace. |

Os 2 skips são verificações condicionais de ambiente: benchmark opcional do sandbox e rejeição de
plataformas sem suporte ao sandbox macOS. Nenhum skip cobre os cenários HITL desta auditoria.

### AUTO-06: ausência de efeitos Git da auditoria

Na revalidação final, `git status --short` mostrou 31 paths alterados ou não rastreados da
implementação dos Passos 1 a 14. Este relatório é o único path pertencente ao Passo 14. Os testes,
linters, hashes e verificações não mudaram o `HEAD`, não criaram commit, não abriram PR e não
executaram push.

## Limitações

- A policy `workflow/risk-policy.yaml` e a implementação HITL estão no worktree, não no `HEAD` nem no
  `baseSha` aprovado; uma execução mutável deve continuar falhando fechado até existir nova trust
  root commitada.
- O checkout principal está sujo, condição que o preflight real rejeita antes de mutação.
- Os cenários do adapter usam repositórios temporários e seams determinísticos. Eles exercitam
  persistência, Git, artifacts e restart reais sem chamar provider externo.
- Não foi executado `run-spec` ou `resume-spec` end-to-end com provider e credenciais reais.
- Portanto, este relatório aprova o comportamento determinístico e a integração local, não declara
  rollout de produção nem disponibilidade de provider.

## Critério de pronto

| Critério | Estado | Evidência |
|---|---|---|
| v1 → `restricted` com sinal legado | Aprovado automaticamente | `AUTO-01`. |
| v2 autônomo escalado por finding `high` | Aprovado automaticamente | `AUTO-02`. |
| Resume válido e single-use | Aprovado automaticamente | `AUTO-03`, incluindo restart persistente. |
| Independência entre risco, commit e PR | Aprovado automaticamente | `AUTO-04` e `AUTO-06`. |
| Validação integral | Aprovado | `AUTO-05`, sem falhas. |
| AC-17: teste manual end-to-end | Pendente | Checkout sujo e trust root ainda não commitada. |

O Critério de Pronto do Passo 14 ainda não foi atendido. Os cenários determinísticos e a integração
com o adapter persistente estão verdes, mas o teste manual exigido por AC-17 depende de commit, trust
root atualizada, checkout limpo e execução explícita com provider real.
