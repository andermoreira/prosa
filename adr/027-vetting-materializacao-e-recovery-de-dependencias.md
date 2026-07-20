# ADR 027 — Vetting, materialização e recovery de dependências

**Status:** Accepted
**Data:** 2026-07-19
**Spec:** [Vetting de dependências no pipeline prosa](../specs/prosa-dependency-vetting.md)
**Related:** [ADR 022 — Política de risco e HITL da prosa](022-politica-de-risco-e-hitl-da-prosa.md),
[ADR 025 — Fase recuperável de detecção de drift](025-fase-recuperavel-de-deteccao-de-drift.md) e
[ADR 026 — Broker confiável e policy de dependências](026-broker-confiavel-e-policy-de-dependencias.md)

## Context

O ADR 022 separa sinais, aprovação humana e predicados técnicos. O ADR 025 define publicação
artifact-before-state, binding por attempt e recovery fail-closed para drift. Dependências exigem uma
ordem diferente do fluxo atual: o risco precisa ser conhecido antes do checkpoint pre-execution, mas
manifest/lock e instalação só podem chegar ao worktree depois da decisão.

Executar vetting apenas depois do agente deixa o candidate inseguro influenciar o processo. Instalar
antes da aprovação cria efeito desnecessário. Por outro lado, recomeçar sem regras de freshness pode
reusar audit, policy ou candidate antigos. A solução precisa preservar o único HITL já existente e
distinguir hard technical blocks de signals revisáveis.

## Problem

Como ordenar planejamento/vetting, aprovação e materialização; classificar falhas e sinais; persistir
state v5; e retomar após crash sem executar scripts, repetir efeitos ambíguos ou criar uma segunda
pausa/state machine?

## Assumptions

- O broker e ownership do ADR 026 estarão disponíveis.
- `recordRiskSignals`, pre/post-review HITL e decision file do ADR 022 continuam como única
  governança humana.
- Step v4/state v5 são sequenciais aos contratos v3/v4 aceitos nos ADRs 024/025.
- Node/npm/config e thresholds/freshness serão pinados após protótipo.
- Artifact store e lock do runtime suportam publicação atômica e refs hasheadas.

## Alternatives Considered

### A. Vetar e instalar depois do agente, como gate de diff

- **Prós:** menor alteração da ordem atual.
- **Contras:** agente e gates já operaram sobre intenção não vetada; lock adulterado pode ser usado
  antes do bloqueio e não há candidate prévio para a aprovação.

### B. Instalar antes de qualquer decisão e pedir aprovação depois

- **Prós:** contexto inclui instalação real imediatamente.
- **Contras:** produz efeito/rede/download antes do consentimento e expande recovery de operação que
  pode ser rejeitada.

### C. Criar state machine e decision file específicos do broker

- **Prós:** estados especializados e UX independente.
- **Contras:** duplica bindings, decisões, recovery e pode contradizer assessment/HITL existentes.

### D. Uma fase única que veta e materializa em worktree antes da pausa

- **Prós:** implementação linear.
- **Contras:** exige criar attempt/worktree e instalar antes de approval; mistura operação read-only
  com efeito local e dificulta descarte/replay.

### E. Duas fases: plan/vet em scratch, HITL existente, materialização no attempt

- **Prós:** decisão vê candidate exato antes do efeito, hard block termina cedo, instalação fica
  vinculada ao attempt e recovery separa cálculo de materialização.
- **Contras:** exige state v5, freshness/reaudit e reconciliação entre artifacts de duas fases.

## Decision

Adotar a alternativa **E**:

1. `planAndVet` roda em scratch depois de lock/open e parent SHA efetivo, antes do checkpoint,
   attempt/worktree/agente. Antes de **qualquer** npm, inclusive baseline, valida raw parent
   manifest/lock e requests exatos por leitura symlink/TOCTOU-safe, bloqueando source/spec/host/
   redirect/path/link/workspace/bundled/config proibido. Busca metadata mínima, gera candidate,
   revalida raw manifest/lock/graph/sources completos, deriva todos os hashes e só então decide fast
   path e busca detalhes/downloads apenas para closures unmatched.
2. Depois de resultado/signal persistidos e decisão válida quando exigida, o pipeline cria
   attempt/worktree, materializa os bytes candidate exatos, executa
   `npm ci --ignore-scripts --audit=false`, verifica artifact integrity, executa exatamente
   `npm audit signatures --json --include-attestations` (sintaxe condicionada ao protótipo pinado),
   aplica read-only seal e só então libera qualquer processo
   não-broker.
3. Nenhum lifecycle script roda. Nó novo/alterado com lifecycle proibido pela policy v1, ou que
   dependa de install/postinstall, é hard block e exige replan.
4. Candidate generation usa target direct exato e npm pinado com
   `--package-lock-only --ignore-scripts --audit=false`; audit usa
    `npm audit --package-lock-only --json --audit-level=high`. Report e exit são classificados
    separadamente. “Versionado” significa validator/fixture interno preso à versão+distribution digest
    do npm, não schema version declarado pelo payload. Audit exige consistência com candidate graph/
    payload local, omit/include/counts e comando/exit completos; não se atribui ao registry confirmação
    node-a-node. `invalid[]`/`missing[]` são confrontados com o graph; signature positiva depende do
    comando/exit/implementation digest pinado, e somente attestations `verified[]` oferecem cobertura
    positiva observável por package/location.
5. Package/version inexistente exige nome/encoding canônicos, packument bem-sucedido e versão exata
   ausente; 404 isolado é inconclusive. Input/source inválido, integrity inválida/
   divergente, provenance criptograficamente inválida, candidate lock failure, non-registry source,
   audit indisponível/incompleto, advisory high/critical, lifecycle proibido, toolchain/config drift
   e ownership violation são technical blocks. `blocked` e `inconclusive` não são sobrescrevíveis
   por HITL.
6. Provenance ausente e heurísticas versionadas são signals. Falha isolada da downloads API gera
   `restricted` somente para closure unmatched; closure preapproved pula downloads/detail, portanto
   sua indisponibilidade não a restringe. Pacote unlisted e tecnicamente limpo gera no mínimo
   `approval_required`; heurística elevada gera `restricted`. Preapproved exige root direct exato e
   `canonicalClosureHash` exato, pulando heurística detalhada, não checks técnicos. Status global é o
   máximo de roots, nós e predicados.
7. Reutilizar exclusivamente `recordRiskSignals`, assessment, requests, decisions e checkpoints do
   ADR 022. Não criar pausa, decision file, waiver ou state machine paralela. Restricted continua
   exigindo post-review ligado ao diff final.
8. Evoluir para state v5, incorporando state v4 do ADR 025. O step mantém
   `dependencyVetting`; o attempt mantém `dependencyMaterialization`. Ambos registram
   `candidateGraphHash`, closure hashes, `resolutionSnapshotHash`, node classification hash,
    integrity statuses, `effectiveConfigHash`, toolchain distribution digest, signature/provenance,
    artifacts e timestamps. Completion inclui `operationId`, vetting result ref+hash inclusive no
    baseline, policy/contract/
    toolchain hashes, todos os closure/classification/removal hashes, request+consumed decision refs+
    hashes ou marker no-approval, freshness/audit/signature/provenance/attestation refs+hashes e
    worktree identity. Metadata detalhada fica em artifact restricted minimizado.
    Sem `dependencyChanges`, `dependencyContractHash` deriva do contrato baseline canônico com
    mode/schema/manifest path/lock path/tree hash; valor vazio ou marker implícito é inválido.
9. `candidateGraphHash`/`nodeIdentityHash` cobrem location, name/version, source/resolved host,
   integrity, flags dev/optional/peer/link, current-platform constraints e resolved edges; persistir
   também hashes new/changed/grandfathered. Candidate manifest/lock/graph/resolution snapshot
   persistidos são autoridade; mesmos inputs locais não prometem a mesma resolução futura.
10. Approval e replay vinculam policy, dependency contract, parent, toolchain distribution/config,
    candidate manifest/lock/graph, add/update closure e removal `removedClosureHash`, resolution
    snapshot, audit/provenance/integrity e classification fingerprints. Candidate ausente e
    re-resolvido diferente cria request novo; não há equivalência inferida apenas dos inputs locais.
11. Publicar artifacts atomicamente antes do state. Scratch/temporário/artifact órfão sem state não
    tem autoridade e pode ser recalculado. State que referencia artifact ausente/inválido é corrupção
    terminal, não crash comum.
12. Completion record só é persistido depois de npm ci, artifact integrity/signature checks e seal.
    Se estiver ausente/inválido, descartar todo attempt/`node_modules` e recriar clean worktree; é
    proibido inferir completude por hash-tree. Nenhum processo não-broker inicia sem prova completa.
13. Sob lock, revalidar bindings/freshness e, antes do efeito, persistir atomicamente authorization
    transition vinculada ao `operationId` e à decisão consumida. Crash pós-consumo/pré-completion
    descarta attempt. A mesma decisão pode apenas terminar/recriar essa mesma operação idempotente sob
    bindings fresh; nunca autoriza outro candidate, parent, worktree lógico ou operation. Drift exige
    request novo; crash isolado não exige approval humano duplicado.
14. Conferir ownership/seal antes e depois de agente, cada gate local/global e qualquer subprocesso,
    além de antes de review, acceptance e commit. Sandbox read-only durante o processo é obrigatório;
    check posterior não o substitui.
15. Novo parent, policy, contract, toolchain/config/digest, candidate ou audit semântico invalida
    reuso. Resultado inconclusive por indisponibilidade classificada pode receber retry técnico no
    budget; hard block conclusivo exige replan/abort.
16. Separar `integrityMetadataConsistent` no plan de `artifactIntegrityVerified` após install e exigir
    SRI SHA-512 ou algoritmo centralmente aprovado igual/mais forte em todo artifact, inclusive
    baseline. SHA-1/ausência/unsupported bloqueia; exceção futura requer ADR.
    Quando signing keys são anunciadas, registry signature ausente/inválida bloqueia. Provenance
    ausente é signal; presente inválida bloqueia. Policy valida issuer, subject digest/name/version,
    source repo/commit, builder e freshness; provenance válida não prova benignidade. JSON inválido
    ou transporte falho no comando exato é inconclusive e impede completion.
17. Validar audit/signatures com validators internos pinados, sem error state e com as coberturas
    locais descritas no item 4. JSON sintaticamente válido com erro, campo ausente, validator mismatch,
    truncamento ou inconsistência é inconclusive; não alegar schema version remoto.
18. Usar `/versions/{encodedPackage}/last-week` para versão; a resposta é mapa de versões sem
    `start`/`end`, que são derivados/corroborados e rotulados pelo broker. Point/range e bulk são
    package-level; bulk<=128 e sem scoped aplicam-se somente ao endpoint package-level. Fallback tem
    reason code distinto, freshness diária e nunca representa target version popularity.
19. Toda remoção usa `removedClosureHash` canonicalizado do parent, registra root/closure no state e
    emite no mínimo `approval_required`, mesmo se o root era preapproved. Não existe candidate-root
    fast path para remove; candidate audit continua obrigatório e status global usa máximo com
    add/update.
20. Antes do seal, ler installed `package.json` de cada node new/changed e de **todos** os nodes do
    baseline, comparando com metadata exata do registry e lock onde representado. Hook grandfathered
    pode permanecer registrado, nunca executar; divergência e hook novo/alterado bloqueiam. Isso não
    constitui heuristic vetting/preapproval retroativo.
21. Todo worktree local de agent/gate e o worktree integrado global recebem completion próprio. Sem
    dependencyChanges, baseline usa parent manifest/lock, freshness/audit, npm ci, signatures e seal,
    sem heurística/HITL de mudança; advisory bloqueia. Completion local nunca prova o integrado.
22. Separar `candidateTrustAssessment` pré-HITL, baseado em metadata/bundles do candidate, da
    verificação pós-install sobre a árvore real. Verificar attestations `verified[]` por
    package/location; bundles retornados e validados ficam como artifacts restricted minimizados.
    Provenance distingue `absent|valid|invalid`. Trust Sigstore/TUF é
    preprovisionado, verificado, pinado e read-only, com hash/origem/freshness ligados à policy/
    toolchain. Se o npm não verificar offline com os hosts existentes, rollout bloqueia; ampliar rede
    exige ADR e policy change.
23. A ordem de rollout é coerciva: broker sandbox, executor sem generic process/provider leak,
    remoção de registry, safe Git e gate sandbox precisam estar provados antes de integrar esta fase
    ao orchestrator. Enablement de materialização/agente/gates é passo final explícito fail-closed.

## Consequences

- **Positive:** decisão humana ocorre sobre candidate graph exato, antes de instalação/agente.
- **Positive:** hard blocks permanecem predicados técnicos separados de signals.
- **Positive:** recovery distingue operação recalculável em scratch de efeito materializado por
  attempt.
- **Positive:** state resume por dependência sem expor metadata detalhada no documento principal.
- **Positive:** closure e graph identity impedem fast path após mudança transitive silenciosa.
- **Positive:** baseline e worktree integrado eliminam execução sem materialização comprovada.
- **Negative:** resume pode exigir reaudit e nova aprovação quando freshness ou conteúdo mudar.
- **Negative:** runs incompatíveis com state v5 não podem ser retomados por runtime anterior.
- **Negative:** checks repetidos de ownership, registry, audit e seal aumentam latência de propósito.
- **Neutral / to monitor:** ausência de provenance não bloqueia por si só na v1, mas nunca é tratada
  como evidência positiva.

## Risks

| Risco | Mitigação |
|---|---|
| Approval autorizar audit/candidate antigo | Bindings completos, freshness e reaudit antes de novo efeito. |
| Crash repetir instalação ambígua | Sem completion válido, descarte integral do attempt; sem inferência da árvore. |
| Artifact órfão virar autoridade | Publicação antes do state não basta: somente ref íntegra no state autoriza reuso. |
| Reaudit invalidar tudo por timestamp | Hash semântico exclui `checkedAt`; mudança factual continua invalidando. |
| Signal ser confundido com hard block | Status/reason codes separados e acceptance técnica explícita. |
| Gate adulterar lock | Sandbox read-only durante o gate e guards antes/depois, com interrupção imediata. |
| Lifecycle executar durante qualquer fase | `--ignore-scripts` em ambos os comandos e teste canário sem execução. |
| Metadata detalhada vazar ou virar prompt | Artifact restricted/minimizado e conteúdo remoto tratado somente como dado. |
| Candidate re-resolvido ser tratado como equivalente | Bytes/graph/snapshot persistidos são autoridade e divergência cria request novo. |
| Longo HITL consumir decisão stale | Recheck sob lock e authorization transition atômica antes do efeito. |
| JSON válido esconder report parcial/erro | Schema e consistência semântica/graph/exit completas, fail inconclusive. |
| Remove usar fast path do root antigo | `removedClosureHash` do parent e approval mínimo obrigatório. |
| Tarball instalado divergir em lifecycle | Comparação installed package.json antes do seal e descarte integral. |
| Crash pós-consumo causar approval duplicado ou ampliar decisão | Replay só recria a mesma operation fresh; drift exige novo request, crash isolado não. |
| Trust de attestation exigir host dinâmico | Trust Sigstore/TUF offline pinado; rollout bloqueia, sem ampliar rede implicitamente. |
| Fast path depender da downloads API | Match só ocorre após full candidate/hash; closure matched não consulta downloads/detail. |

## Edge cases

- Packument bem-sucedido sem versão versus 404 isolado/timeout/5xx/JSON incompleto.
- Preapproved root com closure alterada por transitive/edge, advisory ou lifecycle.
- Signing keys anunciadas com signature ausente/inválida; provenance ausente/presente inválida.
- Audit muda entre request e resume sem candidate mudar.
- Crash entre artifact/state/signal/request/decision.
- Crash depois de escrever manifest, durante npm ci ou depois de npm ci antes do completion state.
- Crash após authorization/consumo e antes do efeito/completion; mesma operation versus novo parent,
  candidate, worktree lógico ou operationId.
- Retry com candidate idêntico, mas novo attempt; novo parent com mesmo manifest bytes.
- Agent preserva manifest/lock, mas gate os reescreve.
- State aponta para artifact corrompido; artifact completo existe sem state.
- `node_modules` parcial com candidate hashes corretos, mas sem installation proof.
- Restricted aprovado pre-execution e diff final diferente, exigindo checkpoint pós-review normal.
- Runtime approval tenta promover pacote a preapproved.
- Candidate ausente no resume e re-resolution produz graph/snapshot diferente.
- TTL expira durante espera HITL e remote check muda classification fingerprint.
- `node_modules` parece completo, mas completion record não existe.
- Audit/signatures JSON válido contém error, validator mismatch, campo/count/payload local/omit/
  include/exit inconsistente.
- Downloads bulk com 129 packages/scoped, encoding errado ou package fallback rotulado como versão.
- Version endpoint retorna mapa sem `start`/`end`; broker deriva janela e não aplica bulk rule a ele.
- Remove de root preapproved continua exigindo approval e persiste parent closure.
- Installed lifecycle difere da metadata vetada antes do seal.
- Step sem dependencyChanges e worktree integrado global precisam de completions independentes.
- Baseline com hook grandfathered idêntico versus divergência/new hook; nenhum hook executa.
- SHA-1/sem SRI no baseline e trust Sigstore/TUF offline stale/ausente.

## Acceptance Criteria

1. `planAndVet` sempre antecede HITL, attempt/worktree e agente; materialização sempre sucede decisão
   válida quando exigida.
2. Candidate generation/audit/install usam flags/config/toolchain fechadas, audit JSON/exit separado,
   omit/include fixos e zero lifecycle.
3. Hard technical blocks e `inconclusive` nunca são sobrescritos por approval; signals usam somente o
   agregador existente.
4. Root+closure preapproved inalterado usa fast path; closure alterada escala; unlisted clean fica
   `approval_required` e downloads/heurística solicitada para closure unmatched e indisponível fica
   `restricted`.
5. Graph/node/closure/removal/resolution/classification hashes e config/toolchain/integrity/signature/
   provenance status integram state v5, approvals e completion autocontido com refs+hashes.
6. Candidate persistido é autoridade; re-resolution divergente cria candidate/request novo.
7. Decision consumption persiste authorization atômica por operation antes do efeito; crash descarta
   attempt e a mesma decisão só recria/conclui essa operation fresh, sem approval duplicado pelo crash.
8. Completion ausente/inválido descarta attempt/`node_modules`; teste cobre crash pós-npm-ci pré-state.
9. Registry signature e provenance são separados, com trust fields e sem alegação de benignidade.
10. Ownership/sandbox protegem todo subprocesso; lock/materialização inseguros não chegam a
    agente/gates/reviewer.
11. Not found exige packument bem-sucedido e versão ausente; 404 isolado não basta.
12. Nenhuma pausa, decision file ou state machine paralela é introduzida.
13. Reports usam validator/fixture presos ao npm digest; audit prova payload/grafo local, omit/include/
    counts/comando/exit. `missing[]`/`invalid[]` são confrontados com o graph; signature positiva é
    confiada ao comando/exit/digest e somente attestations `verified[]` têm cobertura positiva por
    package/location, sem alegar schema version remoto.
14. Version downloads usa `/versions/{encodedPackage}/last-week` com map; janela é derivada. Point/
    range/bulk são package-level, bulk<=128/no-scoped só ali, e fallback nunca mascara target version.
15. Remoção persiste `removedClosureHash`, exige approval mínimo e combina por máximo com add/update.
16. Installed lifecycle de todo node new/changed e todos os nodes baseline é comparado antes do seal;
    grandfathered hook idêntico não executa, divergência/new hook descarta sem vetting retroativo.
17. Todo worktree local/global possui completion próprio; baseline sem mudança não gera signal, mas
    advisory bloqueia.
18. Raw parent/baseline/request é validado symlink/TOCTOU-safe antes de npm; candidate completo é
    revalidado e hasheado antes do fast path, que pula detail/downloads somente para closure matched.
19. Todo artifact exige SRI SHA-512 ou stronger aprovado; SHA-1/ausência/unsupported bloqueia, sem
    exceção v1.
20. O comando normativo é exatamente `npm audit signatures --json --include-attestations`, sujeito ao
    protótipo pinado; bundles verificados são restricted/minimizados e provenance é absent/valid/invalid.
21. Trust Sigstore/TUF offline pinado/read-only integra policy/toolchain; necessidade de host extra
    bloqueia rollout e requer ADR/policy change.
22. Broker sandbox, executor no-process, registry removal, safe Git e gate sandbox são provados antes
    do enablement final fail-closed no orchestrator.

## Trade-offs

Aceitamos duas fases e checks repetidos para que aprovação anteceda efeitos e continue vinculada a
prova fresh. Também aceitamos falhar fechado quando o audit está indisponível e repetir consultas
antes de novo efeito, mesmo com custo de latência, porque “sem advisory conhecido” não equivale a
“audit concluído”. Também recusamos inferir `node_modules` completo ou candidate equivalente para
simplificar recovery. Um novo ADR será necessário para lifecycle scripts, waiver de technical block,
execução offline/cache autoritativo ou aprovação externa; tais mudanças não podem ser introduzidas
como simples ajuste de threshold.
