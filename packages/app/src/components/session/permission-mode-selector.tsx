import { ChevronDown, FastForward, Hand } from "lucide-react";

import { PromptInputButton } from "@/components/ai-elements/prompt-input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { m } from "@/paraglide/messages";
import type { PermissionMode } from "@/utils/permission-mode";

export type { PermissionMode } from "@/utils/permission-mode";

interface PermissionModeSelectorProps {
  value: PermissionMode;
  onValueChange: (value: PermissionMode) => void;
  disabled?: boolean;
  className?: string;
}

export function PermissionModeSelector({
  value,
  onValueChange,
  disabled,
  className,
}: PermissionModeSelectorProps) {
  const auto = value === "auto";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <PromptInputButton disabled={disabled} className={className}>
          {auto ? (
            <FastForward
              data-icon="inline-start"
              className="size-3"
              aria-hidden="true"
            />
          ) : (
            <Hand
              data-icon="inline-start"
              className="size-3"
              aria-hidden="true"
            />
          )}
          <span className="truncate">
            {auto
              ? m.session_composer_permission_auto_label()
              : m.session_composer_permission_ask_label()}
          </span>
          <ChevronDown
            data-icon="inline-end"
            className="size-3 opacity-60"
            aria-hidden="true"
          />
        </PromptInputButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-80 max-w-[calc(100vw-2rem)]"
      >
        <DropdownMenuRadioGroup
          className="**:data-[slot=dropdown-menu-radio-item-indicator]:top-1/2 **:data-[slot=dropdown-menu-radio-item-indicator]:-translate-y-1/2"
          value={value}
          onValueChange={(next) => {
            if (next === "ask" || next === "auto") onValueChange(next);
          }}
        >
          <DropdownMenuRadioItem value="ask" className="items-start py-2.5">
            <Hand className="mt-0.5" />
            <span className="min-w-0 flex-1">
              <span className="block">
                {m.session_composer_permission_ask_title()}
              </span>
              <span className="block text-xs font-normal text-muted-foreground">
                {m.session_composer_permission_ask_description()}
              </span>
            </span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="auto" className="items-start py-2.5">
            <FastForward className="mt-0.5" />
            <span className="min-w-0 flex-1">
              <span className="block">
                {m.session_composer_permission_auto_title()}
              </span>
              <span className="block text-xs font-normal text-muted-foreground">
                {m.session_composer_permission_auto_description()}
              </span>
            </span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
