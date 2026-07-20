---
schemaVersion: 2.0.0
changeType: architecture
id: spec-prosa-dependency-vetting-step-10
sequence: 10
specId: spec-prosa-dependency-vetting
source: {path: specs/steps/prosa-dependency-vetting-step-10.md, hash: af06c36336a56cf617a136117ef7649f8c24bb04afd4225678e75c09707acb3d, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0}
goal: Canonicalizar graph, closure, remoções e grandfathering e aplicar fast path somente após hashing completo.
boundaries: {inScope: [owns=dependency graph classification e closure matching, invariant=candidate persistido é autoridade, allowedDependencies=step 9], outOfScope: [doesNotOwn=transport metadata reports state e enablement], maxLogicalFiles: 5}
dependsOn: [spec-prosa-dependency-vetting-step-9]
predictedFiles: [scripts/workflow/lib/dependency-graph.cjs, scripts/workflow/lib/dependency-vetting.cjs, scripts/workflow/test-dependency-graph.cjs, scripts/workflow/test-dependency-vetting.cjs]
allowedAreas: [scripts/workflow/lib, scripts/workflow/test-dependency-graph.cjs, scripts/workflow/test-dependency-vetting.cjs]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/prosa-dependency-vetting.md, stepPath: specs/steps/prosa-dependency-vetting-step-10.md, baseSha: 35cb2d4b00be0217da2bea071f19832389a0b1f0, implementationNoteIds: [NOTE-04, NOTE-05, NOTE-08]}
acceptanceCriteria:
  - {id: AC-12, evidence: [{id: EVIDENCE-212, kind: automated-test, description: "Closure alterada perde fast path.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-10/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-dependency-vetting.cjs}]}
  - {id: AC-13, evidence: [{id: EVIDENCE-213, kind: automated-test, description: "Todos os roots casam e policy vazia exige approval.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-10/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-dependency-vetting.cjs}]}
  - {id: AC-14, evidence: [{id: EVIDENCE-214, kind: automated-test, description: "Hashes canônicos incluem facts flags platform e edges.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-10/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-dependency-graph.cjs}]}
  - {id: AC-15, evidence: [{id: EVIDENCE-215, kind: automated-test, description: "Grandfathering pós-base exige provenance íntegra.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-10/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-dependency-graph.cjs}]}
  - {id: AC-16, evidence: [{id: EVIDENCE-216, kind: automated-test, description: "Candidate persistido governa sem promessa de re-resolução.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-10/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-dependency-vetting.cjs}]}
  - {id: AC-17, evidence: [{id: EVIDENCE-217, kind: automated-test, description: "Re-resolução divergente cria request novo e staleness.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-10/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-dependency-vetting.cjs}]}
  - {id: AC-46, evidence: [{id: EVIDENCE-246, kind: automated-test, description: "Remove usa removedClosureHash e nunca fast path.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-10/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-dependency-vetting.cjs}]}
  - {id: AC-47, evidence: [{id: EVIDENCE-247, kind: automated-test, description: "Status global combina roots nodes predicates e actions por máximo.", gateId: workflow-tests, resultRef: spec-prosa-dependency-vetting-step-10/attempt-1/gate-workflow-tests, testSelector: scripts/workflow/test-dependency-vetting.cjs}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 120, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: none, justification: Graph e closure serão documentados no Step 20.}
testing: {required: true, gateIds: [workflow-tests], rationale: Canonicalização e classificação exigem fixtures determinísticas.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 10: Graph, closure e fast path
## Goal
Derivar identidades canônicas e classificação máxima sem rede ou enablement produtivo.
## Assumptions
- Drift concluído; bootstrap exato; candidate fixtures são usados fora de runs reais.
## Risks
- Hash omitir edge ou platform; definir representação canônica fechada.
## Edge cases
- Transitive alterada, nó pós-base, remove preapproved, root múltiplo e re-resolution diferente.
## Acceptance Criteria
- AC-12 a AC-17, AC-46 e AC-47 passam deterministicamente.
## Tarefas
1. Implementar graph/node/closure/resolution/classification hashes.
2. Classificar new/changed/grandfathered/removed e aplicar máximo.
3. Aplicar fast path só após candidate completo e provar staleness.
## Paths afetados (limite absoluto)
- `scripts/workflow/lib/dependency-graph.cjs`
- `scripts/workflow/lib/dependency-vetting.cjs`
- `scripts/workflow/test-dependency-graph.cjs`
- `scripts/workflow/test-dependency-vetting.cjs`
## Fora de Escopo
- Metadata remota, reports, state e enablement.
## Critério de Pronto
- Identidades e fast path são determinísticos e conservadores.
## Dependências
- Passo 9 e drift concluído.
## Checklist pré-handoff
- [ ] Quatro arquivos? [ ] Closure completa? [ ] Sem runs reais?
## Prompt de handoff
```text
Implemente APENAS o Passo 10.
Files: @scripts/workflow/lib/dependency-graph.cjs @scripts/workflow/lib/dependency-vetting.cjs @scripts/workflow/test-dependency-graph.cjs @scripts/workflow/test-dependency-vetting.cjs
Out of scope: metadata, reports, state e enablement.
Done criteria: graph/closure/removal/grandfathering e fast path passam fixtures.
---
@specs/steps/prosa-dependency-vetting-step-10.md
@specs/prosa-dependency-vetting.md
```
