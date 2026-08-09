// @opencode-ref: opencode/packages/app/src/pages/session/composer/session-permission-dock.tsx
import type { PermissionRequest } from "@opencode-ai/sdk/v2/client";
import { TriangleAlertIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DockPrompt } from "@/components/session/dock-prompt";
import { m } from "@/paraglide/messages";

const toolDescriptions: Record<string, () => string> = {
  bash: m.settings_permissions_tool_bash_description,
  codesearch: m.settings_permissions_tool_codesearch_description,
  doom_loop: m.settings_permissions_tool_doom_loop_description,
  edit: m.settings_permissions_tool_edit_description,
  external_directory:
    m.settings_permissions_tool_external_directory_description,
  glob: m.settings_permissions_tool_glob_description,
  grep: m.settings_permissions_tool_grep_description,
  list: m.settings_permissions_tool_list_description,
  lsp: m.settings_permissions_tool_lsp_description,
  read: m.settings_permissions_tool_read_description,
  skill: m.settings_permissions_tool_skill_description,
  task: m.settings_permissions_tool_task_description,
  todowrite: m.settings_permissions_tool_todowrite_description,
  webfetch: m.settings_permissions_tool_webfetch_description,
  websearch: m.settings_permissions_tool_websearch_description,
};

interface SessionPermissionDockProps {
  request: PermissionRequest;
  responding: boolean;
  onDecide: (
    requestID: string,
    sessionID: string,
    response: "once" | "always" | "reject",
  ) => void;
}

export function SessionPermissionDock({
  request,
  responding,
  onDecide,
}: SessionPermissionDockProps) {
  const descriptionFn = toolDescriptions[request.permission];
  const toolDescription = descriptionFn ? descriptionFn() : "";

  return (
    <DockPrompt
      kind="permission"
      header={
        <>
          <TriangleAlertIcon className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {m.session_permission_required()}
          </span>
        </>
      }
      footer={
        <>
          <div />
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDecide(request.id, request.sessionID, "reject")}
              disabled={responding}
            >
              {m.common_deny()}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onDecide(request.id, request.sessionID, "always")}
              disabled={responding}
            >
              {m.common_allow_always()}
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => onDecide(request.id, request.sessionID, "once")}
              disabled={responding}
            >
              {m.common_allow_once()}
            </Button>
          </div>
        </>
      }
    >
      {toolDescription && (
        <p className="text-sm text-muted-foreground">{toolDescription}</p>
      )}
      {request.patterns.length > 0 && (
        <div className="space-y-1">
          {request.patterns.map((pattern) => (
            <code
              key={pattern}
              className="block text-xs break-all text-foreground"
            >
              {pattern}
            </code>
          ))}
        </div>
      )}
    </DockPrompt>
  );
}
