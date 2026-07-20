---
schemaVersion: 1.0.0
id: spec-mcp-gates-step-6
sequence: 6
specId: spec-mcp-gates
source:
  path: specs/steps/mcp-gates-step-6.md
  hash: efcaf6f34f4add91e6a1716a2b71d0d74ad4e1ea3c01f79f79bcf6021f7f0f53
  baseSha: 63d73372a5230284d7bfad0e05c11f3585bf5feb
goal: Atualizar documentação durável — runbook com pré-requisitos MCP e prosa-development.md com exemplos de gates MCP em steps.
boundaries:
  inScope:
    - behaviorType=vertical
    - owns=docs/workflows/prosa-development.md, docs/workflows/automated-spec-pipeline-runbook.md
    - invariant=documentação reflete os 3 MCPs catalogados e como usá-los em steps
    - allowedDependencies=spec-mcp-gates-step-5
  outOfScope:
    - doesNotOwn=mcp.cjs, catálogos, testes, spec
  maxLogicalFiles: 5
dependsOn:
  - spec-mcp-gates-step-5
predictedFiles:
  - docs/workflows/prosa-development.md
  - docs/workflows/automated-spec-pipeline-runbook.md
allowedAreas:
  - docs/workflows
resources:
  executor: opencode
  reviewer: opencode-reviewer
  diagnostician: opencode-diagnostician
  notifications: []
context:
  specPath: specs/mcp-gates.md
  stepPath: specs/steps/mcp-gates-step-6.md
  baseSha: 63d73372a5230284d7bfad0e05c11f3585bf5feb
  implementationNoteIds: []
acceptanceCriteria:
  - id: AC-04
    evidence:
      - id: EVIDENCE-06
        kind: documentation
        description: Documentação cobre uso de gates MCP, pré-requisitos de API keys e exemplos de step.
        resultRef: docs/workflows/prosa-development.md
budgets:
  maxAttempts: 3
  maxAgentCalls: 6
  maxReviewCycles: 2
  maxDiagnosisCycles: 2
  maxElapsedMinutes: 120
  maxEstimatedCost: null
  maxTokens: null
verification:
  gateIds:
    - specs-lint
    - revalidation
revalidation:
  triggers:
    - after-lock
    - before-worktree
    - before-agent-call
    - after-agent-call
    - after-diff
    - after-gate
    - before-review
    - after-review
    - before-acceptance
    - on-resume
  driftPolicy: block
documentationImpact:
  kind: paths
  paths:
    - docs/workflows/prosa-development.md
    - docs/workflows/automated-spec-pipeline-runbook.md
testing:
  required: true
  gateIds:
    - specs-lint
  rationale: Documentação atualizada deve passar no lint de specs.
execution:
  adapter: opencode
  isolation: git-worktree
  writable: true
  autoCommit: false
  allowPullRequest: false
  correctionStep: false
---
# Step 6 — Atualizar documentação

## Goal

Atualizar a documentação durável para refletir o suporte a gates MCP: runbook com pré-requisitos e prosa-development.md com exemplos.

## O que fazer

### `docs/workflows/automated-spec-pipeline-runbook.md`

Adicionar seção "Gates MCP" após "Pré-condições":

```markdown
### Gates MCP (opcional)

Gates MCP permitem validar steps contra conhecimento externo. Requerem:

| MCP | Pré-requisito |
|-----|--------------|
| `context7-check` | `npx` disponível (vem com Node) |
| `websearch-verify` | `BRAVE_API_KEY` no ambiente |
| `gh-grep-audit` | `GITHUB_TOKEN` no ambiente |

Sem a chave de API, o gate falha com erro claro e não bloqueia o step se
não for `required: true`.
```

### `docs/workflows/prosa-development.md`

Adicionar seção "Gates MCP" após "Cursor CLI como agente":

```markdown
## Gates MCP

A prosa suporta gates que consultam servidores MCP para validação externa.
Diferente dos gates executáveis (que rodam scripts), gates MCP invocam tools
de servidores via stdio.

### MCPs disponíveis (3)

| Gate | Server | Tool | Propósito |
|------|--------|------|-----------|
| `context7-check` | `context7` | `resolve-library-id` | Validar docs de bibliotecas |
| `websearch-verify` | `websearch` | `search` | Auditar padrões de segurança |
| `gh-grep-audit` | `gh-grep` | `search_code` | Buscar anti-patterns no GitHub |

### Como usar em um step

No frontmatter do step, declare o gate MCP em `verification.gateIds`:

\`\`\`yaml
verification:
  gateIds:
    - context7-check
    - websearch-verify
    - revalidation
\`\`\`

Os args da tool são definidos no `gates.yaml`. Para sobrescrever,
crie um novo gate com args diferentes.
```

## Done criteria

- Runbook lista pré-requisitos para cada MCP
- prosa-development.md tem exemplos de uso em steps
- Lint de specs passa
- PR aberto com a spec completa (spec + 6 steps)

## Handoff

```text
Step 6: Atualizar docs/workflows/prosa-development.md com seção "Gates MCP" e
docs/workflows/automated-spec-pipeline-runbook.md com pré-requisitos MCP.
```
