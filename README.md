# prosa

Motor de orquestração de agentes autônomos: execução de specs por pipeline automática, com
sandbox de SO coercitivo, política de risco e HITL, lock de git worktree, broker de dependency
vetting e detecção de spec-code drift.

Extraído do repositório [`ia`](https://github.com/andersonmalves/ia) (pack de config para
assistentes de IA) em 2026-07-20, sem histórico de commits — os dois projetos cresceram juntos
por conveniência, mas são produtos diferentes: `ia` é um pack de config maduro e estável;
`prosa` é este motor, ainda em desenvolvimento ativo.

## Layout

```
prosa/
├── scripts/workflow/     ← orchestrator, adapters, sandbox, budget, git, testes
├── schemas/               ← contratos JSON Schema (state, review, diagnosis, risk-signal, step, spec, ...)
├── workflow/               ← gates.yaml, resources.yaml, risk-policy.yaml
├── specs/                 ← specs ativas e steps (mesma convenção do ia)
├── adr/                   ← decisões arquiteturais (numeração herdada do ia; ver nota abaixo)
├── docs/workflows/         ← runbook e guia de desenvolvimento do pipeline
├── docs/audits/            ← auditorias específicas do motor (sandbox, risk/HITL)
└── commands/               ← run-spec, review-spec, resume-spec (ainda não empacotados como
                              slash commands — eram commands do Cursor/Claude Code no ia)
```

## Numeração dos ADRs

Os ADRs mantiveram os números que já tinham no `ia` (015–019, 021–027) para preservar
rastreabilidade com CHANGELOG e cross-references antigas. Uma exceção: o ADR de sandbox de
gates (`028-sandbox-de-gates-de-execucao-de-worktree.md`) tinha uma branch local não mergeada no
`ia` que colidia com o número 024 (já usado por "Contrato estruturado de implementação do
step") — foi renumerado para 028 na extração, livre aqui porque o 028/029 do `ia` (adapters
Codex CLI/opencode) não migraram.

## Rodando os testes

```bash
npm install
npm test   # node --test scripts/workflow/test-*.cjs
```

## Estado

Em desenvolvimento ativo. `scripts/workflow/` começou em 2026-07-16. Duas frentes recentes
(dependency vetting, spec-code drift) ainda estão em fase de discovery/spec, sem implementação.
