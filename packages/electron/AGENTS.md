# @kowork/electron Agent Guidelines

Electron desktop shell — spawns the OpenCode sidecar and hosts the `@kowork/app` UI. Commands and packaging live in [README.md](README.md); repository-wide rules live in the root `AGENTS.md`.

## Process Model

- `src/main/` — Electron main process: window lifecycle (`windows.ts`), sidecar (`sidecar.ts`), persistence (`store.ts`), auto-updates (`updater.ts`), IPC handlers (`ipc.ts`).
- `src/preload/` — the typed bridge exposed to the renderer as `window.api`.
- `src/renderer/` — desktop entry point hosting `@kowork/app`.
- `scripts/` — build/dev tooling for the sidecar and the document-skill runtime.

## Rules

- Renderer↔main communication goes only through the preload bridge. Adding a capability means three edits: the type in `src/preload/types.ts`, the implementation in `src/preload/index.ts`, and a handler in `src/main/ipc.ts`. Never expose raw `ipcRenderer` to the renderer.
- `src/main/sidecar.ts` owns the OpenCode sidecar lifecycle; changes to it follow the root `AGENTS.md` → OpenCode Integration rule.
- Tests are colocated in `src/main/` (`*.test.ts`).
