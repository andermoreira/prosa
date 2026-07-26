# Public release gate — 2026-07-26

## Decision

**Pass.** The local suite, exposure audit, and three consecutive GitHub Actions executions are green. No blocking finding is open.

## Local evidence

| Gate | Result |
| --- | --- |
| `npm run verify` | 200 passed, 1 documented platform skip, 0 failed |
| Public demo contract tests | 2 passed |
| `npm audit --audit-level=high` | 0 vulnerabilities |
| Gitleaks 8.24.2, complete history | 5 commits scanned, no leaks |
| Exposure and provenance review | Pass; see `public-release-readiness-2026-07-26.md` |

## Consecutive CI executions

| Run | Revision | Result |
| --- | --- | --- |
| [30209558054](https://github.com/andersonmalves/prosa/actions/runs/30209558054) | `7658a08` | Pass |
| [30209796229](https://github.com/andersonmalves/prosa/actions/runs/30209796229) | `8c59524` | Pass |
| [30209849139](https://github.com/andersonmalves/prosa/actions/runs/30209849139) | `a87b35b` | Pass |

## Authorized external rollout

After merging the reviewed branch:

1. change `andersonmalves/prosa` visibility to public;
2. apply the approved description and topics;
3. enable private vulnerability reporting;
4. upload `assets/social-preview.png`;
5. create the `v0.1.0-alpha` GitHub release;
6. validate the repository without authenticated access;
7. feature Prosa in Anderson's profile.

The owner explicitly authorized these actions on 2026-07-26. If the merge changes the audited tree or a required check regresses, the gate returns to blocked.
