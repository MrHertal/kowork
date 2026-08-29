# @kowork/api Agent Guidelines

Backend Cloudflare Workers for Kowork — plain Wrangler, no framework. Commands, deployment, and the add-worker procedure live in [README.md](README.md); repository-wide rules live in the root `AGENTS.md`.

## Rules

- Plain Workers: a default export with a `fetch` handler (`ExportedHandler`). Do not add a framework dependency.
- One worker = one `wrangler.<name>.jsonc` at the package root + one `src/<name>/` entry directory. Follow the add-worker procedure in [README.md](README.md), including the `package.json` scripts and the `api.yml` deploy step.
- Secrets go through `wrangler secret` — never in `wrangler.*.jsonc` or source. Custom domains are declared in the worker's config with `custom_domain: true` — never attach them manually in the Cloudflare dashboard.
- Share code between workers through plain modules under `src/`. Tests are colocated `*.test.ts`.
