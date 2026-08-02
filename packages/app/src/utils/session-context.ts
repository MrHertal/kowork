// @opencode-ref: opencode/packages/app/src/components/session/session-context-metrics.ts
import type {
  AssistantMessage,
  Message,
  Provider,
} from "@opencode-ai/sdk/v2/client";

export type SessionContextUsage = {
  message: AssistantMessage;
  percent: number | null;
  tokens: number;
};

function tokenTotal(message: AssistantMessage) {
  return (
    message.tokens.input +
    message.tokens.output +
    message.tokens.reasoning +
    message.tokens.cache.read +
    message.tokens.cache.write
  );
}

export function getSessionContextUsage(
  messages: Message[] = [],
  providers: Provider[] = [],
): SessionContextUsage | undefined {
  const message = messages.findLast(
    (item): item is AssistantMessage =>
      item.role === "assistant" && tokenTotal(item) > 0,
  );
  if (!message) return undefined;

  const tokens = tokenTotal(message);
  const limit = providers.find((item) => item.id === message.providerID)
    ?.models[message.modelID]?.limit.context;

  return {
    message,
    tokens,
    percent: limit ? Math.round((tokens / limit) * 100) : null,
  };
}
