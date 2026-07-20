---
schemaVersion: 1.0.0
id: spec-automated-pipeline-step-9
sequence: 9
specId: spec-automated-pipeline
source: {path: specs/steps/automated-spec-pipeline-step-9.md, hash: aff0e0f413bfbba39b0544d09a7180b8a7811d04b6b230a52f7bd8f96cacd9e8, baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4}
goal: Persistir artifacts com provenance somente depois de sanitização obrigatória.
boundaries:
  inScope:
    - behaviorType=vertical
    - owns=artifacts, sanitização e integração no orchestrator
    - invariant=nenhum artifact bruto é persistido ou compartilhado
    - allowedDependencies=spec-automated-pipeline-step-8
  outOfScope:
    - doesNotOwn=originais sensíveis, notifications e relatório final
  maxLogicalFiles: 5
dependsOn: [spec-automated-pipeline-step-8]
predictedFiles: [scripts/workflow/lib/artifacts.cjs, scripts/workflow/lib/sanitize.cjs, scripts/workflow/lib/orchestrator.cjs, scripts/workflow/test-artifacts.cjs]
allowedAreas: [scripts/workflow]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/automated-spec-pipeline.md, stepPath: specs/steps/automated-spec-pipeline-step-9.md, baseSha: 86872302ac6c9a4f4939972a8a58a270165f97a4, implementationNoteIds: [NOTE-01, NOTE-02, NOTE-03]}
acceptanceCriteria:
  - id: AC-11
    evidence:
      - {id: EVIDENCE-14, kind: automated-test, description: "Gate verify-pack valida provenance, redaction, truncamento e bloqueio seguro.", gateId: verify-pack, resultRef: spec-automated-pipeline-step-9/attempt-1/gate-verify-pack, testSelector: scripts/workflow/test-artifacts.cjs}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [verify-pack, revalidation]}
revalidation:
  triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, on-resume]
  driftPolicy: block
documentationImpact: {kind: none, justification: Política de artifacts será documentada no Step 17.}
testing: {required: true, gateIds: [verify-pack], rationale: "Secrets, corrupção e limites exigem fixtures negativas."}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 9: Artifacts e sanitização

## Goal

Persistir artifacts com provenance somente depois de sanitização obrigatória.

## Assumptions

- Runtime oferece escrita atômica confinada e o orchestrator conhece os triggers de revalidation.

## Risks

- Redaction insuficiente vazar secrets; mitigar bloqueando quando sanitização confiável não for possível.

## Edge cases

- Binário, saída enorme, token/PII, media type desconhecido, artifact truncado e hash divergente.

## Acceptance Criteria

- Todo artifact persistido/compartilhado tem hash, provenance, sensitivity e marcador de redaction/truncamento quando aplicável.

## Tarefas

1. Criar `scripts/workflow/lib/artifacts.cjs` com tipos, metadata, retenção, hash e refs.
2. Criar `scripts/workflow/lib/sanitize.cjs` para secrets/PII/env/limites antes de persistência ou consumo.
3. Integrar artifacts sanitizados em `scripts/workflow/lib/orchestrator.cjs`.
4. Criar `scripts/workflow/test-artifacts.cjs` cobrindo redaction, bloqueio, provenance e corrupção.

## Paths afetados (limite absoluto)

- `scripts/workflow/lib/artifacts.cjs`
- `scripts/workflow/lib/sanitize.cjs`
- `scripts/workflow/lib/orchestrator.cjs`
- `scripts/workflow/test-artifacts.cjs`

## Fora de Escopo

- Persistir original sensível, notifications ou relatório final.

## Critério de Pronto

- Nenhum consumer recebe artifact não sanitizado e corrupção/hash stale bloqueia.

## Dependências

- Passos 5 e 8.

## Checklist pré-handoff

- [ ] ≤ 5 arquivos afetados?
- [ ] Sanitização antecede persistência e prompts?
- [ ] Falha não mantém original sensível?

---

## Prompt de handoff

```text
Implemente APENAS o Passo 9.
Files: @scripts/workflow/lib/artifacts.cjs @scripts/workflow/lib/sanitize.cjs @scripts/workflow/lib/orchestrator.cjs @scripts/workflow/test-artifacts.cjs
Out of scope: original sensível, notifications e relatório final.
Done criteria: artifacts hasheados/provenance são sanitizados antes de persistência/consumo.
---
@specs/steps/automated-spec-pipeline-step-9.md
@specs/automated-spec-pipeline.md
```
