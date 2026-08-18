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

Kowork lets you hand off work to AI agents operating in folders on your computer. Describe the outcome in plain language, let the agent do the work, and review the result — no terminal required.

Kowork is built on top of [OpenCode](https://github.com/anomalyco/opencode), which runs as a local sidecar server.

## Download

Get the latest build from the [releases page](https://github.com/MrHertal/kowork/releases/latest):

| Platform              | Download                        |
| --------------------- | ------------------------------- |
| macOS (Apple Silicon) | `kowork-electron-mac-arm64.dmg` |
| Windows (x64)         | `kowork-electron-win-x64.exe`   |

## Features

- **Tasks, not terminals** — describe what you want done; the agent plans and executes it in a folder you choose.
- **Parallel work** — run several tasks at once, split into subtasks.
- **Connectors** — give agents access to external tools and data through MCP servers.
- **Skills** — built-in skills for Office documents (docx, pdf, xlsx, pptx).
- **Eight languages** — English, French, German, Spanish (Latin America and Spain), Simplified Chinese, Hindi, Brazilian Portuguese.

## Development

Requires Node 24 (see `.nvmrc`), pnpm (via `corepack enable`), and Bun (for the sidecar).

```bash
git clone --recurse-submodules https://github.com/MrHertal/kowork.git
cd kowork
corepack enable && pnpm install
bun install --cwd opencode
pnpm dev
```

## Contributing

Contributions are welcome — read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Security

To report a vulnerability, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
