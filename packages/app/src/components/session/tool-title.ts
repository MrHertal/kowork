import { m } from "@/paraglide/messages";

export function getToolTitle(tool: string): string {
  switch (tool) {
    case "read":
      return m.session_tool_read();
    case "list":
      return m.session_tool_list();
    case "glob":
      return m.session_tool_glob();
    case "grep":
      return m.session_tool_grep();
    case "webfetch":
      return m.session_tool_webfetch();
    case "websearch":
      return m.session_tool_websearch();
    case "bash":
      return m.session_tool_shell();
    case "edit":
      return m.session_tool_edit();
    case "write":
      return m.session_tool_write();
    case "apply_patch":
      return m.session_tool_patch();
    case "todowrite":
      return m.session_tool_todos();
    case "question":
      return m.session_tool_questions();
    case "skill":
      return m.session_tool_skill();
    case "task":
      return m.session_tool_agent_default();
    default:
      return tool;
  }
}
