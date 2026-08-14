// @opencode-ref: opencode/packages/app/src/components/prompt-input.tsx (file input + addAttachments wiring)

import { GraduationCapIcon, ImageIcon, PlugIcon } from "lucide-react";
import { useCallback, useRef } from "react";

import {
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputActionMenuTrigger,
} from "@/components/ai-elements/prompt-input";
import { DialogSettings } from "@/components/settings/dialog-settings";
import type { SettingsSection } from "@/components/settings/settings-shell";
import { DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { acceptedFileTypes } from "@/constants/file-picker";
import { useDialog } from "@/contexts/dialog";
import { m } from "@/paraglide/messages";

import { usePromptAttachments } from "./attachments";

export function PromptAttachButton() {
  const { addAttachments, canAttachOffice } = usePromptAttachments();
  const dialog = useDialog();
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

  const openSettings = useCallback(
    (section: SettingsSection) => {
      // Defer so the dropdown closes before the dialog steals focus.
      requestAnimationFrame(() =>
        dialog.show(() => <DialogSettings initialSection={section} />),
      );
    },
    [dialog],
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
          <DropdownMenuSeparator />
          <PromptInputActionMenuItem onSelect={() => openSettings("mcp")}>
            <PlugIcon />
            {m.settings_mcp_navItem()}
          </PromptInputActionMenuItem>
          <PromptInputActionMenuItem onSelect={() => openSettings("skills")}>
            <GraduationCapIcon />
            {m.settings_skills_navItem()}
          </PromptInputActionMenuItem>
        </PromptInputActionMenuContent>
      </PromptInputActionMenu>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={acceptedFileTypes(canAttachOffice).join(",")}
        className="hidden"
        onChange={handleChange}
      />
    </>
  );
}
