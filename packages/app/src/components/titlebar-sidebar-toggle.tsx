import { PanelLeftCloseIcon, PanelLeftOpenIcon } from "lucide-react";

import { TitlebarSlot } from "@/components/titlebar";
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
