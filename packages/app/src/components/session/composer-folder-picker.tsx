import { ChevronDown, Folder, FolderOpen, FolderX } from "lucide-react";

import {
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputActionMenuTrigger,
} from "@/components/ai-elements/prompt-input";
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { usePlatform } from "@/contexts/platform";
import { useRecentSessionsData } from "@/contexts/recent-sessions";
import { useServer } from "@/contexts/server";
import { m } from "@/paraglide/messages";
import { getFilename, truncateMiddle } from "@/utils/path";
import { getRecentFolders } from "@/utils/recent-folders";

interface ComposerFolderPickerProps {
  attachedDirectory?: string;
  defaultDirectory: string;
  disabled?: boolean;
  onDirectoryChange: (directory: string) => void;
  onDirectoryDetach: () => void;
}

export function ComposerFolderPicker({
  attachedDirectory,
  defaultDirectory,
  disabled,
  onDirectoryChange,
  onDirectoryDetach,
}: ComposerFolderPickerProps) {
  const platform = usePlatform();
  const server = useServer();
  const canChooseDifferent =
    !!platform.openDirectoryPickerDialog &&
    (server.isLocal ||
      (server.current?.type === "sidecar" && server.current.variant === "wsl"));
  const sessions = useRecentSessionsData((state) => state.sessions);
  const projects = server.projects.list.filter(
    (project) => project.worktree !== defaultDirectory,
  );
  const recentFolders = getRecentFolders(projects, sessions);
  const folderOptions = attachedDirectory
    ? [
        attachedDirectory,
        ...recentFolders.filter((p) => p !== attachedDirectory),
      ]
    : recentFolders;

  function handleChooseDifferent() {
    if (disabled || !canChooseDifferent) return;
    requestAnimationFrame(async () => {
      const selected = await platform.openDirectoryPickerDialog?.({
        title: m.session_folder_choose_directory(),
        defaultPath:
          attachedDirectory ?? server.projects.last() ?? defaultDirectory,
      });
      if (typeof selected === "string") onDirectoryChange(selected);
    });
  }

  return (
    <PromptInputActionMenu>
      <PromptInputActionMenuTrigger
        className="max-w-[10rem] min-w-0 sm:max-w-[14rem]"
        disabled={disabled}
        title={attachedDirectory}
      >
        <FolderOpen
          data-icon="inline-start"
          className="size-3"
          aria-hidden="true"
        />
        <span className="truncate">
          {attachedDirectory
            ? getFilename(attachedDirectory) || attachedDirectory
            : m.session_composer_folder_label()}
        </span>
        <ChevronDown
          data-icon="inline-end"
          className="size-3 opacity-60"
          aria-hidden="true"
        />
      </PromptInputActionMenuTrigger>
      <PromptInputActionMenuContent className="w-80 max-w-[calc(100vw-2rem)]">
        <DropdownMenuRadioGroup
          value={attachedDirectory}
          onValueChange={onDirectoryChange}
          className="**:data-[slot=dropdown-menu-radio-item-indicator]:top-1/2 **:data-[slot=dropdown-menu-radio-item-indicator]:-translate-y-1/2"
        >
          {folderOptions.map((folder) => (
            <DropdownMenuRadioItem
              key={folder}
              value={folder}
              className="items-start"
              disabled={disabled}
              title={folder}
            >
              <Folder className="mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="truncate">{getFilename(folder) || folder}</div>
                <div className="truncate text-xs font-normal text-muted-foreground opacity-75">
                  {truncateMiddle(folder, 32)}
                </div>
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {folderOptions.length > 0 && <DropdownMenuSeparator />}
        <PromptInputActionMenuItem
          disabled={disabled || !canChooseDifferent}
          onSelect={handleChooseDifferent}
        >
          <FolderOpen />
          {m.session_composer_folder_choose_different()}
        </PromptInputActionMenuItem>
        {attachedDirectory && (
          <>
            <DropdownMenuSeparator />
            <PromptInputActionMenuItem
              disabled={disabled}
              onSelect={onDirectoryDetach}
            >
              <FolderX />
              {m.session_composer_folder_detach()}
            </PromptInputActionMenuItem>
          </>
        )}
      </PromptInputActionMenuContent>
    </PromptInputActionMenu>
  );
}
