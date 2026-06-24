import type { ReactNode } from "react";

import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function AppHeader({
  children,
  actions,
}: {
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="sticky top-0 flex h-14 shrink-0 items-center gap-2 bg-background">
      <div className="flex min-w-0 flex-1 items-center gap-2 px-3">
        <SidebarTrigger />
        {children && (
          <>
            <Separator orientation="vertical" className="mr-2" />
            {children}
          </>
        )}
      </div>
      {actions && (
        <div className="ml-auto flex shrink-0 items-center gap-2 px-3">
          {actions}
        </div>
      )}
    </header>
  );
}
