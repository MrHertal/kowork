import { z } from "zod";

import { m } from "@/paraglide/messages";

const PROVIDER_ID = /^[a-z0-9][a-z0-9-_]*$/;
const OPENAI_COMPATIBLE = "@ai-sdk/openai-compatible";
const ENV_VAR = /^\{env:([^}]+)\}$/;

const modelEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
});

const headerEntrySchema = z.object({
  key: z.string(),
  value: z.string(),
});

export type ModelEntry = z.infer<typeof modelEntrySchema>;
export type HeaderEntry = z.infer<typeof headerEntrySchema>;

export const formSchema = z
  .object({
    providerID: z.string(),
    name: z.string(),
    baseURL: z.string(),
    apiKey: z.string(),
    models: z.array(modelEntrySchema),
    headers: z.array(headerEntrySchema),
  })
  .superRefine((value, ctx) => {
    const providerID = value.providerID.trim();
    if (!providerID) {
      ctx.addIssue({
        code: "custom",
        path: ["providerID"],
        message: m.provider_custom_error_providerID_required(),
      });
    } else if (!PROVIDER_ID.test(providerID)) {
      ctx.addIssue({
        code: "custom",
        path: ["providerID"],
        message: m.provider_custom_error_providerID_format(),
      });
    }

    if (!value.name.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["name"],
        message: m.provider_custom_error_name_required(),
      });
    }

    const baseURL = value.baseURL.trim();
    if (!baseURL) {
      ctx.addIssue({
        code: "custom",
        path: ["baseURL"],
        message: m.provider_custom_error_baseURL_required(),
      });
    } else if (!/^https?:\/\//.test(baseURL)) {
      ctx.addIssue({
        code: "custom",
        path: ["baseURL"],
        message: m.provider_custom_error_baseURL_format(),
      });
    }

    addModelIssues(value.models, ctx);
    addHeaderIssues(value.headers, ctx);
  });

export type FormValues = z.input<typeof formSchema>;

export const initialValues: FormValues = {
  providerID: "",
  name: "",
  baseURL: "",
  apiKey: "",
  models: [{ id: "", name: "" }],
  headers: [{ key: "", value: "" }],
};

function addModelIssues(rows: ModelEntry[], ctx: z.RefinementCtx) {
  const seen = new Set<string>();
  rows.forEach((row, i) => {
    const id = row.id.trim();
    if (!id) {
      ctx.addIssue({
        code: "custom",
        path: ["models", i, "id"],
        message: m.provider_custom_error_required(),
      });
    } else if (seen.has(id)) {
      ctx.addIssue({
        code: "custom",
        path: ["models", i, "id"],
        message: m.provider_custom_error_duplicate(),
      });
    } else {
      seen.add(id);
    }
    if (!row.name.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["models", i, "name"],
        message: m.provider_custom_error_required(),
      });
    }
  });
}

function addHeaderIssues(rows: HeaderEntry[], ctx: z.RefinementCtx) {
  const seen = new Set<string>();
  rows.forEach((row, i) => {
    const key = row.key.trim();
    const value = row.value.trim();
    if (!key && !value) return;
    const normalized = key.toLowerCase();
    if (!key) {
      ctx.addIssue({
        code: "custom",
        path: ["headers", i, "key"],
        message: m.provider_custom_error_required(),
      });
    } else if (seen.has(normalized)) {
      ctx.addIssue({
        code: "custom",
        path: ["headers", i, "key"],
        message: m.provider_custom_error_duplicate(),
      });
    } else {
      seen.add(normalized);
    }
    if (!value) {
      ctx.addIssue({
        code: "custom",
        path: ["headers", i, "value"],
        message: m.provider_custom_error_required(),
      });
    }
  });
}

export function providerIDAvailableRefine(
  existingProviderIDs: ReadonlySet<string>,
  disabledProviders: readonly string[],
): (value: FormValues, ctx: z.RefinementCtx) => void {
  return (value, ctx) => {
    const providerID = value.providerID.trim();
    if (!providerID) return;
    if (
      existingProviderIDs.has(providerID) &&
      !disabledProviders.includes(providerID)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["providerID"],
        message: m.provider_custom_error_providerID_exists(),
      });
    }
  };
}

export type ValidatedResult = {
  providerID: string;
  name: string;
  key: string | undefined;
  config: {
    npm: typeof OPENAI_COMPATIBLE;
    name: string;
    env?: [string];
    options: {
      baseURL: string;
      headers?: Record<string, string>;
    };
    models: Record<string, { name: string }>;
  };
};

export function buildResult(value: FormValues): ValidatedResult {
  const providerID = value.providerID.trim();
  const name = value.name.trim();
  const baseURL = value.baseURL.trim();
  const apiKey = value.apiKey.trim();

  const env = apiKey.match(ENV_VAR)?.[1]?.trim();
  const key = apiKey && !env ? apiKey : undefined;

  const headers = collectHeaders(value.headers);
  const models = Object.fromEntries(
    value.models.map((row) => [row.id.trim(), { name: row.name.trim() }]),
  );

  return {
    providerID,
    name,
    key,
    config: {
      npm: OPENAI_COMPATIBLE,
      name,
      ...(env ? { env: [env] as [string] } : {}),
      options: {
        baseURL,
        ...(Object.keys(headers).length ? { headers } : {}),
      },
      models,
    },
  };
}

function collectHeaders(rows: HeaderEntry[]): Record<string, string> {
  return Object.fromEntries(
    rows
      .map((row) => ({ key: row.key.trim(), value: row.value.trim() }))
      .filter((row) => !!row.key && !!row.value)
      .map((row) => [row.key, row.value]),
  );
}
