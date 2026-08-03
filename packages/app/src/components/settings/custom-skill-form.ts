import { z } from "zod";

import { m } from "@/paraglide/messages";

export const formSchema = z
  .object({
    type: z.enum(["local", "remote"]),
    folder: z.string(),
    url: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.type === "local") {
      if (!value.folder.trim()) {
        ctx.addIssue({
          code: "custom",
          path: ["folder"],
          message: m.settings_skills_custom_error_directory_required(),
        });
      }
    } else {
      const url = value.url.trim();
      if (!url) {
        ctx.addIssue({
          code: "custom",
          path: ["url"],
          message: m.settings_skills_custom_error_url_required(),
        });
      } else if (!/^https?:\/\//.test(url)) {
        ctx.addIssue({
          code: "custom",
          path: ["url"],
          message: m.settings_skills_custom_error_url_format(),
        });
      }
    }
  });

export type FormValues = z.input<typeof formSchema>;

export const initialValues: FormValues = {
  type: "local",
  folder: "",
  url: "",
};

export type ValidatedResult =
  | { type: "local"; folder: string }
  | { type: "remote"; url: string };

export function buildResult(value: FormValues): ValidatedResult {
  if (value.type === "local") {
    return { type: "local", folder: value.folder.trim() };
  }
  return { type: "remote", url: value.url.trim() };
}
