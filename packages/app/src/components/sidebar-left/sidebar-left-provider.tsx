import type { ReactNode } from "react";

import { SidebarProvider } from "@/components/ui/sidebar";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { Persist } from "@/utils/persist";

const PERSIST_TARGET = Persist.global("sidebar-left");

interface SidebarLeftState {
  open: boolean;
}

const createDefaultState = (): SidebarLeftState => ({ open: true });

export function SidebarLeftProvider({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const { state, setState, ready } = usePersistedState<SidebarLeftState>({
    target: PERSIST_TARGET,
    createDefault: createDefaultState,
    logName: "sidebar-left",
  });

  // Gate on ready so a persisted "closed" never flashes open on startup.
  if (!ready) return null;

  return (
    <SidebarProvider
      className={className}
      open={state.open}
      onOpenChange={(open) => setState({ open })}
    >
      {children}
    </SidebarProvider>
  );
}
