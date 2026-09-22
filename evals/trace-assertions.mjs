import { readFileSync } from "node:fs";
import { join } from "node:path";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function matchesSubset(actual, expected) {
  if (Array.isArray(expected))
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((value, index) => matchesSubset(actual[index], value))
    );
  if (isRecord(expected))
    return (
      isRecord(actual) &&
      Object.entries(expected).every(([key, value]) =>
        matchesSubset(actual[key], value),
      )
    );
  return Object.is(actual, expected);
}

function matchesRegex(actual, expected) {
  if (Array.isArray(expected))
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((value, index) => matchesRegex(actual[index], value))
    );
  if (isRecord(expected))
    return (
      isRecord(actual) &&
      Object.entries(expected).every(([key, value]) =>
        matchesRegex(actual[key], value),
      )
    );
  if (typeof expected !== "string")
    throw new Error("argsRegex values must be regular expression strings");
  return typeof actual === "string" && new RegExp(expected).test(actual);
}

function summarize(events) {
  return events.map((event) => ({
    type: event.type,
    tool: event.tool,
    callID: event.callID,
    messageID: event.messageID,
    partID: event.partID,
    outputLength: event.outputLength,
    exitCode: event.exitCode,
    commandOutput: event.commandOutput,
  }));
}

function parseConfig(config) {
  const status = config.status ?? "success";
  const min = config.min ?? (config.max === 0 ? 0 : 1);
  const max = config.max;
  if (typeof config.tool !== "string" || !config.tool)
    throw new Error("toolUsed requires a tool name");
  if (!["attempt", "success", "failure"].includes(status))
    throw new Error(`Unsupported tool call status: ${status}`);
  for (const [name, value] of Object.entries({ min, max }))
    if (value !== undefined && (!Number.isInteger(value) || value < 0))
      throw new Error(`${name} must be a non-negative integer`);
  if (max !== undefined && max < min)
    throw new Error("max must be greater than or equal to min");
  if (config.exitCode !== undefined && !Number.isInteger(config.exitCode))
    throw new Error("exitCode must be an integer");
  if (
    config.commandOutput !== undefined &&
    typeof config.commandOutput !== "boolean"
  )
    throw new Error("commandOutput must be a boolean");
  return { ...config, status, min, max };
}

function matchingCalls(events, config, finalAnswerIndex) {
  return events.flatMap((event, startIndex) => {
    if (
      event.type !== "tool-start" ||
      event.tool !== config.tool ||
      !matchesSubset(event.args, config.args ?? {}) ||
      (config.argsRegex !== undefined &&
        !matchesRegex(event.args, config.argsRegex))
    )
      return [];

    const endIndex = events.findIndex(
      (candidate, index) =>
        index > startIndex &&
        candidate.type === "tool-end" &&
        candidate.tool === event.tool &&
        candidate.callID === event.callID,
    );
    const successful = endIndex >= 0;
    if (config.status === "success" && !successful) return [];
    if (config.status === "failure" && successful) return [];
    if (
      config.exitCode !== undefined &&
      (!successful || events[endIndex].exitCode !== config.exitCode)
    )
      return [];
    if (
      config.commandOutput !== undefined &&
      (!successful || events[endIndex].commandOutput !== config.commandOutput)
    )
      return [];
    const completionIndex = successful ? endIndex : startIndex;
    if (config.beforeFinalAnswer && completionIndex >= finalAnswerIndex)
      return [];
    if (
      config.nonEmptyOutput &&
      (!successful || events[endIndex].outputLength <= 0)
    )
      return [];
    return [{ ...event, successful }];
  });
}

export function evaluateToolTrace(events, rawConfig, finalAnswer) {
  const config = parseConfig(rawConfig);
  const finalAnswerIndex = finalAnswer
    ? events.findLastIndex(
        (event) =>
          event.type === "text" &&
          event.messageID === finalAnswer.messageID &&
          event.partID === finalAnswer.partID,
      )
    : -1;
  if (config.beforeFinalAnswer && finalAnswerIndex < 0)
    return {
      pass: false,
      score: 0,
      reason: "Could not identify the final answer in the execution trace.",
      metadata: { executionTrace: summarize(events) },
    };

  const calls = matchingCalls(events, config, finalAnswerIndex);
  const pass =
    calls.length >= config.min &&
    (config.max === undefined || calls.length <= config.max);
  const expected =
    config.max === undefined
      ? `at least ${config.min}`
      : `${config.min}-${config.max}`;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: `${pass ? "Observed" : "Expected"} ${expected} matching ${config.status} call(s) to ${config.tool}; observed ${calls.length}.`,
    metadata: { executionTrace: summarize(events) },
  };
}

export function readEvidence(context) {
  const directory = process.env.KOWORK_EVAL_TRACE_DIR;
  const response = context.providerResponse;
  if (!directory || !/^ses_[a-zA-Z0-9]+$/.test(response?.sessionId ?? ""))
    throw new Error("Missing evaluation trace directory or session ID");

  const raw = JSON.parse(response.raw);
  const data = raw.data ?? raw;
  const message = data.info;
  const finalText = data.parts?.findLast(
    (part) => part.type === "text" && part.messageID === message.id,
  );
  let events;
  try {
    events = readFileSync(
      join(directory, `${response.sessionId}.jsonl`),
      "utf8",
    )
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    events = [];
  }
  return {
    events,
    finalAnswer: finalText && {
      messageID: finalText.messageID,
      partID: finalText.id,
    },
    error: message.error,
  };
}

export function toolUsed(_output, context) {
  const { events, finalAnswer, error } = readEvidence(context);
  if (error)
    return {
      pass: false,
      score: 0,
      reason: `Provider error: ${JSON.stringify(error)}`,
      metadata: { executionTrace: summarize(events) },
    };
  return evaluateToolTrace(events, context.config ?? {}, finalAnswer);
}
