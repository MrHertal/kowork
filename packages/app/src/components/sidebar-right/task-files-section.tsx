import {
  ChevronDownIcon,
  FileIcon,
  FileImageIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  FolderOpenIcon,
  PresentationIcon,
  type LucideIcon,
} from "lucide-react";
import { useId, useRef } from "react";
import { toast } from "sonner";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useGlobalData } from "@/contexts/global-sync";
import { usePlatform } from "@/contexts/platform";
import { useServer } from "@/contexts/server";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import {
  absolutizePath,
  abbreviateHomePath,
  getDirectory,
  getFileExtension,
  getFilename,
} from "@/utils/path";
import type { TaskFile } from "@/utils/session-files";

const spreadsheetExtensions = new Set(["csv", "xls", "xlsx"]);
const presentationExtensions = new Set(["key", "ppt", "pptx"]);
const imageExtensions = new Set([
  "avif",
  "gif",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp",
]);
const documentExtensions = new Set(["doc", "docx", "md", "odt", "rtf", "txt"]);
const fileDisplayLimit = 20;

function fileIcon(path: string): LucideIcon {
  const extension = (getFileExtension(path) ?? "").toLowerCase();
  if (spreadsheetExtensions.has(extension)) return FileSpreadsheetIcon;
  if (presentationExtensions.has(extension)) return PresentationIcon;
  if (imageExtensions.has(extension)) return FileImageIcon;
  if (documentExtensions.has(extension)) return FileTextIcon;
  return FileIcon;
}

export function TaskFilesSection({
  files,
  directory,
}: {
  files: TaskFile[];
  directory: string;
}) {
  const headingID = useId();
  const countID = useId();
  const platform = usePlatform();
  const server = useServer();
  const home = useGlobalData((state) => state.path.home);
  const opening = useRef(false);
  const canUseNativePaths =
    platform.platform === "desktop" &&
    (server.isLocal ||
      (server.current?.type === "sidecar" && server.current.variant === "wsl"));
  const canOpen = canUseNativePaths && !!platform.openPath;
  const canShowInFolder = canOpen && !!platform.showItemInFolder;
  const countLabel =
    files.length === 1
      ? m.sessionInfo_fileCount_one({ count: files.length })
      : m.sessionInfo_fileCount_other({ count: files.length });
  const visibleFiles = files.slice(0, fileDisplayLimit);
  const remaining = files.length - visibleFiles.length;
  const large = remaining > 0;

  const runNativeAction = async (
    action: () => Promise<void>,
    kind: "file" | "folder",
  ) => {
    if (opening.current) return;
    opening.current = true;
    try {
      await action();
    } catch {
      toast.error(
        kind === "file"
          ? m.sessionInfo_openFileFailed()
          : m.sessionInfo_openFolderFailed(),
        { description: m.sessionInfo_openPathFailedDescription() },
      );
    } finally {
      opening.current = false;
    }
  };

  const openFile = async (path: string) => {
    const openPath = platform.openPath;
    if (!canOpen || !openPath) return;
    await runNativeAction(() => openPath(path), "file");
  };

  const showInFolder = async (path: string, deleted: boolean) => {
    const openPath = platform.openPath;
    const revealPath = platform.showItemInFolder;
    if (!canOpen || !openPath) return;
    if (!deleted && (!canShowInFolder || !revealPath)) return;

    await runNativeAction(async () => {
      const parent = getDirectory(path);
      if (deleted || !revealPath) {
        await openPath(parent);
        return;
      }
      try {
        await revealPath(path);
      } catch {
        await openPath(parent);
      }
    }, "folder");
  };

  return (
    <SidebarGroup>
      <SidebarGroupLabel asChild>
        <h2 id={headingID}>{m.sessionInfo_filesChanged()}</h2>
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <Collapsible defaultOpen>
          <CollapsibleTrigger
            aria-labelledby={`${headingID} ${countID}`}
            className="group flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-sidebar-foreground ring-sidebar-ring outline-hidden transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent"
          >
            <span className="flex items-center gap-2">
              <ChevronDownIcon
                className="size-4 shrink-0 transition-transform group-data-[state=closed]:-rotate-90"
                aria-hidden="true"
              />
              <span id={countID}>{countLabel}</span>
            </span>
            {large && (
              <span className="text-xs font-normal tabular-nums">
                {visibleFiles.length}/{files.length}
              </span>
            )}
          </CollapsibleTrigger>
          <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
            <SidebarMenu className="mt-1">
              {visibleFiles.map((file) => {
                const Icon = fileIcon(file.path);
                const absolutePath = absolutizePath(file.path, directory);
                const displayPath = abbreviateHomePath(absolutePath, home);
                const canOpenFile = canOpen && file.status !== "deleted";
                const canUseFolderAction =
                  file.status === "deleted" ? canOpen : canShowInFolder;
                const folderActionLabel =
                  file.status === "deleted"
                    ? m.sessionInfo_openContainingFolder()
                    : m.sessionInfo_showInFolder();
                const content = (
                  <>
                    <Icon
                      className="text-sidebar-foreground/60"
                      aria-hidden="true"
                    />
                    <span>{getFilename(file.path)}</span>
                  </>
                );

                return (
                  <SidebarMenuItem key={file.path}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        {canOpenFile ? (
                          <SidebarMenuButton
                            type="button"
                            onClick={() => void openFile(absolutePath)}
                            className="h-auto min-h-8 py-1.5"
                          >
                            {content}
                          </SidebarMenuButton>
                        ) : (
                          <SidebarMenuButton
                            asChild
                            className={cn(
                              "h-auto min-h-8 cursor-default py-1.5 hover:bg-transparent hover:text-sidebar-foreground active:bg-transparent active:text-sidebar-foreground",
                              canOpen && "opacity-50",
                            )}
                          >
                            <div tabIndex={0}>{content}</div>
                          </SidebarMenuButton>
                        )}
                      </TooltipTrigger>
                      <TooltipContent
                        side="left"
                        className="text-left break-all"
                      >
                        {displayPath}
                      </TooltipContent>
                    </Tooltip>
                    {canUseFolderAction && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <SidebarMenuAction
                            type="button"
                            onClick={() =>
                              void showInFolder(
                                absolutePath,
                                file.status === "deleted",
                              )
                            }
                            showOnHover
                            className="peer-data-[size=default]/menu-button:top-1.5"
                          >
                            <FolderOpenIcon aria-hidden="true" />
                            <span className="sr-only">{folderActionLabel}</span>
                          </SidebarMenuAction>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          {folderActionLabel}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </CollapsibleContent>
        </Collapsible>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
