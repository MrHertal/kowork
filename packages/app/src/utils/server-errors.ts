import { m } from "@/paraglide/messages";

export type ConfigInvalidError = {
  name: "ConfigInvalidError";
  data: {
    path?: string;
    message?: string;
    issues?: Array<{ message: string; path: string[] }>;
  };
};

export type ProviderModelNotFoundError = {
  name: "ProviderModelNotFoundError";
  data: {
    providerID: string;
    modelID: string;
    suggestions?: string[];
  };
};

export type Translator = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

type V = Record<string, string | number> | undefined;

const messages: Record<string, ((vars: V) => string) | undefined> = {
  "error.chain.unknown": () => m.error_chain_unknown(),
  "error.chain.configInvalid": (v) =>
    m.error_chain_configInvalid({ path: String(v?.path ?? "") }),
  "error.chain.configInvalidWithMessage": (v) =>
    m.error_chain_configInvalidWithMessage({
      path: String(v?.path ?? ""),
      message: String(v?.message ?? ""),
    }),
  "error.chain.modelNotFound": (v) =>
    m.error_chain_modelNotFound({
      provider: String(v?.provider ?? ""),
      model: String(v?.model ?? ""),
    }),
  "error.chain.checkConfig": () => m.error_chain_checkConfig(),
  "error.chain.didYouMean": (v) =>
    m.error_chain_didYouMean({ suggestions: String(v?.suggestions ?? "") }),
  "toast.project.reloadFailed.title": (v) =>
    m.toast_project_reloadFailed_title({ project: String(v?.project ?? "") }),
  "toast.session.listFailed.title": (v) =>
    m.toast_session_listFailed_title({ project: String(v?.project ?? "") }),
  "toast.session.listAllFailed.title": () =>
    m.toast_session_listAllFailed_title(),
  "common.requestFailed": () => m.common_requestFailed(),
  "common.moreCountSuffix": (v) =>
    m.common_moreCountSuffix({ count: Number(v?.count ?? 0) }),
};

export const translate: Translator = (key, vars) => {
  const fn = messages[key];
  if (!fn) return key;
  return fn(vars);
};

function tr(
  translator: Translator | undefined,
  key: string,
  text: string,
  vars?: Record<string, string | number>,
) {
  if (!translator) return text;
  const out = translator(key, vars);
  if (!out || out === key) return text;
  return out;
}

export function formatServerError(
  error: unknown,
  translate?: Translator,
  fallback?: string,
) {
  if (isConfigInvalidErrorLike(error))
    return parseReadableConfigInvalidError(error, translate);
  if (isProviderModelNotFoundErrorLike(error))
    return parseReadableProviderModelNotFoundError(error, translate);
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  if (fallback) return fallback;
  return tr(translate, "error.chain.unknown", "Unknown error");
}

function isConfigInvalidErrorLike(error: unknown): error is ConfigInvalidError {
  if (typeof error !== "object" || error === null) return false;
  const o = error as Record<string, unknown>;
  return (
    o.name === "ConfigInvalidError" &&
    typeof o.data === "object" &&
    o.data !== null
  );
}

function isProviderModelNotFoundErrorLike(
  error: unknown,
): error is ProviderModelNotFoundError {
  if (typeof error !== "object" || error === null) return false;
  const o = error as Record<string, unknown>;
  return (
    o.name === "ProviderModelNotFoundError" &&
    typeof o.data === "object" &&
    o.data !== null
  );
}

export function parseReadableConfigInvalidError(
  errorInput: ConfigInvalidError,
  translator?: Translator,
) {
  const file =
    errorInput.data.path && errorInput.data.path !== "config"
      ? errorInput.data.path
      : "config";
  const detail = errorInput.data.message?.trim() ?? "";
  const issues = (errorInput.data.issues ?? [])
    .map((issue) => {
      const msg = issue.message.trim();
      if (!issue.path.length) return msg;
      return `${issue.path.join(".")}: ${msg}`;
    })
    .filter(Boolean);
  const msg = issues.length ? issues.join("\n") : detail;
  if (!msg)
    return tr(
      translator,
      "error.chain.configInvalid",
      `Config file at ${file} is invalid`,
      { path: file },
    );
  return tr(
    translator,
    "error.chain.configInvalidWithMessage",
    `Config file at ${file} is invalid: ${msg}`,
    { path: file, message: msg },
  );
}

function parseReadableProviderModelNotFoundError(
  errorInput: ProviderModelNotFoundError,
  translator?: Translator,
) {
  const p = errorInput.data.providerID.trim();
  const m = errorInput.data.modelID.trim();
  const list = (errorInput.data.suggestions ?? [])
    .map((v) => v.trim())
    .filter(Boolean);
  const body = tr(
    translator,
    "error.chain.modelNotFound",
    `Model not found: ${p}/${m}`,
    { provider: p, model: m },
  );
  const tail = tr(
    translator,
    "error.chain.checkConfig",
    "Check your config (opencode.json) provider/model names",
  );
  if (list.length) {
    const suggestions = list.slice(0, 5).join(", ");
    return [
      body,
      tr(translator, "error.chain.didYouMean", `Did you mean: ${suggestions}`, {
        suggestions,
      }),
      tail,
    ].join("\n");
  }
  return [body, tail].join("\n");
}
