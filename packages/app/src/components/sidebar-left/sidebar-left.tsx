import type { ComponentProps } from "react";

import { DialogSettings } from "@/components/settings/dialog-settings";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar";
import { useDialog } from "@/contexts/dialog";

import { NavPinnedSessions } from "./nav-pinned-sessions";
import { NavPrimary } from "./nav-primary";
import { NavSessions } from "./nav-sessions";
import { SearchForm } from "./search-form";
import { SessionsEmpty } from "./sessions-empty";
import { UpdateCard } from "./update-card";

export function SidebarLeft({ ...props }: ComponentProps<typeof Sidebar>) {
  const dialog = useDialog();

  return (
    <Sidebar className="border-r-0" {...props}>
      <SidebarHeader className="border-b border-sidebar-border">
        <NavPrimary
          onOpenSettings={() => dialog.show(() => <DialogSettings />)}
        />
      </SidebarHeader>
      <SidebarContent className="gap-0">
        <SearchForm />
        <NavPinnedSessions />
        <NavSessions />
        <SessionsEmpty />
      </SidebarContent>
      <SidebarFooter>
        <div className="p-1">
          <UpdateCard />
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
