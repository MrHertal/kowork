# Contributing to Kowork

Thanks for your interest in contributing! The most common contributions that get merged:

- Bug fixes
- Documentation improvements
- Translations (see [Translations](#translations))
- Connector and skill improvements

UI and core product changes need a design conversation first: open an issue describing the problem and your proposal, and wait for maintainer approval before implementing. Kowork is built for non-technical users, so product decisions are deliberate.

## Repository layout

| Path                 | Purpose                                                                 |
| -------------------- | ----------------------------------------------------------------------- |
| `packages/app/`      | Shared React application, including the standalone browser build        |
| `packages/electron/` | Electron main process, preload, and desktop renderer entry point        |
| `packages/web/`      | Placeholder for the future landing page and documentation site          |
| `opencode/`          | OpenCode fork submodule used for the sidecar and as a reference         |
| `.github/workflows/` | CI: PR checks (`check.yml`) and the manual release pipeline (`release.yml`) |

## Development setup

Prerequisites:

- **Node 24** — see `.nvmrc` (e.g. via `nvm`)
- **pnpm** — pinned in `package.json`; `corepack enable` provides the right version
- **Bun** — required by the OpenCode sidecar (`curl -fsSL https://bun.sh/install | bash`)

Clone with the `opencode/` submodule:

```bash
git clone --recurse-submodules https://github.com/MrHertal/kowork.git
cd kowork
# if you already cloned without --recurse-submodules:
git submodule update --init --recursive
```

Install dependencies:

```bash
nvm use                 # Node 24
corepack enable         # pinned pnpm
pnpm install            # JS workspaces
bun install --cwd opencode  # OpenCode sidecar deps
```

Run the app:

```bash
pnpm dev
```

`pnpm dev` builds the OpenCode sidecar automatically before launching Electron.
Build it on its own with `pnpm build:sidecar`.

### Office document skills

The built-in document skills (docx, pdf, xlsx, pptx) and their embedded
Python/Node runtime are a required Kowork feature. `pnpm dev`, the Electron
preview script, and the local package scripts validate the runtime before
starting. A missing, incomplete, wrong-platform, or stale development runtime is
rebuilt automatically; packaging and packaged startup reject an invalid runtime.

The first runtime build downloads standalone Python and the document libraries
for the current platform. You can prepare or validate it explicitly with:

```bash
pnpm --filter @kowork/electron ensure:runtime
```

Run the executable smoke check against the development runtime with:

```bash
pnpm --filter @kowork/electron smoke:runtime
```

## Checks

Run the narrowest check that covers your change:

```bash
pnpm lint                            # ESLint (React app)
pnpm lint:fix                        # ESLint with auto-fix
pnpm typecheck                       # TypeScript (Electron + React app)
pnpm test                            # Vitest, all packages
pnpm --filter @kowork/app test       # Vitest, React app only
```

Regenerate affected artifacts before typechecking the app:

- After route changes: `pnpm --filter @kowork/app exec npx @tanstack/router-cli generate`
- After translation changes: `pnpm --filter @kowork/app exec npx @inlang/paraglide-js compile --project ./project.inlang`

## Project conventions

The full style and architecture rules live in [AGENTS.md](AGENTS.md). The highlights:

- **Terminology** — user-facing text uses Kowork's terms (task, subtask, folder, connector, skill), never OpenCode's technical terms (session, workspace, MCP server). See the terminology table in AGENTS.md before writing UI copy or translations.
- **React and UI** — named imports only, `@/` alias within `packages/app/src`, `cn()` for conditional classes, and no edits to generated components in `components/ui/` or `components/ai-elements/`.
- **State** — shared server state lives in `@tanstack/react-store` instances; subscribe with narrow selectors and explicit comparisons.
- **OpenCode backports** — files ported from OpenCode carry `@opencode-ref` headers, one per upstream source. Preserve them and port the upstream test when one exists.
- **Commits and branches** — short lowercase imperative commit messages (`add portuguese language`); short lowercase kebab-case branch names (`docs-v1`). PRs are squash-merged, so the PR title becomes the commit message.

## Translations

Translations live in `packages/app/messages/*.json` and are compiled with
[Paraglide JS](https://inlang.com/m/gerre34r/library-inlang-paraglideJs).

- Keys stay technical and unlocalized (`session`, `directory`, `mcp`, `skill`); values are user-facing and localized with Kowork terminology.
- The per-locale terminology is defined in the table in AGENTS.md — follow it for every listed concept.
- After editing messages, recompile: `pnpm --filter @kowork/app exec npx @inlang/paraglide-js compile --project ./project.inlang`.
- Adding a new locale means defining its terminology in the AGENTS.md table first.

## Pull requests

- Keep PRs small and focused; do not include unrelated changes.
- Reference the issue your PR addresses (`Closes #123`).
- For UI changes, include before/after screenshots or a recording.
- For logic changes, explain how you verified the fix and how a reviewer can reproduce it.
- Make sure `pnpm lint`, `pnpm typecheck`, and `pnpm test` pass before requesting review.
