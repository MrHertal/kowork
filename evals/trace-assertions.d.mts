export type TraceEvent = {
  type: "tool-start" | "tool-end" | "text";
  tool?: string;
  callID?: string;
  args?: unknown;
  outputLength?: number;
  exitCode?: number | null;
  commandOutput?: boolean;
  messageID?: string;
  partID?: string;
};

export type RegexArgument =
  | string
  | RegexArgument[]
  | { [key: string]: RegexArgument };

export type ToolTraceConfig = {
  tool: string;
  args?: unknown;
  argsRegex?: RegexArgument;
  exitCode?: number;
  commandOutput?: boolean;
  status?: "attempt" | "success" | "failure";
  min?: number;
  max?: number;
  nonEmptyOutput?: boolean;
  beforeFinalAnswer?: boolean;
};

export type TraceAssertionResult = {
  pass: boolean;
  score: number;
  reason: string;
  metadata: { executionTrace: unknown[] };
};

export function evaluateToolTrace(
  events: TraceEvent[],
  config: ToolTraceConfig,
  finalAnswer?: { messageID: string; partID: string },
): TraceAssertionResult;

export function toolUsed(
  output: unknown,
  context: {
    config?: ToolTraceConfig;
    providerResponse: { sessionId?: string; raw: string };
  },
): TraceAssertionResult;

export function readEvidence(context: {
  providerResponse: { sessionId?: string; raw: string };
}): {
  events: TraceEvent[];
  finalAnswer?: { messageID: string; partID: string };
  error?: unknown;
};
