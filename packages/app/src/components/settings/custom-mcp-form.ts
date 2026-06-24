import type {
  McpLocalConfig,
  McpRemoteConfig,
} from "@opencode-ai/sdk/v2/client";
import { z } from "zod";

import { m } from "@/paraglide/messages";

const NAME = /^[a-z0-9][a-z0-9-_]*$/;

const entrySchema = z.object({
  key: z.string(),
  value: z.string(),
});

export type Entry = z.infer<typeof entrySchema>;

export const formSchema = z
  .object({
    type: z.enum(["remote", "local"]),
    name: z.string(),
    url: z.string(),
    command: z.string(),
    headers: z.array(entrySchema),
    environment: z.array(entrySchema),
  })
  .superRefine((value, ctx) => {
    const name = value.name.trim();
    if (!name) {
      ctx.addIssue({
        code: "custom",
        path: ["name"],
        message: m.settings_mcp_custom_error_name_required(),
      });
    } else if (!NAME.test(name)) {
      ctx.addIssue({
        code: "custom",
        path: ["name"],
        message: m.settings_mcp_custom_error_name_format(),
      });
    }

    if (value.type === "remote") {
      const url = value.url.trim();
      if (!url) {
        ctx.addIssue({
          code: "custom",
          path: ["url"],
          message: m.settings_mcp_custom_error_url_required(),
        });
      } else if (!/^https?:\/\//.test(url)) {
        ctx.addIssue({
          code: "custom",
          path: ["url"],
          message: m.settings_mcp_custom_error_url_format(),
        });
      }
      addEntryIssues(value.headers, true, "headers", ctx);
    } else {
      if (!value.command.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["command"],
          message: m.settings_mcp_custom_error_command_required(),
        });
      }
      addEntryIssues(value.environment, false, "environment", ctx);
    }
  });

export type FormValues = z.input<typeof formSchema>;

export const initialValues: FormValues = {
  type: "remote",
  name: "",
  url: "",
  command: "",
  headers: [{ key: "", value: "" }],
  environment: [{ key: "", value: "" }],
};

function addEntryIssues(
  rows: Entry[],
  caseInsensitiveKey: boolean,
  group: "headers" | "environment",
  ctx: z.RefinementCtx,
) {
  const seen = new Set<string>();
  rows.forEach((row, i) => {
    const key = row.key.trim();
    const value = row.value.trim();
    if (!key && !value) return;
    const normalized = caseInsensitiveKey ? key.toLowerCase() : key;
    if (!key) {
      ctx.addIssue({
        code: "custom",
        path: [group, i, "key"],
        message: m.settings_mcp_custom_error_required(),
      });
    } else if (seen.has(normalized)) {
      ctx.addIssue({
        code: "custom",
        path: [group, i, "key"],
        message: m.settings_mcp_custom_error_duplicate(),
      });
    } else {
      seen.add(normalized);
    }
    if (!value) {
      ctx.addIssue({
        code: "custom",
        path: [group, i, "value"],
        message: m.settings_mcp_custom_error_required(),
      });
    }
  });
}

export function nameAvailableRefine(
  existingNames: ReadonlySet<string>,
): (value: FormValues, ctx: z.RefinementCtx) => void {
  return (value, ctx) => {
    const name = value.name.trim();
    if (!name) return;
    if (existingNames.has(name)) {
      ctx.addIssue({
        code: "custom",
        path: ["name"],
        message: m.settings_mcp_custom_error_name_exists(),
      });
    }
  };
}

export type ValidatedResult = {
  name: string;
  config: McpLocalConfig | McpRemoteConfig;
};

export function buildResult(value: FormValues): ValidatedResult {
  const name = value.name.trim();
  if (value.type === "remote") {
    const headers = collectEntries(value.headers);
    return {
      name,
      config: {
        type: "remote",
        url: value.url.trim(),
        enabled: true,
        ...(Object.keys(headers).length ? { headers } : {}),
      },
    };
  }
  const environment = collectEntries(value.environment);
  return {
    name,
    config: {
      type: "local",
      command: splitCommand(value.command.trim()),
      enabled: true,
      ...(Object.keys(environment).length ? { environment } : {}),
    },
  };
}

function collectEntries(rows: Entry[]): Record<string, string> {
  return Object.fromEntries(
    rows
      .map((row) => ({ key: row.key.trim(), value: row.value.trim() }))
      .filter((row) => !!row.key && !!row.value)
      .map((row) => [row.key, row.value]),
  );
}

// Quoted args don't survive — power users edit kowork.json directly.
function splitCommand(input: string): string[] {
  return input.split(/\s+/).filter((s) => s.length > 0);
}
