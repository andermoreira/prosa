---
title: Desenvolvendo com a prosa no OpenCode
status: active
phase: 2
commands:
  - /run-spec
  - /resume-spec
  - /review-spec
  - /espec
  - /check-analyze
  - /implement-step
  - /check-step
---

# Desenvolvendo com a prosa no OpenCode

Você leu o card do Jira. Sabe o que precisa ser feito. O que vem depois?

## 1. Escreva a spec

No OpenCode, use o spec-writer:

```
/espec
```

Descreva o que precisa ser implementado. O spec-writer produz `specs/<feature>.md` com goal, non-goals, acceptance criteria (AC-01, AC-02...), budgets, plano de implementação numerado e global gates esperados. Revise e aprove. A spec é o SSOT — tudo que vem depois deriva dela.

## 2. Gere os steps

Com a spec aprovada:

```
/check-analyze specs/<feature>.md
```

Isso valida a spec contra os schemas, deriva o DAG (ordem topológica das dependências) e gera `specs/steps/<feature>-step-N.md` — um por passo do plano. Cada step declara o contrato que o executor e o reviewer vão respeitar:

- **`predictedFiles`**: quais arquivos o step vai modificar (máximo 5)
- **`allowedAreas`**: quais diretórios o executor pode tocar
- **`verification.gateIds`**: gates que precisam passar (testes, lint, verify)
- **`acceptanceCriteria`**: quais ACs da spec este step cobre, com evidência exigida
- **`budgets`**: máximo de tentativas, agent calls, tempo e custo

### Escreva novos steps no schema v2

Todo step novo ou naturalmente alterado deve usar `schemaVersion: 2.0.0` e declarar um
`changeType` aceito por `workflow/risk-policy.yaml`:

```yaml
schemaVersion: 2.0.0
changeType: documentation
id: spec-example-step-1
```

O autor escolhe o tipo factual da mudança, não `autonomous`, `approval_required` ou `restricted`.
A policy deriva o nível base e pode elevá-lo pelas áreas declaradas em `predictedFiles` e
`allowedAreas`. Não escolha um tipo menos arriscado para evitar aprovação; mudança na taxonomia ou
nas regras de área deve ser feita na policy e revisada como mudança de policy.

| `changeType` | Nível base atual |
|---|---|
| `bugfix`, `test`, `vetted_dependency`, `documentation` | `autonomous` |
| `feature`, `api_contract`, `database_migration` | `approval_required` |
| `architecture`, `security`, `irreversible`, `infrastructure`, `permissions` | `restricted` |

Steps existentes em `schemaVersion: 1.0.0` continuam válidos para compatibilidade, sem
`changeType`, mas sempre rodam como `restricted` e registram
`legacy-step-without-change-type`. Isso é bootstrap conservador, não fallback. `behaviorType` em v1
serve apenas à convenção legada de commit e nunca reduz risco. Promova um step para v2 somente quando
ele for naturalmente editado; não faça migração em massa nem acrescente `changeType` a um documento
v1.

## 3. Rode a prosa

Em vez de implementar step por step manualmente, entregue para o pipeline:

```
/run-spec specs/<feature>.md --base-sha $(git rev-parse HEAD)
```

A prosa executa tudo sozinha. Para cada step:

| Fase | O que acontece |
|------|---------------|
| Lock | Adquire lock atômico exclusivo do repositório |
| Worktree | Cria worktree Git isolado, detached no base SHA |
| Executor | Invoca OpenCode/Cursor via sandbox de SO com contrato e policy deny-first do resource |
| Diff | Coleta `git diff --name-status`, conta arquivos lógicos (rename inequívoco = 1) |
| Scope | Bloqueia se > 5 arquivos, fora das áreas permitidas ou com symlink escapando |
| Risk | Classifica v1/v2 pela policy do base e agrega sinais sem permitir redução do nível |
| HITL | Pausa antes da execução e, em `restricted`, novamente após o review local |
| Gates | Roda cada gate catalogado com argv, cwd e ambiente confinados; gates não usam o sandbox de SO desta etapa |
| Revalidation | Verifica hashes da spec, steps, schemas, catálogos, lock e identidade do worktree |
| Reviewer | Cria snapshot fechado e invoca reviewer fresh em sandbox sem paths graváveis |
| Acceptance | Função determinística: schema, gates, evidência, findings, notas de implementação |
| AWAITING_COMMIT | Se `autoCommit: false` (default), para aqui para você revisar e commitar |

Se um step falhar, a prosa classifica o erro (transiente → retry; determinístico → BLOCKED). Até 2 falhas transientes equivalentes disparam o diagnostician. Sem correction step automático.

Sinais estruturados podem elevar o nível durante a execução: finding `high`/`critical`, segunda
tentativa, path permitido mas não previsto e violação de sandbox são os produtores iniciais. Sinal
não aprova a mudança nem substitui gate, review ou acceptance. O maior nível observado é preservado
durante o run.

Quando a saída trouxer `RISK_APPROVAL_REQUIRED`, leia o contexto sanitizado e use
`/resume-spec ... --decision-file <path|->`. Aprovação usa `nextAction: null`; rejeição exige
`retry`, `replan` ou `abort`. Decisões são vinculadas ao contexto exato e ficam stale após drift.
Aprovação de risco nunca concede commit ou PR. O procedimento completo está no
[runbook da pipeline](automated-spec-pipeline-runbook.md#se-o-run-aguardar-aprovação-de-risco).

## 4. Revise o trabalho

A prosa parou em `AWAITING_COMMIT`. Os arquivos modificados já estão **staged** no worktree — o `acceptStep` deu `git add` exatamente nos paths aprovados.

Para revisar, você tem duas opções:

### No terminal

```bash
# Descubra o caminho do worktree
git worktree list | grep workflow-runtime

# Veja o diff que o executor produziu
git -C <worktree> diff --cached

# Leia a review (o que o reviewer achou)
python3 -m json.tool .workflow-runtime/runs/<runId>/artifacts/<stepId>/attempt-1/review.json
```

### No VS Code (ou qualquer editor)

O worktree é um diretório normal no disco. Abra direto:

```bash
code .workflow-runtime/runs/<runId>/worktrees/attempt-<stepId>-1
```

O VS Code enxerga o worktree como um repositório Git comum. Você pode ver o diff staged, editar se precisar (mas não mude arquivos — o resume valida a identidade do worktree byte a byte), e commitar com a UI.

## 5. Commite

```bash
git -C <worktree> commit -m "feat: <resumo do step>"
```

O commit vai no worktree, **não na main**. É isso que preserva o `--base-sha` e evita drift no resume. O pipeline reconciliará esse commit depois.

## 6. Continue

```
/resume-spec specs/<feature>.md --base-sha $(git rev-parse HEAD)
```

A prosa reconcilia o commit (verifica parent SHA, tree SHA, paths aceitos), avança para o próximo step e repete o ciclo. Se o step não produziu mudanças (spec já implementada), o resume avança automaticamente sem exigir commit.

Repita os passos 4–6 até o último step.

## 7. Fechamento

Depois do último step, a prosa roda:

- **Gates globais**: união dos `testing.gateIds` de todos os steps com `required: true`
- **Final review**: snapshot global com reviewer fresh/read-only
- **Global acceptance**: função determinística cobrindo schema, integração, boundaries, todos os ACs e findings
- **Relatório**: `final-report.json` + `retrospective.yaml` em `.workflow-runtime/`
- **PR** (se `--create-pr`): cria PR via `gh`, sem push, sem deploy

Se tudo passar:

```json
{ "ok": true, "status": "SUCCEEDED" }
```

---

## Caminho alternativo: implementação manual

Se preferir implementar cada step com supervisão direta, sem a prosa:

```
/implement-step specs/steps/<feature>-step-1.md
```

O agente lê o step, entende o contrato e implementa. Depois:

```
/check-step specs/steps/<feature>-step-1.md
```

Valida se o que foi implementado bate com o que o step declarou. Se passar, commit.

---

## Cursor CLI como agente

A prosa suporta dois provedores de agente: **OpenCode** e **Cursor**. Ambos são spawnados como subprocesso com `shell: false`, argv explícito e output estruturado. O roteamento é automático por `resource.executable`.

| Contrato | OpenCode | Cursor (`agent`) |
|---|---|---|
| Binário | `opencode` | `agent` |
| Modo headless | `run --pure` | `-f -p` |
| Output | `--format json` (eventos JSON) | `--output-format stream-json` (NDJSON) |
| Modelo | `--model opencode-go/grok-4.5` | `--model cursor-grok-4.5-medium` |
| Workspace | `--dir <path>` | CWD do processo |
| Auth | config local | `CURSOR_API_KEY` |
| Permissão | `OPENCODE_PERMISSION` + sandbox de SO | Sandbox de SO + contrato no prompt |

### Agentes disponíveis (6)

| Papel | OpenCode | Cursor |
|-------|----------|--------|
| Executor | `opencode` | `cursor-cli` |
| Reviewer | `opencode-reviewer` | `cursor-cli-reviewer` |
| Diagnostician | `opencode-diagnostician` | `cursor-cli-diagnostician` |

### Como escolher

No frontmatter do step, em `resources:`:

```yaml
# OpenCode (default)
resources:
  executor: opencode
  reviewer: opencode-reviewer
  diagnostician: opencode-diagnostician

# Cursor
resources:
  executor: cursor-cli
  reviewer: cursor-cli-reviewer
  diagnostician: cursor-cli-diagnostician

# Misturar provedores (ex: executor Cursor + reviewer OpenCode)
resources:
  executor: cursor-cli
  reviewer: opencode-reviewer
```

Ambos os provedores rodam sob sandbox coercitivo de SO para filesystem e rede. O OpenCode também recebe uma configuração deny-first própria (`edit`, `bash` e `websearch`); no Cursor, restrições sem seam de SO permanecem declaradas no prompt.

---

## Gates MCP

A prosa suporta gates que consultam servidores MCP (Model Context Protocol) para validação externa. Diferente dos gates executáveis (que rodam scripts), gates MCP invocam tools de servidores via stdio com protocolo JSON-RPC 2.0.

### MCPs disponíveis (3)

| Gate | Server | Tool | Propósito | Pré-requisito |
|------|--------|------|-----------|--------------|
| `context7-check` | `context7` | `resolve-library-id` | Validar docs de bibliotecas | `npx` (vem com Node) |
| `websearch-verify` | `websearch` | `search` | Auditar padrões de segurança na web | `BRAVE_API_KEY` |
| `gh-grep-audit` | `gh-grep` | `search_code` | Buscar anti-patterns no GitHub | `GITHUB_TOKEN` |

Sem a chave de API, o gate falha com erro claro (`MCP_TOOL_ERROR`) e bloqueia o step como qualquer gate que não passa.

### Como usar em um step

No frontmatter do step, declare o gate MCP em `verification.gateIds`:

```yaml
verification:
  gateIds:
    - context7-check
    - websearch-verify
    - revalidation
```

Os args da tool são definidos no `gates.yaml`. Para passar args customizados, crie um novo gate no catálogo com args diferentes (ex: `context7-check-react-router` com `args: { libraryName: "react-router" }`).

---

## Intervenções comuns

A prosa é fail-closed — trava antes de fazer besteira. Aqui está o que fazer em cada cenário.

### Worktree sujo ou mudanças fora do escopo

O executor tocou em arquivos fora de `allowedAreas` ou acima do limite de 5. A prosa bloqueou em `SCOPE_OUTSIDE_ALLOWED` ou `SCOPE_LOGICAL_FILE_LIMIT`.

```bash
# Limpe o runtime e o worktree
chmod -R u+w .workflow-runtime && rm -rf .workflow-runtime
git worktree prune

# Reveja o step: ajuste predictedFiles, allowedAreas ou o goal
# Edite specs/steps/<feature>-step-N.md

# Recalcule o hash da spec se o corpo mudou (o validate avisa)
bash scripts/workflow/validate-spec.sh specs/<feature>.md

# Execute de novo
/run-spec specs/<feature>.md --base-sha $(git rev-parse HEAD)
```

### Lock órfão

O processo da prosa morreu (SIGKILL, crash, terminal fechado) e o lock ficou no disco. O resume recusa rodar.

```bash
/resume-spec specs/<feature>.md --base-sha $(git rev-parse HEAD) --remove-orphan-lock
```

A flag exige prova de que o PID dono do lock não existe mais. Se o processo ainda estiver vivo, o resume bloqueia. Não mate o processo pai da prosa — mate o filho (`opencode run`) se precisar abortar.

### Step bloqueado

O step falhou com `BLOCKED` — gate não passou, budget estourou, ou o reviewer encontrou `critical`/`high`.

```bash
# Veja o estado
python3 -m json.tool .workflow-runtime/runs/<runId>/state.json | grep -A5 '"state"'

# Leia os artifacts de gate e review para entender o que falhou
ls .workflow-runtime/runs/<runId>/artifacts/<stepId>/attempt-1/
python3 -m json.tool .workflow-runtime/runs/<runId>/artifacts/<stepId>/attempt-1/gate-*.json
python3 -m json.tool .workflow-runtime/runs/<runId>/artifacts/<stepId>/attempt-1/review.json
```

Depois de corrigir a causa (código, teste, spec):

```bash
# Limpe e rode de novo
chmod -R u+w .workflow-runtime && rm -rf .workflow-runtime
git worktree prune
/run-spec specs/<feature>.md --base-sha $(git rev-parse HEAD)
```

### AWAITING_COMMIT sem mudanças

O acceptance passou mas o diff está vazio — o executor não produziu mudanças (spec já implementada, step desnecessário). Não há o que commitar.

```
/resume-spec specs/<feature>.md --base-sha $(git rev-parse HEAD)
```

A prosa detecta o worktree limpo, transita o step para `COMMITTED` e avança automaticamente. Nenhum commit humano é necessário.

### REVALIDATION_DRIFT no resume

O resume recusou com `REVALIDATION_DRIFT`. Significa que algo mudou entre o run e o resume — um arquivo foi editado no worktree, o `main` andou, ou o base SHA da CLI não confere com o que o run usou.

```bash
# Confira se o --base-sha é o mesmo do run original
python3 -c "
import json
state = json.load(open('.workflow-runtime/runs/<runId>/state.json'))
print('run base:', state['repo']['baseSha'])
"
git rev-parse HEAD   # deve ser igual

# Se você editou arquivos no worktree, desfaça
git -C <worktree> checkout -- .

# Se o main andou (commits novos), o resume do run atual está preso
# ao base SHA original por design. Termine este run com o base SHA
# original ou descarte e comece um novo.
```

### Abortar um run

```bash
# Mate o processo filho primeiro (opencode), não o pai (run-spec.sh)
pkill -f "opencode run"

# Depois limpe
chmod -R u+w .workflow-runtime && rm -rf .workflow-runtime
git worktree prune
```

O `chmod -R u+w` é obrigatório — os snapshots fechados do reviewer são criados com permissão `0400` e um `rm -rf` direto falha.

### Worktrees acumulados

Se o pipeline crashou ou você matou o processo pai, worktrees podem ficar residuais:

```bash
git worktree list                # veja todos
git worktree remove <path>       # remova um por um
git worktree prune               # ou limpe todos os órfãos de uma vez
```

Worktrees do pipeline ficam sempre em `.workflow-runtime/runs/<runId>/worktrees/`. Nada fora desse caminho é tocado.

### Reviewer rejeitou

O reviewer retornou `changes_requested` ou `blocked`. O acceptance foi negado.

```bash
# Leia os findings
python3 -m json.tool .workflow-runtime/runs/<runId>/artifacts/<stepId>/attempt-1/review.json | grep -A10 findings
```

Corrija o código, ajuste a spec ou o step, limpe o runtime e rode de novo. Não há "correction step" automático — a prosa nunca corrige código por conta própria.

### Gate de teste falhou

O gate `workflow-tests` ou `verify-pack` falhou com `exitCode: 1`.

```bash
# Rode os testes manualmente no worktree pra ver o erro completo
cd .workflow-runtime/runs/<runId>/worktrees/attempt-<stepId>-1
node --test scripts/workflow/test-*.cjs
```

O output do gate é truncado por padrão — rodar manualmente mostra o stack trace completo. Corrija os testes ou o código, limpe e re-execute.

### Hash da spec desatualizado

Você editou a spec ou um step depois de aprovar. O `validate` reclama de `SPEC_SOURCE_HASH_MISMATCH`.

```bash
# Recalcule o hash
node -e "
const crypto = require('crypto');
const fs = require('fs');
const contracts = require('./scripts/workflow/lib/contracts.cjs');
const source = fs.readFileSync('specs/<feature>.md', 'utf8');
const split = contracts.splitMarkdownFrontMatter(source);
const body = split.value.body.replace(/\\r\\n?/g, '\n').replace(/\\n*$/, '') + '\n';
console.log(crypto.createHash('sha256').update(body).digest('hex'));
"

# Atualize o source.hash no frontmatter da spec
```
