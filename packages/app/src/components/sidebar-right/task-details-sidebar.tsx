import { SidebarRightSlot } from "@/components/sidebar-right/sidebar-right-slot";
import { TaskContextSection } from "@/components/sidebar-right/task-context-section";
import { TaskFilesSection } from "@/components/sidebar-right/task-files-section";
import { TaskFolderFooter } from "@/components/sidebar-right/task-folder-footer";
import { TaskProgressSection } from "@/components/sidebar-right/task-progress-section";
import { SidebarContent } from "@/components/ui/sidebar";
import { useSDK } from "@/contexts/sdk";
import { useSessionFiles } from "@/hooks/use-session-files";
import { useSessionTodos } from "@/hooks/use-session-todos";

export function TaskDetailsSidebar({ sessionId }: { sessionId: string }) {
  const sdk = useSDK();
  const files = useSessionFiles(sessionId);
  const todos = useSessionTodos(sessionId);
  const showProgress = todos.some(
    (todo) => todo.status !== "completed" && todo.status !== "cancelled",
  );

  return (
    <SidebarRightSlot>
      <SidebarContent className="gap-0">
        {showProgress && <TaskProgressSection todos={todos} />}
        {files.length > 0 && (
          <TaskFilesSection files={files} directory={sdk.directory} />
        )}
        <TaskContextSection sessionId={sessionId} />
      </SidebarContent>
      <TaskFolderFooter directory={sdk.directory} />
    </SidebarRightSlot>
  );
}
