import { useEffect } from "react";
import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";

import { SIDEBAR_EXPANDED_WIDTH, TitlebarSlot } from "@/components/titlebar";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePlatform } from "@/contexts/platform";
import { m } from "@/paraglide/messages";

export function TitlebarSidebarToggle() {
  const { open, openMobile, isMobile, toggleSidebar } = useSidebar();
  const { os } = usePlatform();
  const label = m.sidebar_toggle();
  const expanded = isMobile ? openMobile : open;

  // The sidebar only pushes the chat area on desktop; on mobile it overlays.
  // Drive the titlebar's left region so the session title tracks that edge.
  const pushesContent = !isMobile && open;
  useEffect(() => {
    document.documentElement.style.setProperty(
      "--titlebar-left-width",
      pushesContent ? SIDEBAR_EXPANDED_WIDTH : "0px",
    );
  }, [pushesContent]);

  return (
    <TitlebarSlot name="left">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={toggleSidebar}
            aria-label={label}
            aria-expanded={expanded}
          >
            {expanded ? <PanelLeftCloseIcon /> : <PanelLeftOpenIcon />}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {label}
          <kbd
            data-slot="kbd"
            className="bg-background/20 px-1.5 py-0.5 text-[11px]"
          >
            {os === "macos" ? "⌘B" : "Ctrl+B"}
          </kbd>
        </TooltipContent>
      </Tooltip>
    </TitlebarSlot>
  );
}
