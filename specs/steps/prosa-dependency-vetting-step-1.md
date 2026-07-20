---
schemaVersion: 2.0.0
changeType: test
id: spec-prosa-dependency-vetting-step-1
sequence: 1
specId: spec-prosa-dependency-vetting
source: {path: specs/steps/prosa-dependency-vetting-step-1.md, hash: b35f2b84ea7940b804f0a0c70833ef06f0d49dc6c6d04ec3fab20988416b66dc, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
goal: Prototipar toolchain, reports, SRI, downloads, limites e trust offline antes de qualquer enablement.
boundaries: {inScope: [owns=protótipo e evidência de decisões abertas, invariant=nenhuma integração produtiva é habilitada, allowedDependencies=drift concluído], outOfScope: [doesNotOwn=broker produtivo state e orchestrator], maxLogicalFiles: 5}
dependsOn: []
predictedFiles: [scripts/workflow/prototype-dependency-vetting.cjs, scripts/workflow/fixtures/dependency-signatures.json, docs/audits/prosa-dependency-vetting-prototype.md]
allowedAreas: [scripts/workflow, scripts/workflow/fixtures, docs/audits]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-dependency-vetting.md, stepPath: specs/steps/prosa-dependency-vetting-step-1.md, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0, implementationNoteIds: [NOTE-04, NOTE-05, NOTE-08]}
acceptanceCriteria:
  - {id: AC-18, evidence: [{id: EVIDENCE-218, kind: artifact, description: "Protótipo fixa distribuição e paths de Node/npm sem PATH ou Corepack.", resultRef: docs/audits/prosa-dependency-vetting-prototype.md}]}
  - {id: AC-20, evidence: [{id: EVIDENCE-220, kind: artifact, description: "Baseline mede e justifica limites coercitivos.", resultRef: docs/audits/prosa-dependency-vetting-prototype.md}]}
  - {id: AC-22, evidence: [{id: EVIDENCE-222, kind: artifact, description: "Fixtures provam validators ligados ao digest do npm.", resultRef: docs/audits/prosa-dependency-vetting-prototype.md}]}
  - {id: AC-24, evidence: [{id: EVIDENCE-224, kind: artifact, description: "Experimento valida endpoints, encoding, granularidade e freshness de downloads.", resultRef: docs/audits/prosa-dependency-vetting-prototype.md}]}
  - {id: AC-26, evidence: [{id: EVIDENCE-226, kind: artifact, description: "Protótipo confirma ou bloqueia o comando normativo de signatures.", resultRef: docs/audits/prosa-dependency-vetting-prototype.md}]}
  - {id: AC-28, evidence: [{id: EVIDENCE-228, kind: artifact, description: "Trust offline cobre issuer, subject, source, builder e freshness.", resultRef: docs/audits/prosa-dependency-vetting-prototype.md}]}
  - {id: AC-49, evidence: [{id: EVIDENCE-249, kind: artifact, description: "Evidência distingue version risk de fallback package-level.", resultRef: docs/audits/prosa-dependency-vetting-prototype.md}]}
  - {id: AC-52, evidence: [{id: EVIDENCE-252, kind: artifact, description: "Protótipo comprova SRI SHA-512 ou stronger e rejeita formas fracas.", resultRef: docs/audits/prosa-dependency-vetting-prototype.md}]}
  - {id: AC-53, evidence: [{id: EVIDENCE-253, kind: artifact, description: "Trust Sigstore/TUF offline é provado sem host adicional.", resultRef: docs/audits/prosa-dependency-vetting-prototype.md}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, specs-lint, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: paths, paths: [docs/audits/prosa-dependency-vetting-prototype.md]}
testing: {required: true, gateIds: [workflow-tests], rationale: O protótipo deve ser reproduzível por fixture e falhar fechado nas questões abertas.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 1: Protótipo da toolchain e trust

## Goal
Fechar por experimento versões, comandos, validators, trust offline, SRI, downloads e limites.

## Assumptions
- Os 15 steps de drift, step v3 e state v4 estão concluídos e aprovados; esta dependência é textual e não entra em `dependsOn`.
- A exceção bootstrap aceita somente os 22 IDs desta spec, seu hash aprovado e o baseSha declarado; enablement produtivo permanece desligado.

## Risks
- Tratar hipótese como fato; registrar resultado negativo como bloqueio explícito do rollout.

## Edge cases
- JSON válido incompleto, host extra, scoped package, bulk 129, SHA-1 e trust cache stale.

## Acceptance Criteria
- A evidência reproduzível fecha AC-18, AC-20, AC-22, AC-24, AC-26, AC-28, AC-49, AC-52 e AC-53 sem inventar thresholds.

## Tarefas
1. Implementar o experimento isolado em `scripts/workflow/prototype-dependency-vetting.cjs` e fixtures pinadas.
2. Medir contratos e registrar versões, digests, comandos, limites, resultados e blockers em `docs/audits/prosa-dependency-vetting-prototype.md`.
3. Confirmar que o protótipo não altera wiring nem habilita broker, materialização, agente ou gates.

## Paths afetados (limite absoluto)
- `scripts/workflow/prototype-dependency-vetting.cjs`
- `scripts/workflow/fixtures/dependency-signatures.json`
- `docs/audits/prosa-dependency-vetting-prototype.md`

## Fora de Escopo
- Integrar runtime, criar policy produtiva ou contornar resultado inconclusivo.

## Critério de Pronto
- Protótipo reproduzível fecha as questões abertas ou bloqueia explicitamente o rollout.

## Dependências
- Conclusão aprovada dos 15 steps de drift; nenhum step desta feature.

## Checklist pré-handoff
- [ ] Três paths no máximo e nenhuma integração produtiva?
- [ ] Evidências EVIDENCE-218/220/222/224/226/228/249/252/253 reproduzíveis?
- [ ] Assumptions, risks e edge cases verificados?

## Prompt de handoff
```text
Implemente APENAS o Passo 1.
Files: @scripts/workflow/prototype-dependency-vetting.cjs @scripts/workflow/fixtures/dependency-signatures.json @docs/audits/prosa-dependency-vetting-prototype.md
Out of scope: integração produtiva, state e orchestrator.
Done criteria: protótipo reproduzível fecha toolchain, reports, trust, SRI, downloads e limites sem enablement.
---
@specs/steps/prosa-dependency-vetting-step-1.md
@specs/prosa-dependency-vetting.md
```
