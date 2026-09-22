type KoworkEvalProviderOptions = {
  baseUrl: string;
  label?: string;
  description: string;
  prompt: string;
};

export function createKoworkEvalProvider({
  baseUrl,
  label,
  description,
  prompt,
}: KoworkEvalProviderOptions) {
  return {
    id: "opencode:sdk",
    ...(label ? { label } : {}),
    config: {
      baseUrl,
      // Promptfoo validates this field even though it is ignored when baseUrl
      // points to Kowork's preconfigured sidecar. OpenCode's free model does
      // not require a real provider key.
      apiKey: "public",
      provider_id: "opencode",
      model: "big-pickle",
      // Promptfoo 0.123.0 still forwards custom_agent.prompt as the
      // request-level system prompt when baseUrl prevents custom-agent
      // registration. Selecting build separately preserves OpenCode's
      // model-specific prompt. Remove this v1 workaround when Kowork moves
      // to OpenCode v2 and adopts its replacement for per-prompt system text.
      agent: "build",
      // Keep the production tool surface in the model request. Filtering this
      // list changes the OpenCode request shape and causes its free provider to
      // reject a request that the Kowork application would normally send.
      tools: { "*": true },
      custom_agent: {
        description,
        prompt,
      },
    },
  };
}
