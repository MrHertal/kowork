# @kowork/api Agent Guidelines

Backend Cloudflare Workers for Kowork — plain Wrangler, no framework. Commands, deployment, and the add-worker procedure live in [README.md](README.md); repository-wide rules live in the root `AGENTS.md`.

## Rules

- Plain Workers: a default export with a `fetch` handler (`ExportedHandler`). Do not add a framework dependency.
- One worker = one Wrangler config at the package root + one `src/<name>/` entry directory: `wrangler.jsonc` for the default worker, `wrangler.<name>.jsonc` for each additional one. Follow the add-worker procedure in [README.md](README.md), including the `package.json` scripts and the `api.yml` deploy step.
- Secrets go through `wrangler secret` — never in `wrangler.*.jsonc` or source. Custom domains are declared in the worker's config with `custom_domain: true` — never attach them manually in the Cloudflare dashboard.
- Never log request URLs in worker code, and keep `observability.logs.invocation_logs: false` on workers that relay OAuth callbacks (`/mcp/oauth/callback`) — authorization codes transit in query strings.
- Share code between workers through plain modules under `src/`. Tests are colocated `*.test.ts`.
