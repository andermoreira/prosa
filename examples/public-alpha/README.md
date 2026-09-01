# Public alpha demo

This deterministic scenario shows the Prosa decision cycle without an agent binary, credentials,
paid services or network access.

```bash
node scripts/workflow/demo-public-alpha.cjs
node --test scripts/workflow/test-demo-public-alpha.cjs
```

The runner validates the example spec and step against the real Prosa schemas, verifies their
binding and then drives a fixed demonstration adapter through:

1. contract validation;
2. confined execution over fictitious data;
3. an automated gate;
4. read-only review;
5. an explicit simulated human decision; and
6. a sanitized JSON report.

The trust boundary is intentionally narrow: the runner reads only the two versioned fixtures and
writes only its report to standard output. It does not spawn an agent, inspect the caller
environment, access Git state or open a network connection.

This is a learning and evaluation path for the alpha. Production runs use the adapters, worktrees,
OS sandbox and persisted evidence described in [`docs/workflows/automated-spec-pipeline.md`](../../docs/workflows/automated-spec-pipeline.md).
