# Security policy

## Supported versions

Prosa is an alpha distributed from this repository only. Security fixes target the current
`main` branch; tags, forks and older commits are not supported.

| Version | Supported |
|---|---|
| Current `main` | Yes |
| Tags and older commits | No |

## Reporting a vulnerability

Use **Report a vulnerability** in this repository's Security tab. Do not open a public issue,
discussion or pull request with exploit details, credentials or private data.

Include the affected revision, operating system, reproduction steps, impact and the smallest
sanitized evidence needed to validate the report. Never include real secrets.

You should receive an acknowledgement within seven calendar days. This alpha does not promise a
fixed remediation deadline, bounty or support for deployment-specific incidents.

## Scope and limits

Useful reports include sandbox escape, path traversal, unsafe process execution, authorization
bypass, approval replay, artifact tampering, secret exposure and dependency compromise.

The deterministic public demo does not execute an agent or provide a production security
guarantee. A green test suite proves only the documented controls under the tested conditions.
