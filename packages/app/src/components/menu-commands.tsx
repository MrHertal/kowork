import { useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

import { useSidebar } from "@/components/ui/sidebar";

// Electron dispatches native menu clicks as this window event; inert on web.
export const MENU_COMMAND_EVENT = "kowork:menu-command";

export function MenuCommands() {
  const navigate = useNavigate();
  const router = useRouter();
  const { toggleSidebar } = useSidebar();

  useEffect(() => {
    const handle = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      switch (id) {
        case "session.new":
          void navigate({ to: "/" });
          return;
        case "sidebar.toggle":
          toggleSidebar();
          return;
        case "common.goBack":
          router.history.back();
          return;
        case "common.goForward":
          router.history.forward();
          return;
      }
    };
    window.addEventListener(MENU_COMMAND_EVENT, handle);
    return () => window.removeEventListener(MENU_COMMAND_EVENT, handle);
  }, [navigate, router, toggleSidebar]);

  return null;
}
