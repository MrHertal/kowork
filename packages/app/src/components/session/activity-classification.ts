export type ActivityCategory =
  | "thinking"
  | "context"
  | "modification"
  | "command"
  | "skill"
  | "other";

export function classifyActivityPart(part: {
  type: string;
  tool?: string;
}): ActivityCategory | undefined {
  if (part.type === "reasoning") return "thinking";
  if (part.type !== "tool") return undefined;

  switch (part.tool) {
    case "question":
    case "task":
    case "todowrite":
    case "present_files":
      return undefined;
    case "read":
    case "list":
    case "glob":
    case "grep":
    case "webfetch":
      return "context";
    case "edit":
    case "write":
    case "apply_patch":
      return "modification";
    case "bash":
      return "command";
    case "skill":
      return "skill";
    default:
      return "other";
  }
}
