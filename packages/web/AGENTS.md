# @kowork/web Agent Guidelines

Official website and documentation for Kowork: Astro + Starlight + React islands + Tailwind CSS 4, deployed to Cloudflare Workers static assets. Commands, deployment, and CI details live in [README.md](README.md); repository-wide rules live in the root `AGENTS.md`.

## Rules

- The site is a fully static build — no SSR adapter. The only Worker code is `src/worker.ts` (the `/download` redirect); keep it minimal.
- Documentation pages go in `src/content/docs/docs/`; the second `docs` directory is intentional — it provides the `/docs/` URL prefix.
- Prefer Astro components; use React islands only where interactivity requires them.
- The apex custom domain is managed by wrangler `routes` (`custom_domain: true`) in `wrangler.jsonc` — never attach it manually in the Cloudflare dashboard.
