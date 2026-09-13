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
        provider_id: "opencode",
        model: "big-pickle",
        custom_agent: {
          description: "Kowork system prompt evaluation",
          mode: "primary",
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
          type: "icontains",
          value: "Kowork",
        },
      ],
    },
  ],
};
