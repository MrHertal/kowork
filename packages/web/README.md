# @kowork/web

Landing page (official website) for Kowork, built with [Astro](https://astro.build), React islands, and Tailwind CSS 4. Deployed to Cloudflare Workers static assets.

## Commands

| Command          | Action                                   |
| ---------------- | ---------------------------------------- |
| `pnpm dev`       | Start the dev server at `localhost:4321` |
| `pnpm build`     | Build the static site to `./dist/`       |
| `pnpm preview`   | Preview the production build locally     |
| `pnpm typecheck` | Run `astro check`                        |
| `pnpm deploy`    | Build and deploy with Wrangler           |

Run them from this directory or from the repo root with `pnpm --filter @kowork/web <command>`.

## Deployment

The site is a fully static Astro build (`dist/`) served as [Cloudflare Workers static assets](https://developers.cloudflare.com/workers/static-assets/), configured in `wrangler.jsonc`. No SSR adapter is used.

- **CI**: `.github/workflows/web.yml` deploys on every push to `main` that touches `packages/web/**` (or manually via workflow dispatch). The deploy job is gated on the `CLOUDFLARE_DEPLOY` repository variable, so enabling it requires:
  - `CLOUDFLARE_API_TOKEN` secret — an API token with the _Workers Scripts: Edit_ permission
  - `CLOUDFLARE_ACCOUNT_ID` secret — the Cloudflare account ID
  - `CLOUDFLARE_DEPLOY` variable — set to `true` (Settings → Secrets and variables → Actions → Variables)
- **Manual**: `pnpm --filter @kowork/web deploy` after `pnpm exec wrangler login`.

The Worker responds at `kowork-web.<account>.workers.dev`. The production domain (planned: `getkowork.ai`) is already set as `site` in `astro.config.mjs`, so canonical/OG URLs assume it — attach the custom domain in the Cloudflare dashboard when ready (if the plan changes, update `site` too).
