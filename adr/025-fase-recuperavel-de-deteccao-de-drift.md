# ADR 025 — Fase recuperável de detecção de drift

**Status:** Accepted
**Data:** 2026-07-19
**Spec:** [Detecção de drift spec-código na prosa](../specs/prosa-spec-code-drift.md)
**Related:** [ADR 022 — Política de risco e HITL da prosa](022-politica-de-risco-e-hitl-da-prosa.md),
[ADR 024 — Contrato estruturado de implementação do step](024-contrato-estruturado-de-implementacao-do-step.md)

## Context

O ADR 022 separou sinais de risco, aprovação humana e predicados técnicos: signal pode elevar risco,
mas não neutraliza gate, finding ou acceptance. O ADR 024 define o contrato v3 que torna
fatos estruturais comparáveis. O pipeline atual, contudo, move o step diretamente de `GATING` para
`REVALIDATING` e gates catalogados falham antes de o reviewer produzir uma avaliação de qualidade.

Para drift, interromper imediatamente perderia o review útil para a decisão humana. Tratar drift
apenas como signal, por outro lado, permitiria confundir aprovação de risco com correção técnica.
A operação também precisa sobreviver a crash sem reutilizar evidência em outro attempt.

## Problem

Como inserir detecção de drift como predicado técnico bloqueante e recuperável, ainda produzir signal
e contexto HITL, preservar o reviewer em resultados negativos e evitar uma segunda máquina de
aprovação?

## Assumptions

- `recordRiskSignals`, agregação monotônica e checkpoint pós-review do ADR 022 já estão implantados.
- O contrato v3 e `contractHash` do ADR 024 estarão validados antes da execução.
- A identidade factual e o diff hash do attempt podem vincular resultado e artifact.
- O detector é read-only e idempotente; ausência de resultado pode ser recalculada sem repetir o
  executor ou gates já comprovados.

## Alternatives Considered

### A. Cadastrar drift em `workflow/gates.yaml`

- **Prós:** reutiliza catálogo, execução e relatório de gates.
- **Contras:** a falha atual de gate interrompe antes do reviewer e não oferece recovery específico
  para artifact/signal por attempt.

### B. Emitir somente `RiskSignal`

- **Prós:** nenhuma nova fase ou predicado de acceptance.
- **Contras:** aprovação humana poderia parecer suficiente; `inconclusive` não impediria aceite por
  uma regra técnica própria.

### C. Criar uma pausa/state machine exclusiva de drift

- **Prós:** decisões e telas específicas.
- **Contras:** duplica HITL, decision file, bindings e recovery; aumenta risco de decisões
  contraditórias.

### D. Fase built-in com resultado técnico, signal e checkpoint HITL existente

- **Prós:** mantém separação de responsabilidades, preserva review, reutiliza governança e permite
  recovery exato por attempt.
- **Contras:** evolui a state machine/state schema e exige reconciliação entre resultado, artifact e
  signal.

## Decision

Adotar a alternativa **D**:

1. Inserir o estado real `CHECKING_DRIFT` no fluxo
   `GATING -> CHECKING_DRIFT -> REVALIDATING -> REVIEWING`. A operação é built-in, read-only e
   idempotente.
2. A fase é chamada funcionalmente de gate de drift, mas não é gate catalogado. Mesmo com resultado
   `confirmed` ou `inconclusive`, revalidation e reviewer read-only continuam para coletar avaliação
   de qualidade.
3. O operation ID deriva de `runId`, `stepId`, `attemptId`, `contractHash`,
   `factualIdentityHash` e `detectorBundleHash`. O bundle hash cobre detectores, canonicalização,
   parser/plugins, matriz de suporte e limites. Resultado também se vincula ao `diffHash`, hashes dos
   bytes capturados e artifact id/hash.
4. Evoluir o state para `4.0.0`. Cada attempt preserva `status` (`aligned`, `confirmed` ou
   `inconclusive`), `contractHash`, `detectorBundleHash`, `factualIdentityHash`, `diffHash`, source
   bytes hash, artifact id/hash e `checkedAt`. Mismatches/detalhes ficam em artifact sanitizado.
   Ausência nunca equivale a `aligned`, e histórico não é sobrescrito.
5. Somente `aligned` satisfaz o predicado técnico de acceptance. `confirmed` e `inconclusive` são
   bloqueantes mesmo após decisão humana.
6. Ambos emitem `RiskSignal` genérico com `minimumLevel: restricted`, `evidenceRefs` e fingerprint
   idempotente, usando `recordRiskSignals`. O agregador do ADR 022 não será alterado.
7. Depois do reviewer, reutilizar o checkpoint pós-review HITL existente, ligado a assessment, diff,
   review e artifact de drift. Não criar pausa nem state machine paralela.
8. Na presença de drift não resolvido no `driftCheck` íntegro do **attempt atual**, `outcome:
   approved` é semanticamente inválido e retorna
   `DRIFT_APPROVAL_CANNOT_OVERRIDE` (ou código estável equivalente) sem liberar acceptance. As únicas
   decisões válidas são `rejected+retry`, `rejected+replan` e `rejected+abort` no decision file
   existente. Signals monotônicos de attempts anteriores continuam auditáveis e mantêm risco, mas
   não tornam um novo attempt `aligned` tecnicamente não resolvido.
9. `retry` descarta o attempt para alinhar código ao contrato vigente. `replan` cancela o run para
   revisão/aprovação de spec e step v3. Não há waiver nem reconciliação generativa automática.
10. Artifact é publicado atomicamente antes do state. Recovery reutiliza resultado somente quando
    registro, artifact e todos os bindings coincidem. Temporário/artifact órfão sem referência não
    tem autoridade e pode ser limpo/recalculado; state referenciando artifact inválido é corrupção e
    falha terminalmente o run com diagnóstico, exigindo novo run. Resultado íntegro sem signal
    reconcilia o signal idempotentemente. Nada é reutilizado entre attempts.
11. A fase e seus bloqueios permanecem shadow/dormant durante os Steps 1 a 14 do bootstrap aprovado.
    O Step 15 registra a evidência e habilita o enforcement em uma única transação para novos runs e
    resumes futuros, ao mesmo tempo em que encerra a exceção v2 vinculada à spec, ao `baseSha` e aos
    15 IDs exatos. Falha parcial não pode deixar enforcement ativo com exceção aberta, ou vice-versa.

## Consequences

- **Positive:** drift permanece predicado técnico que aprovação de risco não pode substituir.
- **Positive:** reviewer ainda fornece contexto de qualidade para retry/replan.
- **Positive:** signal e HITL existentes são reutilizados sem novo agregador ou pausa.
- **Positive:** crash/replay tem regras explícitas e auditáveis por attempt.
- **Negative:** resultados negativos percorrem revalidation/review antes de pausar, consumindo tempo
  adicional de review de propósito.
- **Negative:** state v4 é incompatível com runtimes anteriores e exige rollout coordenado.
- **Neutral / to monitor:** `inconclusive` recebe o mesmo mínimo de risco e bloqueio que drift
  confirmado, embora represente incerteza e não mismatch provado.

## Risks

| Risco | Mitigação |
|---|---|
| Aprovação virar waiver implícito | Predicado `aligned` separado e validação contextual que rejeita `approved`. |
| Reviewer não rodar em caminho negativo | Transições e testes e2e obrigam `REVALIDATING -> REVIEWING`. |
| Crash duplicar signal ou reaplicar evidência | Operation ID/fingerprint idempotentes e bindings completos. |
| Artifact parcial ser tratado como conclusão | Integridade obrigatória; parcial/divergente bloqueia. |
| Resultado de attempt anterior contaminar retry | Registro e operation ID incluem attempt; reutilização cruzada proibida. |
| Signal histórico impedir retry já alinhado | Bloqueio técnico consulta apenas driftCheck íntegro do attempt atual. |
| Crash deixar artifact parcial autoritativo | Publicação atômica antes do state; órfão não tem autoridade; corrupção referenciada falha terminalmente. |
| Mudança de parser/limite reutilizar resultado antigo | detectorBundleHash cobre toda semântica capaz de alterar resultado. |
| Nova fase ser confundida com gate catalogado | Documentação e API internas distinguem fase built-in de gate do catálogo. |

## Edge cases

- Crash antes do artifact, depois do artifact, depois do state e antes do signal.
- Resultado íntegro com signal ausente; signal existente com artifact ausente.
- Mesmo diff em attempts diferentes ou mesmo attempt com `contractHash` divergente.
- Attempt anterior confirmed, retry e attempt atual aligned sob assessment ainda restricted.
- `confirmed` e assertion inconclusiva coexistem no mesmo detector.
- Reviewer produz finding adicional e eleva assessment já `restricted`.
- Decision file `approved`, rejeição repetida idêntica, decisão contraditória ou request stale.
- State v3 lido para diagnóstico versus tentativa de resume mutável por runtime v4.
- Revalidation detecta mudança factual depois do resultado de drift.

## Acceptance Criteria

1. `CHECKING_DRIFT` é estado persistido entre `GATING` e `REVALIDATING`, com operação read-only e
   idempotente.
2. Resultado por attempt no state v4 possui todos os bindings, detectorBundleHash e artifact íntegro;
   ausência não passa.
3. `confirmed`/`inconclusive` produzem signal `restricted`, mas somente `aligned` passa acceptance.
4. Reviewer roda nos três status e o checkpoint HITL pós-review existente é o único usado.
5. `approved` com drift não resolvido no attempt atual é inválido; signal histórico não bloqueia
   attempt aligned; rejeição exige retry, replan ou abort.
6. Recovery cobre publicação atômica, órfão sem autoridade, falha terminal por corrupção
   referenciada, reuso exato, recálculo ausente e reconciliação de signal, sem reuso entre attempts.
7. ADR 022 continua governando agregação, bindings e HITL; ADR 024 governa o contrato analisável.

## Trade-offs

Aceitamos executar reviewer mesmo quando acceptance já não pode passar, porque seu diagnóstico
melhora a escolha humana entre corrigir código e replanejar o contrato. Em troca de não duplicar
HITL, o decision file existente ganha uma restrição contextual: `approved` nem sempre é uma decisão
válida. Um novo ADR será necessário se surgir waiver, aprovação externa, execução paralela de
detectores ou mudança que permita pular review; nenhuma dessas evoluções está autorizada aqui.
