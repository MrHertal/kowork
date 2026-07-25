import { useEffect } from "react";
import { PanelRightCloseIcon, PanelRightOpenIcon } from "lucide-react";

import { SIDEBAR_EXPANDED_WIDTH, TitlebarSlot } from "@/components/titlebar";
import { m } from "@/paraglide/messages";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { useSidebarRight } from "./sidebar-right-context";

export function SidebarRightTrigger() {
  const { available, open, toggle, visible } = useSidebarRight();
  const label = open ? m.sessionInfo_hide() : m.sessionInfo_show();

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--titlebar-right-width",
      visible ? SIDEBAR_EXPANDED_WIDTH : "0px",
    );
  }, [visible]);

  if (!available) return null;

  return (
    <TitlebarSlot name="right">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="hidden h-7 w-7 lg:inline-flex"
            onClick={toggle}
            aria-label={label}
            aria-expanded={visible}
          >
            {open ? (
              <PanelRightCloseIcon aria-hidden="true" />
            ) : (
              <PanelRightOpenIcon aria-hidden="true" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>
    </TitlebarSlot>
  );
}
