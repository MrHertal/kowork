// @opencode-ref: opencode/packages/app/src/utils/session-title.ts
import { m } from "@/paraglide/messages";

const pattern =
  /^(New session|Child session) - \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function sessionTitle(title: string | undefined): string | undefined {
  if (!title) return title;
  const match = title.match(pattern);
  if (!match) return title;
  return match[1] === "Child session"
    ? m.session_default_title_child()
    : m.session_default_title_new();
}
