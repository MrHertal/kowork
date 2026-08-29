# Kowork Agent Guidelines

Kowork is an open-source alternative to Claude Cowork: an Electron desktop app for **non-technical users**, built with **React** and **shadcn/ui**. It runs a customized [OpenCode](./opencode/) binary as a sidecar.

## Priorities

1. Preserve Kowork's non-technical user experience and terminology.
2. Treat OpenCode as the source of truth for client/server behavior and protocol details.
3. Keep the Electron and browser builds working when changing shared app code.

## Orientation

### Repository Map

| Path                 | Purpose                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| `packages/app/`      | Shared React application, including the standalone browser build                                          |
| `packages/electron/` | Electron main process, preload, and desktop renderer entry point                                          |
| `packages/web/`      | Landing page (Astro + React islands + Tailwind 4), deployed to Cloudflare Workers static assets           |
| `packages/api/`      | Backend Cloudflare workers; plain wrangler, one `wrangler.<name>.jsonc` + `src/<name>/` per worker        |
| `opencode/`          | OpenCode fork submodule used for the sidecar and as a reference implementation                            |
| `.github/workflows/` | CI: PR checks (`check.yml`), release pipeline (`release.yml`), and web/api deploys (`web.yml`, `api.yml`) |
| `CONTRIBUTING.md`    | Contributor guide: setup, checks, conventions, translations, PR expectations                              |
| `SECURITY.md`        | Threat model and vulnerability reporting                                                                  |

- `packages/web/` is not the browser build of `packages/app/`.
- Each package under `packages/` has its own README with commands and structure notes, and its own `AGENTS.md` with binding rules — consult both before working in that package.
- CI workflow conventions live in `.github/AGENTS.md`.

### App Build Targets

The React app has two hosts:

| Target   | Entry point                                 | Shell                                           |
| -------- | ------------------------------------------- | ----------------------------------------------- |
| Electron | `packages/electron/src/renderer/index.html` | `BrowserWindow` with native IPC and the sidecar |
| Browser  | `packages/app/index.html`                   | Standard web browser                            |

For HTML-level changes:

- Add web-only concerns such as social metadata, manifests, and PWA configuration only to `packages/app/index.html`.
- Add shared concerns such as charset, viewport, title, theme color, and theme preload to both entry points.

## OpenCode Integration

Before changing any interaction with the OpenCode client, sidecar, or protocol, **first inspect the corresponding implementation in OpenCode's Electron app**. This includes prompts, events, sessions, permissions, IPC, and sidecar lifecycle behavior.

OpenCode's desktop app is an IDE for developers built with SolidJS and its own UI library. Use it as the behavioral reference, not as a visual or component reference for Kowork.

| Concern                   | Reference path                            |
| ------------------------- | ----------------------------------------- |
| Electron main process     | `opencode/packages/desktop/src/main/`     |
| Electron preload and IPC  | `opencode/packages/desktop/src/preload/`  |
| Renderer behavior         | `opencode/packages/desktop/src/renderer/` |
| Client SDK                | `opencode/packages/sdk/`                  |
| Shared types and protocol | `opencode/packages/opencode/src/`         |

### Upstream References

Files ported or derived from OpenCode must carry one `@opencode-ref` header per upstream source. Preserve existing headers, add multiple headers when needed, and omit them from Kowork-only files. Search for `@opencode-ref:` when identifying code to backport.

```ts
// @opencode-ref: opencode/packages/app/src/context/global-sync.tsx
```

## Workflow

### Verification

**Run the narrowest check that covers the change:**

- All workspaces (electron, app, web, api): `pnpm typecheck`
- Electron and its referenced React app: `pnpm --filter @kowork/electron typecheck`
- React app only: `pnpm --filter @kowork/app typecheck`
- Web site: `pnpm --filter @kowork/web build`
- Tests: `pnpm test`, or scoped to one package: `pnpm --filter @kowork/app test`
- Lint the React app: `pnpm lint` (auto-fix: `pnpm lint:fix`)

**Before typechecking the app, regenerate affected artifacts:**

- After route changes: `pnpm --filter @kowork/app exec npx @tanstack/router-cli generate`
- After translation changes: `pnpm --filter @kowork/app exec npx @inlang/paraglide-js compile --project ./project.inlang`

**Run repository-wide hygiene commands only when explicitly requested:**

- Format the tree: `pnpm format`
- Sort message catalogs: `pnpm --filter @kowork/app messages:sort`

### Testing

Tests use Vitest and are colocated as `*.test.ts(x)` next to the source.

- Test the real implementation; avoid mocks except at boundaries (the OpenCode SDK client, Electron APIs, network). Do not duplicate logic into tests.
- Node environment by default. React component tests opt into jsdom with a `// @vitest-environment jsdom` docblock on the first line and use `@testing-library/react` with `@testing-library/user-event`.
- Keep Vitest `globals` off; import `describe`/`it`/`expect` from `vitest`. jest-dom matchers and DOM cleanup are registered in `packages/app/src/test-setup.ts`.
- For files with `@opencode-ref` headers: port the upstream `*.test.ts` when one exists (e.g. `contexts/global-sync/*` ↔ `opencode/packages/app/src/context/global-sync/`), adapting `bun:test` imports to `vitest`. Ported tests verify the port and protect future backports.

### Commits

- Branch names are short lowercase kebab-case describing the task, such as `lint-fixes` or `test-scaffolding`, with no prefix conventions.
- Commit messages are short lowercase imperative summaries, such as `add portuguese language`. PRs are squash-merged, so the PR title becomes the commit message.
