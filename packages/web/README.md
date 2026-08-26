# @kowork/web

Official website and documentation for Kowork, built with [Astro](https://astro.build), [Starlight](https://starlight.astro.build/), React islands, and Tailwind CSS 4. Deployed to Cloudflare Workers static assets with a Worker route for platform downloads.

## Commands

| Command           | Action                                   |
| ----------------- | ---------------------------------------- |
| `pnpm dev`        | Start the dev server at `localhost:4321` |
| `pnpm build`      | Build the static site to `./dist/`       |
| `pnpm preview`    | Preview the production build locally     |
| `pnpm typecheck`  | Run `astro check`                        |
| `pnpm run deploy` | Build and deploy with Wrangler           |

Run them from this directory or from the repo root with `pnpm --filter @kowork/web <command>`. The `run` in `pnpm run deploy` is required: plain `pnpm deploy` resolves to pnpm's built-in deploy command, not the script.

## Documentation

Starlight documentation is served from <https://getkowork.com/docs/> as part of the same Astro site and Cloudflare deployment as the landing page. Add documentation pages under `src/content/docs/docs/`; the second `docs` directory provides the `/docs/` URL prefix.

## Deployment

The Astro site remains a fully static build (`dist/`) served as [Cloudflare Workers static assets](https://developers.cloudflare.com/workers/static-assets/), configured in `wrangler.jsonc`. No SSR adapter is used. The Worker entry point handles `/download`, redirecting macOS and Windows visitors to the corresponding asset from the latest GitHub release and falling back to the release page on unsupported platforms. All other requests are served by the static asset binding.

- **CI**: `.github/workflows/web.yml` deploys on every push to `main` that touches `packages/web/**` (or manually via workflow dispatch). It requires two repository secrets (Settings → Secrets and variables → Actions):
  - `CLOUDFLARE_API_TOKEN` — an API token with account _Workers Scripts: Edit_ plus, on the `getkowork.com` zone, _Workers Routes: Edit_ and _DNS: Edit_ (so deploys can manage the custom domain record)
  - `CLOUDFLARE_ACCOUNT_ID` — the Cloudflare account ID
- **Manual**: `pnpm --filter @kowork/web run deploy` after `pnpm --filter @kowork/web exec wrangler login`.

To preview the complete deployment locally, including `/download`, first run `pnpm --filter @kowork/web build`, then `pnpm --filter @kowork/web exec wrangler dev`. The regular `pnpm dev` command only starts Astro's static-site development server.

The Worker responds in production at <https://getkowork.com>. The apex is attached as a [Workers custom domain](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/) declared in `wrangler.jsonc` (`routes` with `custom_domain: true`), so `wrangler deploy` manages DNS and certificates automatically — do not attach it manually in the dashboard. The `workers.dev` subdomain stays disabled (wrangler's default on first deploy when routes are declared); set `"workers_dev": true` in `wrangler.jsonc` if a preview URL is ever needed. `www.getkowork.com` 301-redirects to the apex via a placeholder DNS record plus a Redirect Rule in the zone (also set as `site` in `astro.config.mjs`, so canonical/OG URLs assume it).
