# specs/ — mudanças ativas

Layout canônico (convenção herdada do pack `ia`):

```text
specs/
├── <feature-name>.md                    # mudanças ativas (spec = artefato de mudança)
└── steps/<feature-name>-step-N.md       # atomic steps das mudanças ativas
```

Specs de pipeline usam o frontmatter YAML como fonte única das seções sobrepostas
(`goal`/`nonGoals`/`acceptanceCriteria`), validado contra `schemas/spec.schema.json` por
`scripts/workflow/validate-spec.sh`. Não há `archive/` ainda neste repo — a convenção de
arquivamento por `git mv` para `archive/<data>-<feature>/` pode ser adotada quando fizer
sentido.
