import type { SessionHeaderModel } from "@/components/header/session-header-content";
import {
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@/components/ui/sidebar";
import { m } from "@/paraglide/messages";
import { SidebarRightSlot } from "@/components/sidebar-right/sidebar-right-slot";

export function TaskDetailsSidebar({
  title,
}: Pick<SessionHeaderModel, "title">) {
  const label = title || m.common_untitled();

  return (
    <SidebarRightSlot>
      <SidebarHeader className="h-16 shrink-0 justify-center border-b border-sidebar-border">
        <h2 className="truncate px-2 text-sm font-semibold" title={label}>
          {label}
        </h2>
      </SidebarHeader>
      <SidebarContent />
      <SidebarFooter />
    </SidebarRightSlot>
  );
}
