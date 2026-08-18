# Contributing to Kowork

Thanks for your interest! Bug fixes, documentation, and translations are always welcome. For UI or product changes, open an issue first to discuss the design — Kowork is built for non-technical users, so product decisions are deliberate.

## Setup

Follow the [Development section of the README](README.md#development). Two extras:

- `pnpm dev` builds the OpenCode sidecar automatically; build it alone with `pnpm build:sidecar`.
- The built-in document skills (docx, pdf, xlsx, pptx) embed a Python/Node runtime that builds automatically on first run. Prepare it with `pnpm --filter @kowork/electron ensure:runtime` and smoke-test it with `pnpm --filter @kowork/electron smoke:runtime`.

## Checks

```bash
pnpm lint       # ESLint
pnpm typecheck  # TypeScript
pnpm test       # Vitest
```

Regenerate artifacts before typechecking after route or translation changes:

- Routes: `pnpm --filter @kowork/app exec npx @tanstack/router-cli generate`
- Translations: `pnpm --filter @kowork/app exec npx @inlang/paraglide-js compile --project ./project.inlang`

## Conventions

Style and architecture rules live in [AGENTS.md](AGENTS.md) — read it before contributing. In short:

- User-facing text uses Kowork's terminology (task, subtask, folder, connector, skill) — see the terminology table in AGENTS.md.
- Commit messages and PR titles are short lowercase imperative (`add portuguese language`); branch names are short kebab-case. PRs are squash-merged, so the PR title becomes the commit message.

## Translations

Messages live in `packages/app/messages/*.json`. Keys stay technical (`session`, `directory`, `mcp`); values are localized using the terminology defined in AGENTS.md. Recompile after editing (command above).

## Pull requests

Keep PRs small and focused, reference the issue they address (`Closes #123`), include before/after screenshots for UI changes, and make sure the checks above pass.
