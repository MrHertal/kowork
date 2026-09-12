# @kowork/app

React web application — the Kowork UI. Runs in two hosts: the Electron desktop shell and a standalone browser build.

## Commands

| Command                | Action                                    |
| ---------------------- | ----------------------------------------- |
| `pnpm dev`             | Start the Vite dev server                 |
| `pnpm build`           | Build the browser app to `./dist/`        |
| `pnpm preview`         | Preview the production build locally      |
| `pnpm test`            | Run the Vitest suite                      |
| `pnpm test:e2e`        | Run the Playwright browser smoke tests    |
| `pnpm test:e2e:ui`     | Open Playwright's interactive test runner |
| `pnpm test:e2e:report` | Open the latest Playwright HTML report    |
| `pnpm lint`            | Lint with ESLint (`lint:fix` to auto-fix) |
| `pnpm typecheck`       | Typecheck the app and browser tests       |

Run them from this directory or from the repo root with `pnpm --filter @kowork/app <command>`.

## Browser smoke tests

Install Playwright's Chromium build once before the first local run:

```sh
pnpm --filter @kowork/app exec playwright install chromium
```

The initial scenario opens the standalone browser app against a local mock of the OpenCode HTTP API. It verifies that a user can enter a plain message and that Kowork sends the expected agent, model, and text parts while rendering the optimistic user message.

This first layer intentionally does not start Electron or the OpenCode sidecar, call a model, stream an assistant response, run a skill, or create a PDF. Those behaviors can be added as separate scenarios after this smoke test is stable.

## Build targets

The app has two entry points: `index.html` at the package root for the standalone browser build, and `packages/electron/src/renderer/index.html` for the Electron renderer. Web-only concerns (social metadata, manifest, PWA) go in the former; shared concerns (charset, viewport, title, theme) go in both.
