import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function IconAction({
  icon,
  label,
  tooltip,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  tooltip?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const text = tooltip ?? label;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          aria-label={text}
          onClick={onClick}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}
