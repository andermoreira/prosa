---
title: Runbook — pipeline automática de prosa
status: active
phase: 2
entrypoints:
  - scripts/workflow/validate-spec.sh
  - scripts/workflow/run-spec.sh
  - scripts/workflow/resume-spec.sh
---
# Runbook — pipeline automática de prosa

Procedimento operacional para executar uma spec aprovada. O contrato, os estados e a trust boundary
estão em [automated-spec-pipeline.md](automated-spec-pipeline.md); aqui está **o que digitar, o que
esperar e o que fazer em seguida**.

Todo comando e toda saída deste runbook foram executados em 2026-07-17 sobre `31a4c8c` e
revalidados sobre `4bb3415`, com `opencode 1.17.20` e os três papéis em `opencode-go/grok-4.5`.
O que **não** foi exercitado está marcado como tal — não presuma que funciona.

Os checkpoints de risco e HITL foram adicionados depois dessa evidência de campo. Seu contrato é
coberto por testes automatizados, mas a evidência manual de rollout pertence a um passo posterior;
este runbook não os apresenta como validados em produção.

**Provado em campo (2026-07-17, `4bb3415`):**
- Ciclo completo com trabalho real: executor criou arquivo, diff coletado, gate passou, reviewer aprovou, acceptance `ok: true` → `AWAITING_COMMIT`.
- Steps sem mudanças (spec já implementada): o `resume` reconcilia automaticamente para `COMMITTED` sem exigir commit humano.
- Gate `ENOTEMPTY` no macOS resolvido com retry + best-effort no cleanup do sandbox.

> **O fluxo padrão não commita sozinho.** Ele para, espera **você** commitar no worktree, e o
> `resume` reconcilia dali. `COMMIT_AWAITING_HUMAN` é o handoff previsto, **não um erro**.

---

## 0. Pré-condições

| Requisito | Como conferir |
|---|---|
| `opencode` ≥ 1.1.1 | `opencode --version` |
| Node ≥ 22.5 | `node --version` |
| SRT pinado | `npm ls @anthropic-ai/sandbox-runtime` mostra somente `0.0.66` |
| Backend macOS | `/usr/bin/sandbox-exec -h` responde e `node --test scripts/workflow/test-sandbox-runtime-macos.cjs` passa |
| Auth OpenCode Go | `OPENCODE_API_KEY` disponível no ambiente; o sandbox não reabre o arquivo real de auth |
| Árvore principal limpa | `git status --porcelain` vazio — `git.cjs:115` bloqueia com `GIT_PREFLIGHT_DIRTY` |
| Sem worktree residual | `git worktree list` mostra só o principal |
| Sem runtime residual | `ls .workflow-runtime` não existe (senão veja a §6) |
| **Modelo fora de limite** | ver abaixo — é a armadilha mais cara |

**O modelo em limite não devolve erro.** O OpenCode reintenta em silêncio e o processo fica parado
até o timeout, com `stdoutBytes: 0`. Isso consumiu 22 e 29 minutos em dois runs desta auditoria, e
foi diagnosticado como "o agente está deliberando". Confira antes:

```bash
opencode run --model "$(grep -m1 'model:' workflow/resources.yaml | awk '{print $2}')" "say ok"
```

Cada agente declara seu modelo em `workflow/resources.yaml` (`executor`, `reviewer`,
`diagnostician`). Um agente sem `model` falha fechado em vez de rodar num default que ninguém
declarou.

Cada resource de agente também declara `sandbox`. Reviewer e diagnostician têm somente os
endpoints exatos do provider; executor acrescenta os destinos aprovados de npm/GitHub. Endpoint
novo deve ser adicionado ao resource e revisado, nunca liberado por wildcard. A policy bloqueia
Unix sockets, local binding, Apple Events e modos fracos. Gates e MCP não estão cobertos por ela.
O HOME real permanece inacessível; tokens relacionados ao provider entram somente pelas variáveis
catalogadas (`OPENCODE_API_KEY` ou `CURSOR_API_KEY`).

Em executor sobre linked worktree, a application persiste `policyVersion: "2"` e
`git.mode: private-ephemeral-v1`. O gitdir privado vive somente em `.workflow-sandbox/git`, usa
config/index próprios e lê objects compartilhados via alternate read-only; o cleanup remove o
scratch em qualquer saída.

---

## 1. Validar (leitura pura)

```bash
./scripts/workflow/validate-spec.sh specs/<feature>.md
```

Valida frontmatter, schemas, DAG, provenance e catálogos. Não pega lock, não cria runtime, não pede
`--base-sha`. Espere `"ok": true` e a lista de steps.

## 2. Dry-run (não toca em nada)

```bash
./scripts/workflow/run-spec.sh specs/<feature>.md --base-sha "$(git rev-parse HEAD)" --dry-run
```

Retorna antes do adapter, do preflight e do lock. Confirme que `.workflow-runtime` **não** foi
criado. Espere a ordem do DAG e o `hash`.

## 3. Executar

```bash
./scripts/workflow/run-spec.sh specs/<feature>.md --base-sha "$(git rev-parse HEAD)"
```

`--base-sha` **precisa ser o HEAD atual**: `git.cjs:135` exige que base aprovada, SHA e HEAD do
worktree principal sejam o mesmo commit, senão `GIT_BASE_MISMATCH`. O `baseSha` documentado na spec
é proveniência (NOTE-03); só o CLI autoriza mutação.

**Não passe `--allow-commit` nem `--create-pr`** — ambos são opt-in e nenhum dos dois foi exercitado
em campo.

Saída esperada com `execution.autoCommit: false` (o default):

```json
{ "ok": false, "awaitingHuman": true, "code": "COMMIT_AWAITING_HUMAN",
  "steps": [{ "status": "AWAITING_COMMIT",
              "acceptance": { "ok": true, "status": "accepted" } }] }
```

`ok: false` aqui **não é falha**. É a parada por desenho, com o acceptance aprovado.

### Se o run aguardar aprovação de risco

Todos os steps são classificados antes da execução pela policy do `baseSha`. Step v1 é aceito para
compatibilidade, mas sempre recebe `restricted` e o sinal
`legacy-step-without-change-type`. Step v2 exige `changeType`; ausência ou valor fora da policy
bloqueia, sem fallback. Em run misto, cada step conserva seu contrato e sua classificação.

Espere uma saída semelhante a:

```json
{
  "ok": false,
  "awaitingApproval": true,
  "code": "RISK_APPROVAL_REQUIRED",
  "approval": {
    "id": "approval-...",
    "checkpoint": "pre-execution",
    "contextArtifactRef": "artifact-..."
  }
}
```

Isso é espera humana, não falha retryable. Leia no `state.json` o assessment, as regras de área e os
sinais; localize pelo `contextArtifactRef` o artifact sanitizado antes de decidir. O contexto
pós-review inclui o diff e o review vinculados. Finding `high` continua bloqueando tecnicamente,
mesmo que também eleve o risco para `restricted`.

Crie a decisão com o `requestId` atual. O arquivo deve ser regular, sem symlink e com permissão
`0600`:

```json
{
  "schemaVersion": "1.0.0",
  "requestId": "approval-...",
  "outcome": "approved",
  "actor": "local-user",
  "justification": "Risco e contexto revisados",
  "nextAction": null
}
```

```bash
chmod 600 decision.json
./scripts/workflow/resume-spec.sh specs/<feature>.md \
  --base-sha "$(git rev-parse HEAD)" \
  --decision-file decision.json
```

Para evitar arquivo temporário, `--decision-file -` lê JSON do stdin de forma não interativa. Não
passe justificativa em argv. A decisão é single-use e vinculada ao request, policy, assessment e
entradas; no checkpoint pós-review também é vinculada ao attempt, diff e review. Mudança em qualquer
binding torna a decisão stale e exige novo request.

Uma aprovação `restricted` antes da execução não encerra o HITL: após o review local haverá nova
pausa `post-review` para aprovar os bytes exatos. Nenhuma decisão de risco autoriza commit ou PR;
continue usando as autorizações Git próprias do fluxo.

Para rejeitar, use `outcome: "rejected"` e uma única ação:

| `nextAction` | Resultado |
|---|---|
| `retry` | Descarta o attempt não commitado e inicia outro dentro do budget; risco não diminui. |
| `replan` | Cancela o run e exige revisão da spec/step antes de um novo run. |
| `abort` | Cancela o run sem nova tentativa. |

O campo `actor` identifica declarativamente o usuário local; não é identidade forte nem prova de
não repúdio. Outro processo sob a mesma conta permanece um risco residual aceito.

### Ajustar a policy de risco

Edite `workflow/risk-policy.yaml` somente como mudança versionada e revisada. Preserve a escala
canônica, a regra v1 → `restricted`, todos os `changeTypes` obrigatórios, prefixos de área não
ambíguos e limites compatíveis com os schemas. Regras de área e sinais podem elevar o nível, nunca
reduzi-lo durante um run.

Valide a mudança com `npm run test:workflow` e `./scripts/verify.sh` antes de aprovar o novo
`baseSha`. Um run já iniciado permanece vinculado ao hash anterior: não edite a policy para liberar
uma pausa nem tente retomar após drift. Preserve o runtime para inspeção e inicie outro run sobre a
nova base aprovada.

## 4. Conferir o trabalho antes de commitar

```bash
git worktree list                      # o worktree do attempt, em detached HEAD no base
R=.workflow-runtime/runs/<runId>
python3 -m json.tool $R/artifacts/<stepId>/attempt-1/review.json
ls $R/artifacts/<stepId>/attempt-1/
```

Vale ler o `review.json`: `decision`, `summary` e `findings`. Um summary que cita o diff e os ACs
concretos é sinal de que o reviewer leu o snapshot; um genérico é sinal de que não.

Confira também a policy aplicada:

```bash
python3 -m json.tool $R/state.json
# procure steps[].sandbox.applications[] e attempts[].sandboxPolicyHash
```

Cada aplicação registra papel, resource, engine/backend, paths canônicos, allowlist, sockets vazios
e hash. O registro não contém valores de credenciais.

## 5. Commitar o handoff e retomar

O arquivo já vem **staged** pelo acceptance — a árvore precisa casar ao byte com a intenção
persistida.

```bash
W=$(git worktree list --porcelain | grep '^worktree' | grep workflow-runtime | cut -d' ' -f2)
git -C "$W" status --porcelain        # confira o que está staged
git -C "$W" commit -m "<mensagem>"
```

O `resume` **não aceita qualquer commit**. `reconcileStep` compara o seu commit com
`accepted-tree*.json` em cinco campos — `parentSha`, `acceptedTreeSha`, `acceptedPaths`,
`attemptId`, `worktreeId` — e recusa o que não bate. Confira antes:

```bash
python3 -m json.tool $R/artifacts/<stepId>/attempt-1/accepted-tree*.json
git -C "$W" rev-parse HEAD^{tree}     # deve ser igual a acceptedTreeSha
git -C "$W" rev-parse HEAD~1          # deve ser igual a parentSha
```

**Se o step não produziu mudanças** (spec já implementada, diff vazio), o `resume`
reconcilia automaticamente sem exigir commit — `reconcileStep` detecta o worktree limpo,
transita o step para `COMMITTED` e avança para o próximo. Nenhum commit humano é necessário
nesse caso.

Depois:

```bash
./scripts/workflow/resume-spec.sh specs/<feature>.md --base-sha "$(git rev-parse HEAD)"
```

Isto faz reconcile → gates globais → review global → acceptance global → relatórios. Espere:

```json
{ "ok": true, "status": "SUCCEEDED",
  "steps": [{ "status": "COMMITTED", "commit": { "status": "reconciled" } }] }
```

`main` permanece intacta o tempo todo: o commit vive no worktree, não em nenhuma branch.

## 6. Limpeza

O pipeline remove o próprio worktree no `cleanupStep`. Sobra o runtime:

```bash
chmod -R u+w .workflow-runtime        # o snapshot fechado é 0400; sem isto o rm falha
rm -rf .workflow-runtime
```

O commit do handoff fica dangling — fora de qualquer branch, sai no próximo `gc`. Se quiser
integrá-lo, faça `git cherry-pick <sha>` **antes** de limpar.

---

## Troubleshooting

Do documento de referência, mais o que apareceu em campo:

| Código | O que fazer |
|---|---|
| `COMMIT_AWAITING_HUMAN` | **Não é erro.** É a §5 deste runbook |
| `GIT_PREFLIGHT_DIRTY` | limpe a árvore principal sem descartar trabalho não relacionado |
| `GIT_BASE_MISMATCH` | `--base-sha` não é o HEAD atual |
| `LOCK_CONCURRENT` | aguarde o owner; não remova lock por timeout. Órfão: `--remove-orphan-lock` |
| `REVALIDATION_DRIFT` | algo mudou sob o run; restaure e use `resume` |
| `RISK_APPROVAL_REQUIRED` | leia o artifact sanitizado do request, decida e use `resume --decision-file <path|->`; não trate como retry técnico |
| `RISK_POLICY_INVALID` | confira sintaxe, taxonomia, áreas e limites em `workflow/risk-policy.yaml` no `baseSha`; não use default local |
| `RISK_POLICY_TRUST_INVALID` | a policy não veio exatamente do `baseSha` aprovado; descarte a divergência ou inicie run com a base correta |
| `RISK_STEP_VERSION_INVALID` | o step não usa `1.0.0` nem `2.0.0`; corrija o contrato antes de executar |
| `RISK_CHANGE_TYPE_UNKNOWN` | step v2 está sem `changeType` ou usa valor ausente da policy; escolha um tipo válido, sem rebaixar para v1 |
| `RISK_SIGNAL_INVALID` / `RISK_SIGNAL_LIMIT` | o produtor emitiu sinal malformado ou acima dos limites; corrija a origem e não ignore a elevação |
| `RISK_SIGNAL_FINGERPRINT_INVALID` / `RISK_SIGNAL_FINGERPRINT_CONFLICT` | o conteúdo não corresponde ao fingerprint ou colide; trate como adulteração e não retome |
| `HITL_DECISION_FILE_INVALID` | use arquivo regular, não diretório ou symlink, ou passe `--decision-file -` |
| `HITL_DECISION_FILE_PERMISSIONS` | restrinja o arquivo com `chmod 600 decision.json` |
| `HITL_DECISION_EMPTY` / `HITL_DECISION_JSON_INVALID` / `HITL_DECISION_TOO_LARGE` | forneça JSON fechado, não vazio e dentro do limite, pelo arquivo ou stdin |
| `HITL_REQUEST_MISMATCH` | a decisão aponta para outro request; copie o ID pendente do state/saída atual |
| `HITL_DECISION_STALE` | policy, assessment, attempt, diff ou review mudou; leia o novo contexto e responda ao novo request |
| `HITL_DECISION_CONFLICT` / `HITL_DECISION_ALREADY_CONSUMED` | não substitua nem reutilize uma decisão; inspecione o histórico e use o request pendente |
| `STATE_RISK_VERSION_REQUIRED` | state anterior ao risco/HITL v3 não é migrável; preserve para inspeção e inicie novo run |
| `RESUME_RECONCILIATION_REQUIRED` | inspecione state/artifacts; **não repita chamada nem commit** |
| `BUDGET_EXCEEDED` | a reserva é feita antes da chamada. Uma chamada que falhou **consome** budget — é o que impede retry infinito |
| `OPENCODE_MODEL_REQUIRED` | o agente não declara `model` em `resources.yaml` |
| `SANDBOX_RUNTIME_UNAVAILABLE` | rode `npm ci --ignore-scripts`, confirme macOS e `sandbox-exec`; não execute o agente por fora |
| `SANDBOX_INITIALIZATION_FAILED` | revise policy, paths reais e pré-requisitos; o agente não iniciou |
| `SANDBOX_DEGRADED` | runtime tentou operar sem a proteção exigida; não habilite modo fraco |
| `SANDBOX_POLICY_DRIFT` | resource/runtime/path/rede divergiu do state; revise e comece novo run |
| `SANDBOX_VIOLATION` | leia stderr/artifact sanitizado; ajuste somente a menor regra legítima no resource |
| `SANDBOX_CLEANUP_FAILED` | o pipeline grava `.workflow-runtime/sandbox-poison.json` e bloqueia; veja **Sandbox poisoned** abaixo antes de retomar |
| `SANDBOX_POISONED` | há um marcador de cleanup falho; verifique o host e remova o marcador à mão (**Sandbox poisoned**) |
| `STATE_SANDBOX_VERSION_REQUIRED` | state anterior ao sandbox não pode ser retomado; cancele-o e inicie novo run |
| Processo parado, `stdoutBytes: 0` | modelo em limite. Veja a §0 — não é o agente pensando |

### Sandbox poisoned

Quando o cleanup do sandbox não é comprovado (`SANDBOX_CLEANUP_FAILED`), o SRT pode deixar estado
vivo no host — proxy ativo, perfil `sandbox-exec` carregado — que um processo novo não enxerga. Para
que o bloqueio sobreviva ao término do processo, a prosa grava um marcador em
`.workflow-runtime/sandbox-poison.json`. Enquanto ele existir, `run`, `resume` e `review` falham com
`SANDBOX_POISONED` antes de adquirir lock ou spawnar qualquer agente.

O marcador **não** é removido automaticamente: a liberação exige verificação humana do host.

```bash
# 1. Leia a causa registrada (sanitizada, sem segredos).
cat .workflow-runtime/sandbox-poison.json

# 2. Prove que nenhum processo do sandbox permanece vivo.
pgrep -fl 'sandbox-runtime|sandbox-exec' || echo 'nenhum processo remanescente'

# 3. Confirme que não há proxy do SRT preso escutando.
#    (o proxy do sandbox usa porta local efêmera; encerre qualquer resíduo)
ps aux | grep -i 'sandbox' | grep -v grep

# 4. Só depois de o host estar limpo, remova o marcador à mão e retome.
rm .workflow-runtime/sandbox-poison.json
scripts/workflow/resume-spec.sh <spec> --base-sha <sha>
```

Se qualquer passo revelar processo ou proxy vivo, encerre-o antes de remover o marcador. Remover o
marcador sem a verificação é o risco residual aceito do escopo single-user — o custo é seu.

### Upgrade do SRT

`@anthropic-ai/sandbox-runtime` é research preview e está pinado em `0.0.66`. Um bump exige PR
explícito com diff de manifest/lock, `npm audit --audit-level=high`, revisão de API/config e repetição
de `test-sandbox.cjs`, `test-sandbox-runtime-macos.cjs` e do benchmark opcional:

```bash
RUN_SANDBOX_BENCHMARK=1 node --test scripts/workflow/test-sandbox-runtime-macos.cjs
```

Não use atualização automática nem retome state criado por outra versão.

---

## O que este runbook não cobre

Não exercitado em campo, portanto não documentado como funcional:

- `--allow-commit` (commit automático) e `--create-pr`
- o caminho de falha: executor que erra, retry, diagnostician
- specs com mais de um step em execução real
- backend Linux/Windows e sandbox de gates, MCP, Git ou notificações

Ver o relatório de auditoria em [`docs/audits/`](../audits/) para os 8 achados abertos.
