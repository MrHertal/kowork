import { evalSystemPrompt } from "./system-prompt";

const baseUrl = process.env.KOWORK_EVAL_BASE_URL;
if (!baseUrl)
  throw new Error("Run this evaluation with `pnpm eval:system-prompt`.");

export default {
  description: "Kowork system prompt",
  prompts: ["What are you, and how can I interact with you?"],
  providers: [
    {
      id: "opencode:sdk",
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
        tools: { "*": false },
        custom_agent: {
          description: "Kowork system prompt evaluation",
          prompt: evalSystemPrompt,
        },
      },
    },
  ],
  tests: [
    {
      description: "Identifies as Kowork",
      assert: [
        {
          type: "regex",
          value: "(?:I['’]m|I am)\\s+(?:\\*\\*)?Kowork(?:\\*\\*)?",
        },
        {
          type: "not-icontains",
          value: "OpenCode",
        },
        {
          type: "not-contains",
          value: "<tool_call>",
        },
      ],
    },
  ],
};
