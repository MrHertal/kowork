import { FolderOpen } from "lucide-react";
import { useCallback } from "react";

import { PromptInputButton } from "@/components/ai-elements/prompt-input";
import { usePlatform } from "@/contexts/platform";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import { getFilename, truncateMiddle } from "@/utils/path";

export function FolderPicker({
  directory,
  onDirectoryChange,
}: {
  directory: string;
  onDirectoryChange?: (directory: string) => void;
}) {
  const { openDirectoryPickerDialog } = usePlatform();
  const folderName = getFilename(directory) || directory;
  const readOnly = !onDirectoryChange;

  const handleClick = useCallback(async () => {
    if (!onDirectoryChange || !openDirectoryPickerDialog) return;
    const selected = await openDirectoryPickerDialog({
      title: m.session_folder_choose_directory(),
      defaultPath: directory,
    });
    if (typeof selected === "string") {
      onDirectoryChange(selected);
    }
  }, [openDirectoryPickerDialog, onDirectoryChange, directory]);

  return (
    <PromptInputButton
      tooltip={{ content: truncateMiddle(directory, 50), side: "top" }}
      onClick={readOnly ? undefined : handleClick}
      aria-disabled={readOnly}
      className={cn(
        "max-w-[10rem] min-w-0 sm:max-w-[14rem]",
        readOnly &&
          "cursor-default opacity-50 hover:bg-transparent hover:text-current active:translate-y-0! dark:hover:bg-transparent",
      )}
      aria-label={m.session_folder_change_label()}
    >
      <FolderOpen className="size-3" />
      <span className="flex-1 truncate text-left">{folderName}</span>
    </PromptInputButton>
  );
}
