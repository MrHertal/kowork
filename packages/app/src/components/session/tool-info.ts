import { m } from "@/paraglide/messages";
import { getFilename } from "@/utils/path";

export type ToolInfo = {
  icon: string;
  title: string;
  subtitle?: string;
};

function str(value: unknown, map?: (s: string) => string): string | undefined {
  if (typeof value !== "string" || value === "") return undefined;
  return map ? map(value) : value;
}

export function getToolInfo(
  tool: string,
  input: Record<string, unknown> = {},
): ToolInfo {
  switch (tool) {
    case "read":
      return {
        icon: "glasses",
        title: m.session_tool_read(),
        subtitle: str(input.filePath, getFilename),
      };
    case "list":
      return {
        icon: "list",
        title: m.session_tool_list(),
        subtitle: str(input.path),
      };
    case "glob":
      return {
        icon: "search",
        title: m.session_tool_glob(),
        subtitle: str(input.pattern),
      };
    case "grep":
      return {
        icon: "search",
        title: m.session_tool_grep(),
        subtitle: str(input.pattern),
      };
    case "webfetch":
      return {
        icon: "globe",
        title: m.session_tool_webfetch(),
        subtitle: str(input.url),
      };
    case "bash":
      return {
        icon: "terminal",
        title: m.session_tool_shell(),
        subtitle: str(input.description),
      };
    case "edit":
      return {
        icon: "code",
        title: m.session_tool_edit(),
        subtitle: str(input.filePath, getFilename),
      };
    case "write":
      return {
        icon: "code",
        title: m.session_tool_write(),
        subtitle: str(input.filePath, getFilename),
      };
    case "apply_patch": {
      const files = input.files;
      const count = Array.isArray(files) ? files.length : 0;
      return {
        icon: "code",
        title: m.session_tool_patch(),
        subtitle:
          count > 0
            ? count === 1
              ? m.session_patch_file_count_one({ count })
              : m.session_patch_file_count({ count })
            : undefined,
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
          : m.session_tool_agent_default(),
        subtitle: str(input.description),
      };
    }
    default:
      return {
        icon: "wrench",
        title: tool,
      };
  }
}
