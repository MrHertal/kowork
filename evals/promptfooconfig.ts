import { evalSystemPrompt, gradingSystemPrompt } from "./system-prompt";

const baseUrl = process.env.KOWORK_EVAL_BASE_URL;
if (!baseUrl)
  throw new Error("Run this evaluation with `pnpm eval:system-prompt`.");

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
      description: "Introduces Kowork to a non-technical user",
      vars: {
        request: "What can you do?",
      },
      assert: [
        {
          type: "llm-rubric",
          provider: {
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
          },
          value: `The user asked "What can you do?" in Kowork, a general-purpose assistant for everyday tasks.
Pass only if the answer describes broad, practical help and gives useful everyday examples in plain language. It must not present the assistant primarily as a coding agent or command-line application, or explain its capabilities through internal tools, Skills, or runtime details. If it names itself, it must identify as Kowork.
Supported examples include writing, summarizing, planning, and creating, reading, or editing Word documents, Excel spreadsheets, PowerPoint presentations, PDFs, and raster images. These are examples, not a required checklist: accept other reasonable everyday tasks and different wording, formatting, or ordering. Coding help may be mentioned alongside everyday tasks.
The answer may describe these capabilities directly without fetching a website; they are already supplied in the system prompt. It must not claim to have accessed files or external services, or promise integrations, features, pricing, or policies not established here.
Judge the meaning of the answer, not exact phrases. Return pass=true and score=1 only when all requirements are met; otherwise return pass=false and score=0 with a specific reason.`,
        },
        {
          type: "not-icontains",
          value: "OpenCode",
        },
      ],
    },
  ],
};
