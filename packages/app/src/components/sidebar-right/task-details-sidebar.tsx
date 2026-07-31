import type { SessionHeaderModel } from "@/components/header/session-header-content";
import { SidebarRightSlot } from "@/components/sidebar-right/sidebar-right-slot";
import { TaskFilesSection } from "@/components/sidebar-right/task-files-section";
import { TaskProgressSection } from "@/components/sidebar-right/task-progress-section";
import {
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { useSDK } from "@/contexts/sdk";
import { useSessionFiles } from "@/hooks/use-session-files";
import { useSessionTodos } from "@/hooks/use-session-todos";
import { m } from "@/paraglide/messages";

export function TaskDetailsSidebar({
  sessionId,
  title,
}: Pick<SessionHeaderModel, "title"> & { sessionId: string }) {
  const sdk = useSDK();
  const label = title || m.common_untitled();
  const files = useSessionFiles(sessionId);
  const todos = useSessionTodos(sessionId);
  const showProgress = todos.some(
    (todo) => todo.status !== "completed" && todo.status !== "cancelled",
  );

  return (
    <SidebarRightSlot>
      <SidebarHeader className="h-16 shrink-0 justify-center border-b border-sidebar-border">
        <h2 className="truncate px-3 text-sm font-semibold" title={label}>
          {label}
        </h2>
      </SidebarHeader>
      <SidebarContent className="gap-0">
        {showProgress && <TaskProgressSection todos={todos} />}
        {files.length > 0 && (
          <TaskFilesSection files={files} directory={sdk.directory} />
        )}
      </SidebarContent>
      <SidebarFooter />
    </SidebarRightSlot>
  );
}
