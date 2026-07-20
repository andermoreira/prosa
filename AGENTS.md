# Agent Operating Manual

Este `AGENTS.md` é lido pelo próprio orchestrator do `prosa` (`scripts/workflow/lib/local-adapter.cjs`)
para compor o hash de política e o contexto de review — todo repo alvo do pipeline precisa de um.
Este é o do próprio `prosa`, usado quando ele roda o pipeline sobre si mesmo (dogfooding/testes).

## Regras gerais

- Não alterar código de produção sem solicitação explícita do usuário.
- Seguir o processo de spec (`specs/<feature>.md` + `specs/steps/<feature>-step-N.md`) antes de
  implementar mudanças no orchestrator.
- Registrar decisões arquiteturais relevantes em `adr/` usando a numeração existente como
  referência de estilo (ver nota de numeração no README.md).
- ADRs Accepted são imutáveis até um novo ADR Superseded substituí-los.
- Prosa ao usuário em pt-BR; identificadores, commits e PRs em inglês.
