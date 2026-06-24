import { m } from "@/paraglide/messages";
import { getFilename } from "@/utils/path";

export type ToolInfo = {
  icon: string;
  title: string;
  subtitle?: string;
};

export function getToolInfo(
  tool: string,
  input: Record<string, unknown> = {},
): ToolInfo {
  switch (tool) {
    case "read":
      return {
        icon: "glasses",
        title: m.session_tool_read(),
        subtitle: input.filePath
          ? getFilename(String(input.filePath))
          : undefined,
      };
    case "list":
      return {
        icon: "list",
        title: m.session_tool_list(),
        subtitle: input.path ? String(input.path) : undefined,
      };
    case "glob":
      return {
        icon: "search",
        title: m.session_tool_glob(),
        subtitle: input.pattern ? String(input.pattern) : undefined,
      };
    case "grep":
      return {
        icon: "search",
        title: m.session_tool_grep(),
        subtitle: input.pattern ? String(input.pattern) : undefined,
      };
    case "webfetch":
      return {
        icon: "globe",
        title: m.session_tool_webfetch(),
        subtitle: input.url ? String(input.url) : undefined,
      };
    case "bash":
      return {
        icon: "terminal",
        title: m.session_tool_shell(),
        subtitle: input.description ? String(input.description) : undefined,
      };
    case "edit":
      return {
        icon: "code",
        title: m.session_tool_edit(),
        subtitle: input.filePath
          ? getFilename(String(input.filePath))
          : undefined,
      };
    case "write":
      return {
        icon: "code",
        title: m.session_tool_write(),
        subtitle: input.filePath
          ? getFilename(String(input.filePath))
          : undefined,
      };
    case "apply_patch": {
      const files = input.files;
      const count = Array.isArray(files) ? files.length : 0;
      return {
        icon: "code",
        title: m.session_tool_patch(),
        subtitle:
          count > 0 ? `${count} file${count > 1 ? "s" : ""}` : undefined,
      };
    }
    case "todowrite":
      return {
        icon: "checklist",
        title: m.session_tool_todos(),
      };
    case "question":
      return {
        icon: "message-circle",
        title: m.session_tool_questions(),
      };
    case "skill":
      return {
        icon: "brain",
        title: (input.name as string) || m.session_tool_skill(),
      };
    case "task": {
      const type =
        typeof input.subagent_type === "string" && input.subagent_type
          ? input.subagent_type[0]!.toUpperCase() + input.subagent_type.slice(1)
          : undefined;
      return {
        icon: "task",
        title: type
          ? m.session_tool_agent({ type })
          : m.session_tool_agent({ type: "" }),
        subtitle: input.description ? String(input.description) : undefined,
      };
    }
    default:
      return {
        icon: "wrench",
        title: tool,
      };
  }
}
