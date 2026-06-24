# Kowork

> **Work in progress** — Kowork is under active development and not yet ready for use. Features are incomplete and may change or break.

Open-source collaborative AI application. Delegate tasks to AI agents, review results, and manage parallel workflows.

## Structure

- `packages/app` — React web application (Kowork UI)
- `packages/electron` — Electron desktop shell
- `packages/web` — Documentation site
- `opencode/` — Git submodule, OpenCode fork used as AI sidecar server

## Setup

```bash
nvm use
pnpm install
```

The OpenCode sidecar requires Bun:

```bash
cd opencode
bun install
bun script/build-node.ts
```
