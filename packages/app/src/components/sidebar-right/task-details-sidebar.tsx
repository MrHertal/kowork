import type { SessionHeaderModel } from "@/components/header/session-header-content";
import { SidebarRightSlot } from "@/components/sidebar-right/sidebar-right-slot";
import { TaskProgressSection } from "@/components/sidebar-right/task-progress-section";
import {
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { useChildData } from "@/contexts/global-sync";
import { useSDK } from "@/contexts/sdk";
import { useSessionTodos } from "@/hooks/use-session-todos";
import { m } from "@/paraglide/messages";

export function TaskDetailsSidebar({
  sessionId,
  title,
}: Pick<SessionHeaderModel, "title"> & { sessionId: string }) {
  const sdk = useSDK();
  const label = title || m.common_untitled();
  const todos = useSessionTodos(sessionId);
  const sessionStatus = useChildData(
    sdk.directory,
    (state) => state.session_status[sessionId],
  );
  const working = !!sessionStatus && sessionStatus.type !== "idle";
  const hasOpenSteps = todos.some(
    (todo) => todo.status !== "completed" && todo.status !== "cancelled",
  );
  const showProgress = todos.length > 0 && (working || hasOpenSteps);

  return (
    <SidebarRightSlot>
      <SidebarHeader className="h-16 shrink-0 justify-center border-b border-sidebar-border">
        <h2 className="truncate px-3 text-sm font-semibold" title={label}>
          {label}
        </h2>
      </SidebarHeader>
      <SidebarContent className="gap-0">
        {showProgress && <TaskProgressSection todos={todos} />}
      </SidebarContent>
      <SidebarFooter />
    </SidebarRightSlot>
  );
}
