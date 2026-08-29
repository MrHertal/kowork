# @kowork/app

React web application — the Kowork UI. Runs in two hosts: the Electron desktop shell and a standalone browser build.

## Commands

| Command          | Action                                    |
| ---------------- | ----------------------------------------- |
| `pnpm dev`       | Start the Vite dev server                 |
| `pnpm build`     | Build the browser app to `./dist/`        |
| `pnpm preview`   | Preview the production build locally      |
| `pnpm test`      | Run the Vitest suite                      |
| `pnpm lint`      | Lint with ESLint (`lint:fix` to auto-fix) |
| `pnpm typecheck` | Run `tsc -b`                              |

Run them from this directory or from the repo root with `pnpm --filter @kowork/app <command>`.

## Build targets

The app has two entry points: `index.html` at the package root for the standalone browser build, and `packages/electron/src/renderer/index.html` for the Electron renderer. Web-only concerns (social metadata, manifest, PWA) go in the former; shared concerns (charset, viewport, title, theme) go in both.
