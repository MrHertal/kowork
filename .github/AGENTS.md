# GitHub Workflow Conventions

Workflows in `.github/workflows/` follow shared conventions:

- Top-level key order: `name`, `run-name`, `on`, `permissions`, `env`, `concurrency`, `jobs`.
- Every workflow declares explicit least-privilege `permissions` (`contents: read` unless more is needed).
- Concurrency groups use `${{ github.workflow }}-${{ github.ref }}`; `release.yml` keeps the global group `release` to serialize releases.
- Pin actions by SHA with a version comment matching the tag the SHA resolves to: the moving major tag (`# v7`), or the exact tag (`# v3.0.1`) when the pin intentionally lags the major. Dependabot updates pins weekly.
- Name every `run` step with a short imperative sentence-case name; leave standard setup `uses:` steps (checkout, pnpm, node) anonymous.
