# Kowork Agent Guidelines

Kowork is an open-source alternative to Claude Cowork: an Electron desktop app for **non-technical users**, built with **React** and **shadcn/ui**. It runs a customized [OpenCode](./opencode/) binary as a sidecar.

## Priorities

1. Preserve Kowork's non-technical user experience and terminology.
2. Treat OpenCode as the source of truth for client/server behavior and protocol details.
3. Keep the Electron and browser builds working when changing shared app code.
4. Do not edit generated UI components; adapt them through composition, `className`, or CSS.

## Repository Map

| Path                 | Purpose                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------ |
| `packages/app/`      | Shared React application, including the standalone browser build                           |
| `packages/electron/` | Electron main process, preload, and desktop renderer entry point                           |
| `packages/web/`      | Placeholder for the future static landing page and documentation site; not yet implemented |
| `opencode/`          | OpenCode fork submodule used for the sidecar and as a reference implementation             |
| `.github/workflows/` | CI: PR checks (`check.yml`) and the manual release pipeline (`release.yml`)                |
| `CONTRIBUTING.md`    | Contributor guide: setup, checks, conventions, translations, PR expectations               |
| `SECURITY.md`        | Threat model and vulnerability reporting                                                   |

`packages/web/` is not the browser build of `packages/app/`.

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

## App Build Targets

The React app has two hosts:

| Target   | Entry point                                 | Shell                                           |
| -------- | ------------------------------------------- | ----------------------------------------------- |
| Electron | `packages/electron/src/renderer/index.html` | `BrowserWindow` with native IPC and the sidecar |
| Browser  | `packages/app/index.html`                   | Standard web browser                            |

For HTML-level changes:

- Add web-only concerns such as social metadata, manifests, and PWA configuration only to `packages/app/index.html`.
- Add shared concerns such as charset, viewport, title, theme color, and theme preload to both entry points.

## Terminology and Translations

Code and translation keys use OpenCode's technical concepts. User-facing values use Kowork's localized terminology.

| Technical concept                                | English   | French     | German       | Spanish (Latin America) | Spanish (Spain) | Chinese (Simplified) | Hindi   | Portuguese (Brazil) |
| ------------------------------------------------ | --------- | ---------- | ------------ | ----------------------- | --------------- | -------------------- | ------- | ------------------- |
| Session                                          | Task      | Tâche      | Aufgabe      | Tarea                   | Tarea           | 任务                 | कार्य   | Tarefa              |
| Child session                                    | Subtask   | Sous-tâche | Unteraufgabe | Subtarea                | Subtarea        | 子任务               | उपकार्य | Subtarefa           |
| Workspace, project, or working/session directory | Folder    | Dossier    | Ordner       | Carpeta                 | Carpeta         | 文件夹               | फ़ोल्डर | Pasta               |
| MCP server                                       | Connector | Connecteur | Konnektor    | Conector                | Conector        | 连接器               | कनेक्टर | Conector            |
| Skill                                            | Skill     | Compétence | Skill        | Habilidad               | Skill           | 技能                 | स्किल   | Habilidade          |

Apply these rules in `packages/app/messages/*.json`:

- Keep keys technical, stable, and unlocalized: use concepts such as `session`, `directory`, `mcp`, and `skill`.
- Keep values user-facing and localized. Technical terms may appear when configuration or interoperability requires precision. Otherwise, do not expose `session`, `child session`, `workspace`, `project`, or `working directory` when a Kowork term applies.
- In advanced connector configuration, explain once that a connector connects to an MCP server, then use `connector` as the primary term.
- Before adding a locale, add its terminology to the table above and define every listed concept.
- Follow the locale's grammar and pluralization while retaining the defined terminology.

## React and UI

- Do not edit generated files in `packages/app/src/components/ui/` or `packages/app/src/components/ai-elements/`.
- Use named imports; do not use wildcard imports.
- Use the `@/` alias for imports within `packages/app/src/` instead of relative paths.
- Use `cn()` from `@/lib/utils` for conditional class names instead of template literals or ternaries.

```tsx
// Bad
import * as React from "react";
import * as m from "@/paraglide/messages";

// Good
import { useRef, useState } from "react";
import { m } from "@/paraglide/messages";
```

## State and Reactivity

Shared server state lives in `@tanstack/react-store` instances. Components must subscribe through `useChildData(directory, selector, compare?)`, `useSyncData(selector, compare?)` within a `<SyncProvider>`, or `useStore` directly.

Never expose a context getter that returns `store.state`. A read such as `ctx.data.foo` does not subscribe and will not re-render when the store changes.

- **Select narrowly.** Immer replaces the containing subtree on mutation, so selecting all of `s.part` or `s.session` causes unrelated re-renders. Prefer `(s) => s.part[messageID] ?? emptyParts`.
- **Compare derived values.** Use `shallowArrayEqual` from `@/contexts/global-sync` or `@/contexts/sync` for arrays, or an identity comparison such as `(a, b) => a?.id === b?.id`. Keep fallbacks such as `const emptyParts: Part[] = []` at module scope for stable references.
- **Choose provider shape deliberately.** Use a `Store` when at least three consumers read different slices, when a consumer is on a hot render path such as typing, scrolling, or animation, or when imperative callbacks must read fresh state at call time (event handlers, subscriptions, after `await`). Expose `_store` for internal access plus a `useFooData(selector, compare?)` hook when consumers subscribe. Existing examples include `global-sync`, `notification`, and `permission`.
- Otherwise, use `useState` or `useReducer` and memoize the context value with `useMemo<ContextValue>(...)`. Existing examples include `server`, `settings`, `models`, `local`, and `prompt`.
- Do not migrate provider styles for consistency alone. Imperative callbacks read fresh state from `store.state`, never from React state mirrored into a ref.
- **Never assign refs during render** (`react-hooks/refs` rejects it). Child effects run before parent effects, so provider closures reading such refs observe stale values. Read from a `Store` at call time, or rebuild the context value with `useMemo` when its inputs change. Syncing a ref in `useEffect` is acceptable when every reader is post-commit (own effects, timers, event handlers). Lazy init is fine for non-React instance state such as `Map`s.

## Code Organization

- Put UI- or React-coupled primitives in `lib/`, such as `cn`, i18n, and optimistic-write scheduling.
- Put framework-independent data, string, and IO helpers in `utils/`, such as path, retry, ID, and encoding helpers.
- If a helper would make sense in a Node script without React, it belongs in `utils/`.
- Default to no comments. Add one only to explain a non-obvious constraint, invariant, workaround, or surprising behavior.

## Verification

Run the narrowest check that covers the change:

- Electron and its referenced React app: `pnpm typecheck`
- React app only: `pnpm --filter @kowork/app typecheck`
- Tests: `pnpm test`, or scoped to one package: `pnpm --filter @kowork/app test`
- Lint the React app: `pnpm lint` (auto-fix: `pnpm lint:fix`)

Before typechecking the app, regenerate affected artifacts:

- After route changes: `pnpm --filter @kowork/app exec npx @tanstack/router-cli generate`
- After translation changes: `pnpm --filter @kowork/app exec npx @inlang/paraglide-js compile --project ./project.inlang`

Run repository-wide hygiene commands only when explicitly requested:

- Format the tree: `pnpm prettier . --write`
- Sort message catalogs: `pnpm --filter @kowork/app messages:sort`

## Testing

Tests use Vitest and are colocated as `*.test.ts(x)` next to the source.

- Test the real implementation; avoid mocks except at boundaries (the OpenCode SDK client, Electron APIs, network). Do not duplicate logic into tests.
- Node environment by default. React component tests opt into jsdom with a `// @vitest-environment jsdom` docblock on the first line and use `@testing-library/react` with `@testing-library/user-event`.
- Keep Vitest `globals` off; import `describe`/`it`/`expect` from `vitest`. jest-dom matchers and DOM cleanup are registered in `packages/app/src/test-setup.ts`.
- For files with `@opencode-ref` headers: port the upstream `*.test.ts` when one exists (e.g. `contexts/global-sync/*` ↔ `opencode/packages/app/src/context/global-sync/`), adapting `bun:test` imports to `vitest`. Ported tests verify the port and protect future backports.

## Commits

- Branch names are short lowercase kebab-case describing the task, such as `lint-fixes` or `test-scaffolding`, with no prefix conventions.
- Commit messages are short lowercase imperative summaries, such as `add portuguese language`. PRs are squash-merged, so the PR title becomes the commit message.
