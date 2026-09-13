import { KOWORK_SYSTEM_PROMPT } from "../packages/app/src/constants/kowork-system-prompt";

const systemPrompt = KOWORK_SYSTEM_PROMPT.replace(
  "{{version}}",
  "unknown",
).replace(
  "{{configuration}}",
  "No providers, connectors, or skills are configured for this evaluation.",
);

export default {
  description: "Kowork system prompt",
  prompts: ["What are you, and how can I interact with you?"],
  providers: [
    {
      id: "opencode:sdk",
      config: {
        baseUrl: "http://127.0.0.1:4096",
        apiKey: "public",
        provider_id: "opencode",
        model: "big-pickle",
        // Promptfoo 0.123.0 still forwards custom_agent.prompt as the
        // request-level system prompt when baseUrl prevents custom-agent
        // registration. Selecting build separately preserves OpenCode's
        // model-specific prompt. Remove this v1 workaround when Kowork moves
        // to OpenCode v2 and adopts its replacement for per-prompt system text.
        agent: "build",
        custom_agent: {
          description: "Kowork system prompt evaluation",
          prompt: systemPrompt,
        },
      },
    },
  ],
  tests: [
    {
      description: "Identifies as Kowork",
      assert: [
        {
          type: "icontains-any",
          value: ["I'm Kowork", "I am Kowork"],
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
