# Kowork architecture

Kowork is a desktop app for non-technical users. The shared React UI runs in two hosts: Electron and a standalone browser build. The desktop host runs a customized OpenCode binary as a sidecar. The website and hosted API are separate packages.

## Runtime map

| Part                 | Responsibility                                                        | Entry point or reference                                           |
| -------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `packages/app/`      | Shared React UI, routes, state, and translations                      | `src/main.tsx`, [package README](packages/app/README.md)           |
| `packages/electron/` | Desktop process, preload bridge, sidecar lifecycle, and packaging     | `src/main/index.ts`, [package README](packages/electron/README.md) |
| `opencode/`          | Customized sidecar and behavioral reference for its protocol          | [OpenCode integration rules](AGENTS.md#opencode-integration)       |
| `packages/web/`      | Public website and documentation                                      | [package README](packages/web/README.md)                           |
| `packages/api/`      | Hosted support endpoints, currently including an OAuth callback relay | [package README](packages/api/README.md)                           |

The browser build starts from `packages/app/index.html`. Electron starts from `packages/electron/src/renderer/index.html` and renders the same `@kowork/app` UI. The browser build uses the OpenCode HTTP API directly; the desktop build also has native capabilities through Electron's typed preload bridge. `packages/web/` is the public website, not the browser build of the app.

## Boundaries to preserve

- Keep product UI and shared app behavior in `packages/app/`. Keep desktop-only capabilities in `packages/electron/`. Changes to shared UI must work in both hosts.
- Route renderer-to-main capabilities through `packages/electron/src/preload/` and handlers in `src/main/ipc.ts`. Do not expose raw Electron IPC to the renderer. See [Electron rules](packages/electron/AGENTS.md).
- Before changing OpenCode client, protocol, session, permission, IPC, or sidecar behavior, inspect the corresponding upstream implementation. Treat OpenCode as the behavioral source of truth and retain `@opencode-ref` headers for ported code. See [repository rules](AGENTS.md#opencode-integration).
- Keep the public website in `packages/web/` and hosted API workers in `packages/api/`. Each package has its own deployment path and [local rules](AGENTS.md#repository-map).
- Keep generated route, translation, and UI component files out of hand edits. See [app rules](packages/app/AGENTS.md#generated-files).

## Verification

`./scripts/check` runs the same checks as CI's main check job: translation generation, typechecking, lint, unit tests, skill runtime checks, and app and website builds. `./scripts/check browser` runs the separate browser smoke test job; install Playwright Chromium first as described in the [app README](packages/app/README.md#browser-smoke-tests).

For an ordinary change, start with the narrowest relevant package check from [AGENTS.md](AGENTS.md#verification), then run `./scripts/check` before handing over a substantial cross-package change. CI is the final gate. No custom architecture checker exists yet; add one when a concrete boundary violation is worth detecting mechanically.
