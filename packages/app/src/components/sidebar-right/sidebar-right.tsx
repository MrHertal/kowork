import type { ComponentProps } from "react";

import { Sidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { useSidebarRight } from "@/components/sidebar-right/sidebar-right-context";
import { SIDEBAR_RIGHT_CONTENT_ID } from "@/components/sidebar-right/sidebar-right-slot";

export function SidebarRight({
  className,
  ...props
}: ComponentProps<typeof Sidebar>) {
  const { visible } = useSidebarRight();

  return (
    <Sidebar
      {...props}
      collapsible="none"
      aria-hidden={!visible}
      inert={!visible ? true : undefined}
      className={cn(
        "shrink-0 border-l",
        className,
        visible ? "hidden lg:flex" : "hidden",
      )}
    >
      <div
        id={SIDEBAR_RIGHT_CONTENT_ID}
        className="flex min-h-0 flex-1 flex-col"
      />
    </Sidebar>
  );
}
