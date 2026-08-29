# @kowork/api

Backend infrastructure for Kowork: hosted API routes that support the app but are not part of the user-facing website (the first use case is an OAuth callback relay for connectors like Canva). Built as plain Cloudflare Workers with Wrangler — no framework. Runs on the `kowork.dev` side of Kowork's domains, keeping technical infra separate from the marketing site on `getkowork.com`.

## Commands

| Command           | Action                                         |
| ----------------- | ---------------------------------------------- |
| `pnpm dev`        | Start the local dev server at `localhost:8787` |
| `pnpm test`       | Run the Vitest suite                           |
| `pnpm typecheck`  | Run `tsc --noEmit`                             |
| `pnpm run deploy` | Deploy with Wrangler                           |

Run them from this directory or from the repo root with `pnpm --filter @kowork/api <command>`. The `run` in `pnpm run deploy` is required: plain `pnpm deploy` resolves to pnpm's built-in deploy command, not the script.

## Structure

This package hosts every backend worker. Each worker gets its own Wrangler config at the package root and its own entry directory under `src/`; the config alone decides the worker's name and domain, so URLs are never tied to the workspace name.

```
packages/api/
├── wrangler.jsonc          # kowork-api (default worker)
├── wrangler.<name>.jsonc   # one per additional worker
└── src/
    ├── api/                # entry point of kowork-api
    └── <name>/             # one directory per worker
```

To add a worker:

1. Create its entry point at `src/<name>/index.ts` (colocate tests as `*.test.ts`, run by `pnpm test`).
2. Add `wrangler.<name>.jsonc` with its own `name`, `main`, and `routes`.
3. Add matching scripts to `package.json`: `"deploy:<name>": "wrangler deploy -c wrangler.<name>.jsonc"` and, for local development, `"dev:<name>": "wrangler dev -c wrangler.<name>.jsonc"`.
4. In `.github/workflows/api.yml`, switch the deploy step to an explicit multi-command form so each config deploys:

   ```yaml
   with:
     # ...
     command: |
       deploy
       deploy -c wrangler.<name>.jsonc
   ```

Share code between workers through plain modules under `src/` (e.g. a future `src/router.ts`) — worker entries import from sibling directories.

If several endpoints ever only differ by hostname and share all their code and secrets, a single worker can instead attach multiple custom domains in its `routes` array and dispatch on `url.hostname`. Prefer separate workers when you want separate secrets, limits, or deploy cadence.

## Deployment

The default worker `kowork-api` serves `api.kowork.dev`, declared as a [Workers custom domain](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) (`routes` with `custom_domain: true` in `wrangler.jsonc`), so `wrangler deploy` manages DNS and certificates automatically — do not attach it manually in the dashboard. It also stays reachable at its `workers.dev` URL (`https://kowork-api.<account-subdomain>.workers.dev`).

Current routes:

| Route               | Behavior                                                                                                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/health`           | `200 ok`                                                                                                                                                                            |
| `/mcp/oauth/callback` | `302` to `http://127.0.0.1:19876/mcp/oauth/callback` with the query string preserved — OAuth callback relay for connectors whose provider requires an HTTPS redirect URI (e.g. Canva) |

The relay mirrors `OAUTH_CALLBACK_PORT`/`OAUTH_CALLBACK_PATH` from `opencode/packages/opencode/src/mcp/oauth-provider.ts`. Authorization codes transit in the callback URL, so invocation logs (which record request URLs) are disabled in `wrangler.jsonc` and the worker never logs request URLs.

- **CI**: `.github/workflows/api.yml` deploys on every push to `main` that touches `packages/api/**` or the workflow file itself (or manually via workflow dispatch). It requires two repository secrets (Settings → Secrets and variables → Actions):
  - `CLOUDFLARE_API_TOKEN` — an API token with account _Workers Scripts: Edit_ plus, on the `kowork.dev` zone, _Workers Routes: Edit_ and _DNS: Edit_ (so deploys can manage the custom domain record)
  - `CLOUDFLARE_ACCOUNT_ID` — the Cloudflare account ID
- **Manual**: `pnpm --filter @kowork/api run deploy` after `pnpm --filter @kowork/api exec wrangler login`.
