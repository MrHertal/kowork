<p align="center">
  <img src="packages/app/public/favicon.svg" alt="Kowork logo" width="128" />
</p>
<h1 align="center">Kowork</h1>
<p align="center">An open-source desktop app for delegating work to AI agents.</p>
<p align="center">
  <a href="https://github.com/MrHertal/kowork/actions/workflows/check.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/MrHertal/kowork/check.yml?style=flat-square&branch=main" /></a>
  <a href="https://github.com/MrHertal/kowork/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/MrHertal/kowork?style=flat-square" /></a>
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" /></a>
</p>

<!-- Add a screenshot at .github/assets/screenshot.png and uncomment:
<p align="center">
  <img src=".github/assets/screenshot.png" alt="Kowork" width="800" />
</p>
-->

Kowork lets you hand off work to AI agents operating in folders on your computer. Describe the outcome in plain language, let the agent do the work, and review the result — no terminal required. Tasks run in parallel, so you can keep several pieces of work moving at once.

Kowork is built on top of [OpenCode](https://github.com/anomalyco/opencode), which runs as a local sidecar server.

## Download

Get the latest build from the [releases page](https://github.com/MrHertal/kowork/releases/latest):

| Platform              | Download                        |
| --------------------- | ------------------------------- |
| macOS (Apple Silicon) | `kowork-electron-mac-arm64.dmg` |
| Windows (x64)         | `kowork-electron-win-x64.exe`   |

## Features

- **Tasks, not terminals** — describe what you want done; the agent plans and executes it in a folder you choose.
- **Subtasks and parallel work** — split work into subtasks and run several tasks at the same time.
- **Connectors** — give agents access to external tools and data through MCP servers.
- **Skills** — built-in skills for Office documents (docx, pdf, xlsx, pptx), extensible with your own.
- **Eight languages** — English, French, German, Spanish (Latin America and Spain), Simplified Chinese, Hindi, and Brazilian Portuguese.

## Development

Prerequisites:

- **Node 24** — see `.nvmrc` (e.g. via `nvm`)
- **pnpm** — pinned in `package.json`; `corepack enable` provides the right version
- **Bun** — required by the OpenCode sidecar (`curl -fsSL https://bun.sh/install | bash`)

Clone with the `opencode/` submodule and install dependencies:

```bash
git clone --recurse-submodules https://github.com/MrHertal/kowork.git
cd kowork
nvm use          # Node 24
corepack enable  # pinned pnpm
pnpm install     # JS workspaces
bun install --cwd opencode  # OpenCode sidecar deps
```

Run the app:

```bash
pnpm dev
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full setup, checks, and project conventions.

## Contributing

Contributions are welcome — please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Security

To report a vulnerability, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
