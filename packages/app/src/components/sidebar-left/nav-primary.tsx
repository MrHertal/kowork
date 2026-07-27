import { Link, useRouterState } from "@tanstack/react-router";
import { CirclePlus, Settings2 } from "lucide-react";

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { m } from "@/paraglide/messages";

export function NavPrimary({ onOpenSettings }: { onOpenSettings: () => void }) {
  const isHome = useRouterState({
    select: (state) => state.location.pathname === "/",
  });

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          tooltip={m.sidebar_new_session()}
          asChild
          isActive={isHome}
        >
          <Link to="/">
            <CirclePlus />
            <span>{m.sidebar_new_session()}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
      <SidebarMenuItem>
        <SidebarMenuButton onClick={onOpenSettings}>
          <Settings2 />
          <span>{m.sidebar_nav_settings()}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
