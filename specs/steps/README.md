# specs/steps/ — passos atômicos de implementação

Nomenclatura canônica (ver `docs/workflows/spec-process.md`):

```text
specs/steps/<feature-name>-step-N.md
```

- kebab-case; `N` sequencial a partir de 1.
- Exemplo: `ai-config-ssot-step-1.md`.
- Cada step: máximo absoluto de 5 arquivos lógicos afetados, uma preocupação arquitetural,
  out-of-scope e done criteria explícitos (template em
  `docs/workflows/templates/step-handoff.md`). Produção, testes, docs, config, deleções, untracked e
  gerados contam; somente política central determinística pode excluir um artefato gerado. Rename
  inequívoco do Git conta um, enquanto delete+add ou rename ambíguo conta dois. Excesso bloqueia sem
  justificativa ou override.
- Em execução automatizada, o front matter segue `schemas/step.schema.json`: `sequence` acompanha o
  Implementation plan, `dependsOn` é explícito e forma o DAG derivado a cada run/resume, sem
  manifesto DAG paralelo, e os `gateIds` devem existir em `workflow/gates.yaml`.
- Um step = um chat Agent novo no implementador (Cursor/Claude Code).
- Contém **apenas steps de mudanças ativas** — ao concluir a feature, steps vão junto
  com a spec para `specs/archive/<YYYY-MM-DD>-<feature>/` (ver `specs/README.md`).
