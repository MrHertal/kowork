# Kowork

> **Work in progress** — Kowork is under active development and not yet ready for use. Features are incomplete and may change or break.

Open-source collaborative AI application. Delegate tasks to AI agents, review results, and manage parallel workflows.

## Structure

- `packages/app` — React web application (Kowork UI)
- `packages/electron` — Electron desktop shell
- `packages/web` — Documentation site
- `opencode/` — Git submodule, OpenCode fork used as AI sidecar server

## Prerequisites

- **Node 24** — see `.nvmrc` (e.g. via `nvm`)
- **pnpm** — pinned in `package.json`; `corepack enable` provides the right version
- **Bun** — required by the OpenCode sidecar (`curl -fsSL https://bun.sh/install | bash`)

## Setup

Clone with the `opencode/` submodule:

```bash
git clone --recurse-submodules <repo-url>
cd kowork
# if you already cloned without --recurse-submodules:
git submodule update --init --recursive
```

Install dependencies:

```bash
nvm use            # Node 24
corepack enable    # pinned pnpm
pnpm install       # JS workspaces

cd opencode        # OpenCode sidecar deps (needs Bun)
bun install
cd ..
```

## Running

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

The same script checks an unpacked packaged app when given its runtime directory
and Electron executable:

```bash
cd packages/electron
pnpm run smoke:runtime -- "<app-runtime-dir>" "<app-electron-executable>"
```
