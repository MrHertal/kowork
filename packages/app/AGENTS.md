# @kowork/app Agent Guidelines

Shared React application — runs in the Electron desktop shell and as a standalone browser build. Commands and dev setup live in [README.md](README.md); repository-wide rules live in the root `AGENTS.md`.

## Layout

- `src/components/` — feature component directories (`session/`, `settings/`, `sidebar-left/`, `sidebar-right/`, `header/`, `prompt-input/`) plus top-level components. `ui/` and `ai-elements/` are generated.
- `src/contexts/` — state providers; see State and Reactivity.
- `src/routes/` — TanStack Router file-based routes; `src/pages/` — page components.
- `src/hooks/`, `src/lib/`, `src/utils/` — see Code Organization.
- `messages/` — translation catalogs; `src/paraglide/` — compiled output.

## Generated Files

Never edit generated files by hand:

- `src/routeTree.gen.ts` — TanStack Router Vite plugin
- `src/paraglide/` — inlang Paraglide compile
- `src/components/ui/`, `src/components/ai-elements/` — shadcn/ui and AI Elements

Regeneration commands live in the root `AGENTS.md` → Workflow → Verification.

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

- Do not edit generated files in `packages/app/src/components/ui/` or `packages/app/src/components/ai-elements/`; adapt them through composition, `className`, or CSS.
- Use named imports; do not use wildcard imports.
- Use the `@/` alias for imports within `packages/app/src/` instead of relative paths.
- Use `cn()` from `@/lib/utils` for conditional class names instead of template literals or ternaries.

## State and Reactivity

Shared server state lives in `@tanstack/react-store` instances. Components must subscribe through `useChildData(directory, selector, compare?)`, `useSyncData(selector, compare?)` within a `<SyncProvider>`, or `useStore` directly.

Never expose a context getter that returns `store.state`. A read such as `ctx.data.foo` does not subscribe and will not re-render when the store changes.

- **Select narrowly.** Immer replaces the containing subtree on mutation, so selecting all of `s.part` or `s.session` causes unrelated re-renders. Prefer `(s) => s.part[messageID] ?? emptyParts`.
- **Compare derived values.** Use `shallowArrayEqual` from `@/contexts/global-sync` or `@/contexts/sync` for arrays, or an identity comparison such as `(a, b) => a?.id === b?.id`. Keep fallbacks such as `const emptyParts: Part[] = []` at module scope for stable references.
- **Choose provider shape deliberately.** Use a `Store` when at least three consumers read different slices, when a consumer is on a hot render path such as typing, scrolling, or animation, or when imperative callbacks must read fresh state at call time (event handlers, subscriptions, after `await`). Expose `_store` for internal access plus a `useFooData(selector, compare?)` hook when consumers subscribe. Existing examples include `global-sync`, `notification`, and `permission`.
- **Otherwise, use `useState` or `useReducer`** and memoize the context value with `useMemo<ContextValue>(...)`. Existing examples include `server`, `settings`, `models`, `local`, and `prompt`.
- **Do not migrate provider styles for consistency alone.** Imperative callbacks read fresh state from `store.state`, never from React state mirrored into a ref.
- **Never assign refs during render** (`react-hooks/refs` rejects it). Child effects run before parent effects, so provider closures reading such refs observe stale values. Syncing a ref in `useEffect` is acceptable when every reader is post-commit (own effects, timers, event handlers). Lazy init is fine for non-React instance state such as `Map`s.

## Code Organization

- Put UI- or React-coupled primitives in `lib/`, such as `cn`, i18n, and optimistic-write scheduling.
- Put framework-independent data, string, and IO helpers in `utils/`, such as path, retry, ID, and encoding helpers.
- If a helper would make sense in a Node script without React, it belongs in `utils/`.
- Default to no comments. Add one only to explain a non-obvious constraint, invariant, workaround, or surprising behavior.
