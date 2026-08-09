import { ChevronDownIcon } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";

import { Shimmer } from "@/components/ai-elements/shimmer";
import { Tool } from "@/components/ai-elements/tool";
import {
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

export type ToolStatus = "pending" | "running" | "completed" | "error";

export interface ToolProps {
  input: Record<string, unknown>;
  metadata: Record<string, unknown>;
  tool: string;
  output?: string;
  status?: ToolStatus;
  hideDetails?: boolean;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  locked?: boolean;
}

export interface BasicToolProps {
  icon?: ReactNode;
  title?: string;
  subtitle?: string;
  args?: string[];
  action?: ReactNode;
  trigger?: ReactNode;
  triggerHref?: string;
  onTriggerClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  status?: ToolStatus;
  children?: ReactNode;
  hideDetails?: boolean;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  locked?: boolean;
  defer?: boolean;
}

export function BasicTool({
  icon,
  title,
  subtitle,
  args,
  action,
  trigger,
  triggerHref,
  onTriggerClick,
  status,
  children,
  hideDetails,
  defaultOpen = false,
  forceOpen,
  locked,
  defer,
}: BasicToolProps) {
  const [userOpen, setUserOpen] = useState<boolean | undefined>(undefined);
  const [ready, setReady] = useState(!defer || defaultOpen);
  const open = forceOpen || (userOpen ?? defaultOpen);
  const pending = status === "pending" || status === "running";

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setReady(!defer || open);
    });
    return () => cancelAnimationFrame(frame);
  }, [defer, open]);

  const handleOpenChange = (value: boolean) => {
    if (pending) return;
    if (locked && !value) return;
    setUserOpen(value);
  };

  const hasContent = children && !hideDetails;

  const triggerContent = trigger ?? (
    <div className="flex min-w-0 items-center gap-2">
      <span className="shrink-0 [&>svg]:size-4">{icon}</span>
      {title && (
        <span className="shrink-0 font-medium">
          {pending ? (
            <Shimmer as="span" duration={1}>
              {title}
            </Shimmer>
          ) : (
            title
          )}
        </span>
      )}
      {!pending && subtitle && <span className="truncate">{subtitle}</span>}
      {!pending &&
        args?.map((arg) => (
          <span key={arg} className="shrink-0 text-xs">
            {arg}
          </span>
        ))}
    </div>
  );

  const triggerClassName = cn(
    "flex w-fit items-center gap-2 text-muted-foreground text-sm transition-colors",
    !pending && (triggerHref || hasContent) && "hover:text-foreground",
  );
  const triggerChildren = (
    <>
      {triggerContent}
      {action}
      {hasContent && !pending && (
        <ChevronDownIcon className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
      )}
    </>
  );
  const triggerWrapper = triggerHref ? (
    <a href={triggerHref} onClick={onTriggerClick} className={triggerClassName}>
      {triggerChildren}
    </a>
  ) : hasContent ? (
    <CollapsibleTrigger className={triggerClassName}>
      {triggerChildren}
    </CollapsibleTrigger>
  ) : (
    <div className={triggerClassName}>{triggerChildren}</div>
  );

  return (
    <Tool
      className="mb-0 rounded-none border-0"
      open={open}
      onOpenChange={handleOpenChange}
    >
      {triggerWrapper}
      {hasContent && (
        <CollapsibleContent className="overflow-hidden text-sm outline-none data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <div className="pt-4">{!defer || ready ? children : null}</div>
        </CollapsibleContent>
      )}
    </Tool>
  );
}
