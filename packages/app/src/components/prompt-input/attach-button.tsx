// @opencode-ref: opencode/packages/app/src/components/prompt-input.tsx (file input + addAttachments wiring)

import { useCallback, useRef } from "react";
import { ImageIcon } from "lucide-react";
import {
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputActionMenuTrigger,
} from "@/components/ai-elements/prompt-input";
import { ACCEPTED_FILE_TYPES } from "@/constants/file-picker";
import { m } from "@/paraglide/messages";
import { usePromptAttachments } from "./attachments";

export function PromptAttachButton() {
  const { addAttachments } = usePromptAttachments();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSelect = useCallback(() => {
    // Defer so the dropdown closes before the picker steals focus.
    requestAnimationFrame(() => inputRef.current?.click());
  }, []);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const list = event.currentTarget.files;
      if (list) void addAttachments(Array.from(list));
      event.currentTarget.value = "";
    },
    [addAttachments],
  );

  return (
    <>
      <PromptInputActionMenu>
        <PromptInputActionMenuTrigger />
        <PromptInputActionMenuContent className="w-fit">
          <PromptInputActionMenuItem onSelect={handleSelect}>
            <ImageIcon />
            {m.prompt_attach_menu_addFiles()}
          </PromptInputActionMenuItem>
        </PromptInputActionMenuContent>
      </PromptInputActionMenu>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPTED_FILE_TYPES.join(",")}
        className="hidden"
        onChange={handleChange}
      />
    </>
  );
}
