import { Link } from "@tanstack/react-router";
import { CirclePlus } from "lucide-react";

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { m } from "@/paraglide/messages";

export function NavPrimary() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton tooltip={m.sidebar_new_session()} asChild>
          <Link to="/">
            <CirclePlus />
            <span>{m.sidebar_new_session()}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
