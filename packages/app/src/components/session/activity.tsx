import { ChevronDownIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

export function Activity({
  children,
  running,
  status,
}: {
  children: ReactNode;
  running?: boolean;
  status?: string;
}) {
  const [open, setOpen] = useState(false);

  const handleOpenChange = (value: boolean) => {
    if (running) return;
    setOpen(value);
  };

  return (
    <Collapsible open={open} onOpenChange={handleOpenChange}>
      <CollapsibleTrigger
        disabled={running}
        className={cn(
          "group/activity flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors",
          running ? "cursor-default" : "hover:text-foreground",
        )}
      >
        {running ? (
          <Shimmer as="span" duration={1}>
            {status ?? m.session_activity_working()}
          </Shimmer>
        ) : (
          <span className="font-medium">
            {open ? m.session_activity_hide() : m.session_activity_show()}
          </span>
        )}
        {!running && (
          <ChevronDownIcon className="size-4 shrink-0 transition-transform group-data-[state=open]/activity:rotate-180" />
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden text-sm outline-none data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div className="pt-4">
          <div className="flex flex-col gap-4 border-l-2 border-muted pl-4">
            {children}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
