---
schemaVersion: 2.0.0
changeType: documentation
id: spec-public-release-readiness-step-4
sequence: 4
specId: spec-public-release-readiness
source: {path: specs/steps/public-release-readiness-step-4.md, hash: 462e3b5c47939e3220dd66d7bb3c0fd0173221285cef27edbd6b0180653dfe76, baseSha: efe8dabe50acf4250e82adbb726f199648a53d60}
goal: Tornar o contrato público alpha compreensível, verificável e independente do ia.
boundaries: {inScope: [owns=README, segurança, notices, guia alpha e preview local, invariant=claims apontam para evidência executável, allowedDependencies=steps 2 e 3 aprovados], outOfScope: [doesNotOwn=contribution policy pública, npm, metadata remota e mudança de visibilidade], maxLogicalFiles: 5}
dependsOn: [spec-public-release-readiness-step-2, spec-public-release-readiness-step-3]
predictedFiles: [README.md, SECURITY.md, THIRD_PARTY_NOTICES.md, docs/workflows/public-alpha.md, assets/social-preview.png]
allowedAreas: [README.md, SECURITY.md, THIRD_PARTY_NOTICES.md, docs/workflows, assets]
resources: {executor: opencode, reviewer: opencode-reviewer, diagnostician: opencode-diagnostician, notifications: []}
context: {specPath: specs/public-release-readiness.md, stepPath: specs/steps/public-release-readiness-step-4.md, baseSha: efe8dabe50acf4250e82adbb726f199648a53d60, implementationNoteIds: [NOTE-01, NOTE-02, NOTE-03]}
acceptanceCriteria:
  - {id: AC-06, evidence: [{id: EVIDENCE-06, kind: documentation, description: "README e guia alpha distinguem implementado, experimental e planejado com limites por plataforma.", resultRef: README.md}]}
  - {id: AC-08, evidence: [{id: EVIDENCE-07, kind: documentation, description: "Quick start e demo públicas não referenciam acesso ao ia.", resultRef: docs/workflows/public-alpha.md}]}
  - {id: AC-09, evidence: [{id: EVIDENCE-08, kind: documentation, description: "Contrato declara alpha repo-only, suporte e canal de vulnerabilidade.", resultRef: SECURITY.md}]}
budgets: {maxAttempts: 3, maxAgentCalls: 6, maxReviewCycles: 2, maxDiagnosisCycles: 2, maxElapsedMinutes: 180, maxEstimatedCost: null, maxTokens: null}
verification: {gateIds: [workflow-tests, specs-lint, revalidation]}
revalidation: {triggers: [after-lock, before-worktree, before-agent-call, after-agent-call, after-diff, after-gate, before-review, after-review, before-diagnosis, after-diagnosis, before-acceptance, before-commit, after-commit, on-resume, after-resume-reconciliation, before-final-review, after-global-diff, before-global-acceptance, before-pull-request], driftPolicy: block}
documentationImpact: {kind: paths, paths: [README.md, SECURITY.md, THIRD_PARTY_NOTICES.md, docs/workflows/public-alpha.md]}
testing: {required: true, gateIds: [workflow-tests], rationale: O contrato público referencia uma demo executável que deve continuar passando.}
execution: {adapter: opencode, isolation: git-worktree, writable: true, autoCommit: false, allowPullRequest: false, correctionStep: false}
---
# Passo 4: contrato público alpha

## Goal

Tornar o contrato público alpha compreensível, verificável e independente do `ia`.

## Tarefas

1. Reescrever o primeiro viewport e o estado do README com claims verificáveis.
2. Criar política de segurança compatível com o suporte inicial.
3. Revisar notices e documentar instalação, demo, plataformas e limites.
4. Produzir social preview local coerente com a marca Prosa.

## Paths afetados (limite absoluto)

- `README.md`
- `SECURITY.md`
- `THIRD_PARTY_NOTICES.md`
- `docs/workflows/public-alpha.md`
- `assets/social-preview.png`

## Fora de Escopo

- `CONTRIBUTING.md`, publicação npm, metadata remota, release ou visibilidade.

## Critério de Pronto

- Um visitante entende problema, estágio, garantias, limites e demo sem acesso ao `ia`.

## Dependências

- Passos 2 e 3.

## Checklist pré-handoff

- [ ] Claims ligados a código, teste ou documento.
- [ ] Alpha e repo-only explícitos.
- [ ] Cinco arquivos ou menos.

## Prompt de handoff

```text
Implemente APENAS o Passo 4.
Files: @README.md @SECURITY.md @THIRD_PARTY_NOTICES.md @docs/workflows/public-alpha.md @assets/social-preview.png
Out of scope: contribuição pública, npm, metadata remota, release e visibilidade.
Done criteria: contrato alpha verificável, independente do ia e acompanhado de preview local.
---
@specs/steps/public-release-readiness-step-4.md
@specs/public-release-readiness.md
```
