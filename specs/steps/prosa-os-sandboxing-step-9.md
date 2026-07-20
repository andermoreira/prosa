---
schemaVersion: 1.0.0
id: spec-prosa-os-sandboxing-step-9
sequence: 9
specId: spec-prosa-os-sandboxing
source: {path: specs/steps/prosa-os-sandboxing-step-9.md, hash: 02076a47627b55d72a6c80f7696539bfd2bc8b2c989c79e223571f2cced7d3c3, baseSha: 7fb3c4b5659e5e8a69ceb032a27a25307d4f5ced}
goal: Publicar o contrato operacional do sandbox, seus pré-requisitos, limites, upgrade e troubleshooting.
boundaries:
  inScope:
    - behaviorType=vertical
    - owns=documentação operacional, changelog e notices
    - invariant=documentação não promete Linux nem sandbox de gates ou MCP
    - allowedDependencies=spec-prosa-os-sandboxing-step-8
  outOfScope:
    - doesNotOwn=archive, release, tag, Linux, novos gates, sandbox de gates ou MCP e requisitos novos
  maxLogicalFiles: 5
dependsOn: [spec-prosa-os-sandboxing-step-8]
predictedFiles: [docs/workflows/automated-spec-pipeline.md, docs/workflows/automated-spec-pipeline-runbook.md, CHANGELOG.md, THIRD_PARTY_NOTICES.md]
allowedAreas: [docs/workflows, CHANGELOG.md, THIRD_PARTY_NOTICES.md]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-os-sandboxing.md, stepPath: specs/steps/prosa-os-sandboxing-step-9.md, baseSha: 7fb3c4b5659e5e8a69ceb032a27a25307d4f5ced, implementationNoteIds: [NOTE-01]}
acceptanceCriteria:
  - id: AC-13
    evidence:
      - {id: EVIDENCE-19, kind: documentation, description: "A documentação durável cobre policy, ajuste, pré-requisitos, erros, medição e upgrade.", resultRef: docs/workflows/automated-spec-pipeline-runbook.md}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [specs-lint, verify-pack, revalidation]}
revalidation:
  triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, on-resume, before-final-review, before-global-acceptance]
  driftPolicy: block
documentationImpact:
  kind: paths
  paths: [docs/workflows/automated-spec-pipeline.md, docs/workflows/automated-spec-pipeline-runbook.md, CHANGELOG.md, THIRD_PARTY_NOTICES.md]
testing: {required: true, gateIds: [specs-lint, verify-pack], rationale: "Lint, links, notices e consistência do pack precisam ser verificados após a consolidação documental."}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 9: Atualizar documentação durável e changelog

## Goal

Publicar o contrato operacional do sandbox, seus pré-requisitos, limites, upgrade e troubleshooting.

## Assumptions

- Os passos 3–8 forneceram comportamento e medições finais; documentação não promete Linux.

## Risks

- Docs manterem a afirmação antiga de que worktree é a única isolação; revisar todas as seções afetadas.

## Edge cases

- SRT/backend ausente, policy drift no resume, cleanup falho, provider endpoint novo, upgrade 0.0.x e run antigo.

## Acceptance Criteria

- Docs explicam policy por papel/resource, origem da allowlist, `credentials.files` deny, HOME/TMP,
  state/resume, erros `SANDBOX_*`, pré-requisitos macOS, medição e upgrade revisado.
- Changelog e notices registram a dependência pinada e a mudança da trust boundary sem declarar gates/MCP cobertos.

## Tarefas

1. Atualizar `docs/workflows/automated-spec-pipeline.md` com arquitetura, invariantes e escopo.
2. Atualizar `docs/workflows/automated-spec-pipeline-runbook.md` com preflight, operação, resume,
   troubleshooting, endpoint review e procedimento de upgrade/repetição adversarial.
3. Atualizar `CHANGELOG.md` em Unreleased e `THIRD_PARTY_NOTICES.md` com SRT 0.0.66, licença e uso.

## Paths afetados (limite absoluto)

- `docs/workflows/automated-spec-pipeline.md`
- `docs/workflows/automated-spec-pipeline-runbook.md`
- `CHANGELOG.md`
- `THIRD_PARTY_NOTICES.md`

## Fora de Escopo

- Archive da spec, release/tag, suporte Linux, novos gates, sandbox de gates/MCP e mudança de requisitos.

## Critério de Pronto

- Um operador consegue instalar, executar, retomar, diagnosticar e revisar upgrade sem contexto oral; lint e links passam.

## Dependências

- Passo 8.

## Checklist pré-handoff

- [ ] Quatro arquivos afetados?
- [ ] Changelog/notices e runbook refletem a versão e medição reais?
- [ ] Gates/MCP e Linux continuam explicitamente fora de escopo?

## Prompt de handoff

```text
Implemente APENAS o Passo 9.
Files: @docs/workflows/automated-spec-pipeline.md @docs/workflows/automated-spec-pipeline-runbook.md @CHANGELOG.md @THIRD_PARTY_NOTICES.md
Out of scope: archive, release/tag, Linux, novos gates e sandbox de gates/MCP.
Done criteria: docs operacionais, changelog e notices cobrem policy, setup, resume, erros, upgrade e medição sem prometer escopo não implementado.
---
@specs/steps/prosa-os-sandboxing-step-9.md
@specs/prosa-os-sandboxing.md
```
