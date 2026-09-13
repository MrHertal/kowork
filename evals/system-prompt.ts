import { KOWORK_SYSTEM_PROMPT } from "../packages/app/src/constants/kowork-system-prompt";

export const evalSystemPrompt = KOWORK_SYSTEM_PROMPT.replace(
  "{{version}}",
  "unknown",
).replace(
  "{{configuration}}",
  "No providers, connectors, or skills are configured for this evaluation.",
);
