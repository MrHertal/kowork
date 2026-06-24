// @opencode-ref: opencode/packages/app/src/components/prompt-input/drag-overlay.tsx

import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

interface PromptDragOverlayProps {
  isDragging: boolean;
}

export function PromptDragOverlay({ isDragging }: PromptDragOverlayProps) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md border-2 border-dashed border-primary/60 bg-background/85 backdrop-blur-sm transition-opacity",
        isDragging ? "opacity-100" : "opacity-0",
      )}
      aria-hidden={!isDragging}
    >
      <div className="flex flex-col items-center gap-2 text-muted-foreground">
        <ImageIcon className="size-8" />
        <span className="text-sm">{m.prompt_dropzone_label()}</span>
      </div>
    </div>
  );
}
