import { InfoIcon } from "lucide-react";

import { m } from "@/paraglide/messages";

import { Button } from "@/components/ui/button";

import { useSidebarRight } from "./sidebar-right-context";

export function SidebarRightTrigger() {
  const { open, toggle } = useSidebarRight();

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-7 data-[state=open]:bg-accent data-[state=open]:text-accent-foreground"
      data-state={open ? "open" : "closed"}
      onClick={toggle}
    >
      <InfoIcon />
      <span className="sr-only">{m.sessionInfo_toggle()}</span>
    </Button>
  );
}
