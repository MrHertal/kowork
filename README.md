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

### Office document skills (optional)

The built-in document skills (docx, pdf, xlsx, pptx) are always available to the
agent, but they run on a bundled Python/Node "runtime pack" that packaged builds
include automatically. To exercise these skills in dev, build the pack once:

```bash
pnpm --filter @kowork/electron build:runtime
```

This downloads a standalone Python and the document libraries (a few hundred MB,
for your current platform only). Skip it if you're not testing document
handling — the skills still load, they just can't execute without the pack.
