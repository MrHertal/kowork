import { FolderOpenIcon } from "lucide-react";
import { useRef } from "react";
import { toast } from "sonner";

import { SidebarFooter, SidebarMenuAction } from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useGlobalData } from "@/contexts/global-sync";
import { usePlatform } from "@/contexts/platform";
import { useServer } from "@/contexts/server";
import { m } from "@/paraglide/messages";
import { abbreviateHomePath, getFilename } from "@/utils/path";

export function TaskFolderFooter({ directory }: { directory: string }) {
  const platform = usePlatform();
  const server = useServer();
  const home = useGlobalData((state) => state.path.home);
  const opening = useRef(false);
  const displayDirectory = abbreviateHomePath(directory, home);
  const directoryName = getFilename(directory) || directory;
  const canOpen =
    platform.platform === "desktop" &&
    !!platform.openPath &&
    (server.isLocal ||
      (server.current?.type === "sidecar" && server.current.variant === "wsl"));

  const openFolder = async () => {
    const openPath = platform.openPath;
    if (!canOpen || !openPath || opening.current) return;
    opening.current = true;
    try {
      await openPath(directory);
    } catch {
      toast.error(m.sessionInfo_openFolderFailed(), {
        description: m.sessionInfo_openPathFailedDescription(),
      });
    } finally {
      opening.current = false;
    }
  };

  return (
    <SidebarFooter className="shrink-0 border-t border-sidebar-border py-4">
      <div className="flex min-w-0 items-center gap-2 px-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className="min-w-0 flex-1 rounded-xl ring-sidebar-ring outline-hidden focus-visible:ring-2"
              tabIndex={0}
            >
              <div className="truncate text-sm font-medium text-sidebar-foreground">
                {directoryName}
              </div>
              <div className="truncate text-xs font-normal text-sidebar-foreground/70">
                {displayDirectory}
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="left" className="break-all">
            {displayDirectory}
          </TooltipContent>
        </Tooltip>
        {canOpen && (
          <Tooltip>
            <TooltipTrigger asChild>
              <SidebarMenuAction
                type="button"
                className="relative top-auto right-auto after:-inset-0.5 md:after:block"
                onClick={() => void openFolder()}
                aria-label={m.sessionInfo_openFolder()}
              >
                <FolderOpenIcon aria-hidden="true" />
              </SidebarMenuAction>
            </TooltipTrigger>
            <TooltipContent side="top">
              {m.sessionInfo_openFolder()}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </SidebarFooter>
  );
}
