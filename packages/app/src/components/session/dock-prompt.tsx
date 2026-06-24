import { type KeyboardEvent, type ReactNode, type Ref } from "react";

import { cn } from "@/lib/utils";

interface DockPromptProps {
  kind: "question" | "permission";
  header: ReactNode;
  children: ReactNode;
  footer: ReactNode;
  ref?: Ref<HTMLDivElement>;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  className?: string;
}

export function DockPrompt({
  kind,
  header,
  children,
  footer,
  ref,
  onKeyDown,
  className,
}: DockPromptProps) {
  return (
    <div
      ref={ref}
      data-component="dock-prompt"
      data-kind={kind}
      onKeyDown={onKeyDown}
      className={cn(
        "flex min-h-0 flex-col rounded-lg border border-border bg-card text-card-foreground",
        className,
      )}
    >
      <div
        data-slot={`${kind}-body`}
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden px-3 py-3"
      >
        <div data-slot={`${kind}-header`} className="flex items-center gap-2">
          {header}
        </div>
        <div
          data-slot={`${kind}-content`}
          className="flex min-h-0 flex-1 flex-col"
        >
          {children}
        </div>
      </div>
      <div
        data-slot={`${kind}-footer`}
        className="flex shrink-0 items-center justify-between border-t border-border px-3 py-2"
      >
        {footer}
      </div>
    </div>
  );
}
