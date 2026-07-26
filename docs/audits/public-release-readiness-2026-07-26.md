# Public release readiness audit — 2026-07-26

## Decision

**PUBLICABLE, pending the final documentation and CI gates.** No blocking exposure, provenance or
licensing finding is open in the audited revision `885a9f5`.

This is an engineering release gate, not legal advice. Any new commit added before publication
must be covered by the final secret scan and verification run.

## Scope

- Complete Git tree and all five commits reachable from every local ref.
- Versioned examples, workflow configuration, Actions and dependency manifests.
- Author identity, extraction provenance, project license and third-party notices.
- Personal paths, credentials, customer data and unnecessary private-repository context.

The local untracked environment was empty during the scan.

## Evidence

| Check | Command or source | Result |
|---|---|---|
| Repository integrity | `git fsck --full --no-dangling` | Passed; no integrity errors. |
| Full-history secret scan | `gitleaks detect --source . --redact --config .gitleaks.toml` with verified gitleaks `8.24.2` | Passed; 5 commits and approximately 1.93 MB scanned, 0 leaks. |
| Sensitive filenames | `git ls-files` filtered for env, credential, secret and private-key names | No versioned sensitive file. |
| Personal paths and private data | Tree search plus history search for concrete home paths, private contacts and customer markers | No author-specific home path, customer data or undisclosed credential found. Generic adversarial fixtures are fictitious and covered by `.gitleaks.toml`. |
| Author identity | `git shortlog -sne --all` | One consistent author identity across all commits. |
| Provenance | Initial extraction commit, README and notices | The code was extracted from the author's `ia` repository without importing its history; the relationship is stated publicly. |
| Project license | `LICENSE` | MIT, copyright Anderson Moreira Alves, 2026. |
| Runtime and transitive licenses | `package-lock.json` metadata | Apache-2.0, MIT, BSD-3-Clause, ISC and the declared BSD/GPL alternative for `node-forge`; no blocked license detected for the selected dependency graph. |
| Attribution | `THIRD_PARTY_NOTICES.md` | Sandbox Runtime attribution and full Apache-2.0 text present; CI tools documented. |
| Dependency advisories | `npm audit --audit-level=high` | Passed; 0 vulnerabilities. |
| Public independence | Demo test with an empty `PATH` and no credentials | Passed; 0 external calls and no dependency on `ia`. |

## Reviewed findings

### Expected security fixtures

The test suite intentionally contains fictitious tokens, passwords, private-key markers and generic
home paths to prove sanitization and sandbox behavior. The allowlist is narrowly scoped to those
known fixtures, and gitleaks completed with no residual finding.

### Public contact and authorship

Git commit metadata contains the author's contact identity. It is consistent with the copyright
holder and is treated as deliberate authorship metadata, not an accidental data leak.

### Historical relationship with `ia`

The README links to `andersonmalves/ia`, which may remain private. The Prosa build, test suite and
public demo do not read or clone it. The reference is provenance only and does not expose private
content.

## Gate conditions

Publication remains blocked if any of these becomes true after this audit:

- gitleaks or dependency audit fails;
- a new author, personal path, customer datum or credential appears;
- a public claim cannot be reproduced from the repository alone;
- `LICENSE` or `THIRD_PARTY_NOTICES.md` is removed or contradicted;
- the final hermetic verification or required GitHub Actions runs fail.
