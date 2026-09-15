# Evaluation Guidelines

These evaluations exercise Kowork's product behavior through its compiled
OpenCode sidecar. Repository-wide rules also apply. Contributor commands and
output locations live in [README.md](README.md).

## Required reading

- Read `README.md` before running or changing evaluations.
- Before changing sidecar or protocol behavior, inspect Kowork's production
  implementation and the corresponding implementation in
  `opencode/packages/desktop/`.
- Before changing Promptfoo provider configuration, inspect the provider
  implementation in the pinned Promptfoo version and check its current official
  documentation. Do not assume provider fields configure an existing server
  when `baseUrl` is set.

## Evaluation integrity

- Run evaluations through the repository command, such as
  `pnpm eval:system-prompt`; do not invoke Promptfoo directly.
- Exercise Kowork's compiled OpenCode fork, not an independently installed
  upstream CLI. Preserve the `present_files` check that establishes the
  server's identity.
- When an evaluation exercises scripting or a Skill that uses an embedded
  runtime, launch the sidecar with the shared production runtime environment
  builder and Kowork's bundled launchers. Do not fall back to the user's Python
  or Node.js installation.
- Import prompts from their production source. Never copy production prompt
  text into an evaluation fixture.
- Bypass Promptfoo's response cache so every evaluation makes a real model
  request.
- Use isolated sidecar storage and an available local port. Do not read the user's
  OpenCode configuration, sessions, plugins, or credentials.
- Preserve graceful shutdown and process-tree cleanup on success, evaluation
  failure, startup failure, `SIGINT`, and `SIGTERM`.
- Keep temporary trace retention explicit and opt-in. Preserved traces contain
  full tool arguments and may include user data; never enable retention by
  default or in CI.

## OpenCode v1 workaround

- Keep the normal `build` agent selected so OpenCode retains its model-specific
  base prompt.
- `custom_agent.prompt` is intentionally used to populate the v1 request-level
  `system` field even though Promptfoo cannot register a custom agent on a
  server supplied through `baseUrl`.
- Keep `apiKey: "public"`: Promptfoo validates the field, but it is only a
  placeholder and is ignored for the preconfigured local sidecar.
- Keep `provider.opencode.options.setCacheKey` disabled in the isolated sidecar
  configuration. The free OpenCode endpoint rejects `prompt_cache_key`.
- Preserve the runtime diagnostic that verifies exactly one production Kowork
  prompt follows a non-empty OpenCode base prompt.
- Revisit these constraints when Kowork migrates to OpenCode v2 rather than
  carrying the workaround forward automatically.

## Assertions and failures

- Assert product behavior, not exact prose. Allow harmless differences in
  punctuation, whitespace, and Markdown while remaining strict about identity
  and prohibited behavior.
- Keep deterministic structural checks separate from stochastic model-output
  assertions.
- Promptfoo's OpenCode provider returns only the final assistant message. Use
  the execution trace when an assertion needs evidence from an earlier tool or
  Skill step. Do not rely on `skill-used` for multi-step OpenCode responses
  unless its behavior has been verified against the pinned provider version.
- Enable only the tools required by the suite. When scenarios need materially
  different tool sets, consider separate provider configurations rather than
  broadening tool access for every scenario without review.
- Tool arguments and outputs may contain user data. Keep full arguments only in
  temporary traces, persist structural event summaries by default, and never
  save full tool output unless a scenario explicitly requires it.
- When testing a tool-dependent answer, use the trace for tool name, arguments,
  success, count, and ordering, and use a separate semantic assertion for answer
  quality.
- Do not weaken an assertion until the complete saved response and grading
  reason have been inspected.
- Distinguish model behavior failures from transport and provider failures.
  OpenCode may return an assistant result containing an API error and no text,
  which Promptfoo can misleadingly report as a failed output assertion.

## Verification

- Run the Electron typecheck and Prettier on changed evaluation files.
- Run the relevant repository evaluation command after provider, prompt,
  assertion, sidecar, or lifecycle changes.
- After failure-path or lifecycle changes, verify that no `kowork-eval-*`
  temporary directory or eval-sidecar process remains.
