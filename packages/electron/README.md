# @kowork/electron

Electron desktop shell for Kowork. Spawns the OpenCode sidecar server and hosts the `@kowork/app` UI.

## Commands

| Command          | Action                                                  |
| ---------------- | ------------------------------------------------------- |
| `pnpm dev`       | Build the sidecar and start the desktop app in dev mode |
| `pnpm build`     | Build the main, preload, and renderer bundles           |
| `pnpm test`      | Run the Vitest suite                                    |
| `pnpm typecheck` | Run `tsc -b`                                            |
| `pnpm package`   | Package the desktop app for the current platform        |

Run them from this directory or from the repo root with `pnpm --filter @kowork/electron <command>`. `pnpm package` has `:mac`, `:win`, and `:linux` variants for packaging a specific platform.

## Structure

- `src/main/` — Electron main process: window lifecycle, sidecar spawn, IPC.
- `src/preload/` — preload bridge exposed to the renderer.
- `src/renderer/` — desktop entry point hosting `@kowork/app`.
- `scripts/` — build tooling for the sidecar and document-skill runtime, plus dev/build orchestration.
