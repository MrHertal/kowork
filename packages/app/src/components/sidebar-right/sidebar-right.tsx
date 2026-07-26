import type { ComponentProps } from "react";

import { Sidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { useSidebarRight } from "@/components/sidebar-right/sidebar-right-context";
import { SIDEBAR_RIGHT_CONTENT_ID } from "@/components/sidebar-right/sidebar-right-slot";

export function SidebarRight({
  className,
  ...props
}: ComponentProps<typeof Sidebar>) {
  const { available, visible } = useSidebarRight();

  return (
    <Sidebar
      {...props}
      collapsible="none"
      data-state={visible ? "expanded" : "collapsed"}
      aria-hidden={!visible}
      inert={!visible ? true : undefined}
      className={cn(
        "shrink-0 overflow-hidden transition-[width] duration-200 ease-linear motion-reduce:transition-none",
        className,
        available ? "hidden lg:flex" : "hidden",
        visible ? "w-(--sidebar-width)" : "w-0",
      )}
    >
      <div
        id={SIDEBAR_RIGHT_CONTENT_ID}
        className={cn(
          "flex min-h-0 w-(--sidebar-width) min-w-(--sidebar-width) flex-1 flex-col border-l bg-sidebar transition-transform duration-200 ease-linear motion-reduce:transition-none",
          visible ? "translate-x-0" : "translate-x-full",
        )}
      />
    </Sidebar>
  );
}
