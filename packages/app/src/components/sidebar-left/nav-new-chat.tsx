import { Link } from "@tanstack/react-router";
import { SquarePen } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenuButton,
} from "@/components/ui/sidebar";
import { m } from "@/paraglide/messages";

export function NavNewChat() {
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenuButton tooltip={m.sidebar_new_session()} asChild>
          <Button variant="outline" asChild>
            <Link to="/">
              <SquarePen /> {m.sidebar_new_session()}
            </Link>
          </Button>
        </SidebarMenuButton>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
