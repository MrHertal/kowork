# Evaluations

Run the Kowork system-prompt evaluation from the repository root:

```sh
pnpm eval:system-prompt
```

The command builds and starts Kowork's compiled OpenCode sidecar with isolated
temporary storage, waits for it to become healthy, runs Promptfoo, and stops the
sidecar. It uses an available local port, bypasses Promptfoo's response cache,
and does not start the Electron app.

The evaluation currently uses OpenCode's free `big-pickle` model. It therefore
requires network access but does not require a provider API key. Promptfoo
results and the most recent sidecar log are written to `tmp/promptfoo/`. Inspect
the results with:

```sh
pnpm exec promptfoo view tmp/promptfoo
```

Run the evaluation through the repository command rather than invoking
Promptfoo directly. The wrapper supplies the sidecar URL and verifies that the
server is Kowork's fork by checking for its `present_files` tool.

The configuration intentionally relies on Promptfoo 0.123.0 forwarding
`custom_agent.prompt` as OpenCode's v1 request-level system prompt while a
separate `build` agent is selected. This preserves OpenCode's model-specific
base prompt. Revisit the integration when Kowork migrates to OpenCode v2, which
is removing per-prompt system text.
