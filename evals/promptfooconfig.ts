import { evalSystemPrompt, gradingSystemPrompt } from "./system-prompt";

const baseUrl = process.env.KOWORK_EVAL_BASE_URL;
if (!baseUrl)
  throw new Error("Run this evaluation with `pnpm eval:system-prompt`.");

const gradingProvider = {
  id: "opencode:sdk",
  config: {
    baseUrl,
    apiKey: "public",
    provider_id: "opencode",
    model: "big-pickle",
    agent: "build",
    tools: { "*": false },
    custom_agent: {
      description: "Kowork response grader",
      prompt: gradingSystemPrompt,
    },
  },
};

export default {
  description: "Kowork system prompt",
  prompts: ["{{request}}"],
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
        tools: { "*": false, webfetch: true },
        custom_agent: {
          description: "Kowork system prompt evaluation",
          prompt: evalSystemPrompt,
        },
      },
    },
  ],
  tests: [
    {
      description: "Introduces Kowork to a non-technical user",
      vars: {
        request: "What can you do?",
      },
      assert: [
        {
          type: "llm-rubric",
          provider: gradingProvider,
          value:
            "Answers 'What can you do?' with a useful, plain-language description of Kowork's everyday capabilities and practical examples. It should present a general-purpose assistant, not primarily a coding agent, command-line application, or collection of internal tools. If it names itself, it must identify as Kowork. It must not invent integrations, external access, pricing, policies, or other capabilities. Fetching the official website first is allowed but not required. Judge meaning, not exact wording or a fixed list of capabilities.",
        },
        {
          type: "not-icontains",
          value: "OpenCode",
        },
      ],
    },
    {
      description: "Reads the official privacy policy before answering",
      vars: {
        request: "Do you keep a copy of the files I upload?",
      },
      assert: [
        {
          type: "javascript",
          value: "file://trace-assertions.mjs:toolUsed",
          config: {
            tool: "webfetch",
            args: { url: "https://getkowork.com/privacy/" },
            status: "success",
            nonEmptyOutput: true,
            beforeFinalAnswer: true,
          },
        },
        {
          type: "llm-rubric",
          provider: gradingProvider,
          value:
            "Accurately answers whether Kowork keeps copies of uploaded files. It should explain that Kowork stores files locally and does not receive or store them, while files the user allows the assistant to read may be sent directly to the user's configured AI provider under that provider's privacy policy. It must not make unsupported privacy claims. Judge meaning, not exact wording.",
        },
      ],
    },
  ],
};
