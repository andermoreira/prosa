---
schemaVersion: 1.0.0
id: spec-automated-pipeline-step-14
sequence: 14
specId: spec-automated-pipeline
source: {path: specs/steps/automated-spec-pipeline-step-14.md, hash: ca24490923b41ec92e9c3c242271cc2251f57c5d3a8b1202cdf6f5477d5afe3c, baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4}
goal: Expor outcomes, budgets e findings em artifacts sanitizados e emitir notifications opt-in sem alterar acceptance.
boundaries:
  inScope:
    - behaviorType=vertical
    - owns=relatório, retrospective e notifications
    - invariant=notification recebe payload sanitizado e não altera acceptance
    - allowedDependencies=spec-automated-pipeline-step-13
  outOfScope:
    - doesNotOwn=telemetria obrigatória, issue automática e mutação do SSOT
  maxLogicalFiles: 5
dependsOn: [spec-automated-pipeline-step-13]
predictedFiles: [scripts/workflow/lib/report.cjs, scripts/workflow/lib/notifications.cjs, scripts/workflow/lib/orchestrator.cjs, scripts/workflow/test-report.cjs]
allowedAreas: [scripts/workflow]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: [notifier-terminal]}
context: {specPath: specs/automated-spec-pipeline.md, stepPath: specs/steps/automated-spec-pipeline-step-14.md, baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4, implementationNoteIds: [NOTE-01, NOTE-02, NOTE-03]}
acceptanceCriteria:
  - id: AC-12
    evidence:
      - {id: EVIDENCE-21, kind: automated-test, description: "Gate verify-pack valida notifier catalogado e payload sanitizado.", gateId: verify-pack, resultRef: spec-automated-pipeline-step-14/attempt-1/gate-verify-pack, testSelector: scripts/workflow/test-report.cjs}
  - id: AC-18
    evidence:
      - {id: EVIDENCE-22, kind: contract-test, description: "Gate verify-pack valida relatório e retrospective contra schema.", gateId: verify-pack, resultRef: spec-automated-pipeline-step-14/attempt-1/gate-verify-pack, testSelector: scripts/workflow/test-report.cjs}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [verify-pack, revalidation]}
revalidation:
  triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, on-resume]
  driftPolicy: block
documentationImpact: {kind: none, justification: Operação de reports e notifications será documentada no Step 17.}
testing: {required: true, gateIds: [verify-pack], rationale: "Nullable, redaction e falha de notifier exigem testes."}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 14: Relatório, retrospective e notifications

## Goal

Expor outcomes, budgets e findings em artifacts sanitizados e emitir notifications opt-in sem alterar acceptance.

## Assumptions

- State, artifacts, findings e evidence fornecem referências hasheadas e sanitizadas.

## Risks

- Notification exfiltrar conteúdo; mitigar por resource catalog, payload mínimo e sanitização prévia.

## Edge cases

- Notifier indisponível, evento duplicado, cost/tokens `null`, relatório parcial e retrospective com backlog vazio.

## Acceptance Criteria

- Relatório/retrospective validam schema e mostram budgets/retries/evidence/docs/findings; notification falha sem mudar acceptance.

## Tarefas

1. Criar `scripts/workflow/lib/report.cjs` para relatório parcial/final e retrospective validada.
2. Criar `scripts/workflow/lib/notifications.cjs` para eventos opt-in por resource ID e payload sanitizado.
3. Integrar reporting/notifications em `scripts/workflow/lib/orchestrator.cjs`.
4. Criar `scripts/workflow/test-report.cjs` cobrindo nullable, redaction, falha de notifier e backlog.

## Paths afetados (limite absoluto)

- `scripts/workflow/lib/report.cjs`
- `scripts/workflow/lib/notifications.cjs`
- `scripts/workflow/lib/orchestrator.cjs`
- `scripts/workflow/test-report.cjs`

## Fora de Escopo

- Telemetria obrigatória, issue automática ou alteração de SSOT pela retrospective.

## Critério de Pronto

- Artifacts finais explicam toda decisão e notifications nunca recebem payload bruto.

## Dependências

- Passos 9, 10 e 13.

## Checklist pré-handoff

- [ ] ≤ 5 arquivos afetados?
- [ ] Payload sanitizado antes do notifier?
- [ ] Falha de notification não altera acceptance?

---

## Prompt de handoff

```text
Implemente APENAS o Passo 14.
Files: @scripts/workflow/lib/report.cjs @scripts/workflow/lib/notifications.cjs @scripts/workflow/lib/orchestrator.cjs @scripts/workflow/test-report.cjs
Out of scope: telemetria obrigatória, issues e mutação do SSOT.
Done criteria: reports/retrospective completos e notifications opt-in sanitizadas sem efeito no aceite.
---
@specs/steps/automated-spec-pipeline-step-14.md
@specs/automated-spec-pipeline.md
```
