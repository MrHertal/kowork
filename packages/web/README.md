# @kowork/web

Landing page (official website) for Kowork, built with [Astro](https://astro.build), React islands, and Tailwind CSS 4. Deployed to Cloudflare Workers static assets.

## Commands

| Command           | Action                                   |
| ----------------- | ---------------------------------------- |
| `pnpm dev`        | Start the dev server at `localhost:4321` |
| `pnpm build`      | Build the static site to `./dist/`       |
| `pnpm preview`    | Preview the production build locally     |
| `pnpm typecheck`  | Run `astro check`                        |
| `pnpm run deploy` | Build and deploy with Wrangler           |

Run them from this directory or from the repo root with `pnpm --filter @kowork/web <command>`. The `run` in `pnpm run deploy` is required: plain `pnpm deploy` resolves to pnpm's built-in deploy command, not the script.

## Deployment

The site is a fully static Astro build (`dist/`) served as [Cloudflare Workers static assets](https://developers.cloudflare.com/workers/static-assets/), configured in `wrangler.jsonc`. No SSR adapter is used.

- **CI**: `.github/workflows/web.yml` deploys on every push to `main` that touches `packages/web/**` (or manually via workflow dispatch). The deploy job is gated on the `CLOUDFLARE_DEPLOY` repository variable, so enabling it requires:
  - `CLOUDFLARE_API_TOKEN` secret — an API token with account _Workers Scripts: Edit_ plus, on the `getkowork.com` zone, _Workers Routes: Edit_ and _DNS: Edit_ (so deploys can manage the custom domain record)
  - `CLOUDFLARE_ACCOUNT_ID` secret — the Cloudflare account ID
  - `CLOUDFLARE_DEPLOY` variable — set to `true` (Settings → Secrets and variables → Actions → Variables)
- **Manual**: `pnpm --filter @kowork/web run deploy` after `pnpm --filter @kowork/web exec wrangler login`.

The Worker responds in production at <https://getkowork.com>. The apex is attached as a [Workers custom domain](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) declared in `wrangler.jsonc` (`routes` with `custom_domain: true`), so `wrangler deploy` manages DNS and certificates automatically — do not attach it manually in the dashboard. The `workers.dev` subdomain stays disabled (wrangler's default on first deploy when routes are declared); set `"workers_dev": true` in `wrangler.jsonc` if a preview URL is ever needed. `www.getkowork.com` 301-redirects to the apex via a placeholder DNS record plus a Redirect Rule in the zone (also set as `site` in `astro.config.mjs`, so canonical/OG URLs assume it).
