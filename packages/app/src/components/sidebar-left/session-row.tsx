import type { Session } from "@opencode-ai/sdk/v2/client";
import { Link } from "@tanstack/react-router";
import { MoreHorizontal, Pencil, Pin, PinOff, Trash2 } from "lucide-react";

import { DeleteSessionDialog } from "@/components/session/delete-session-dialog";
import { RenameSessionDialog } from "@/components/session/rename-session-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useChildData } from "@/contexts/global-sync";
import { useNotificationData } from "@/contexts/notification";
import {
  usePinnedSessions,
  usePinnedSessionsData,
} from "@/contexts/pinned-sessions";
import { m } from "@/paraglide/messages";
import { sessionTitle } from "@/utils/session-title";

export function SessionRow({
  session,
  isActive,
  isMobile,
  onDelete,
  onRename,
}: {
  session: Session;
  isActive: boolean;
  isMobile: boolean;
  onDelete: () => void;
  onRename: (newTitle: string) => void;
}) {
  const hasPermissions = useChildData(session.directory, (s) => {
    if ((s.permission[session.id] ?? []).length > 0) return true;
    for (const child of s.session) {
      if (child.parentID !== session.id) continue;
      if ((s.permission[child.id] ?? []).length > 0) return true;
    }
    return false;
  });
  const isWorking = useChildData(session.directory, (s) => {
    const status = s.session_status[session.id];
    if (status && status.type !== "idle") return true;
    return (s.message[session.id] ?? []).some(
      (msg) => msg.role === "assistant" && msg.time.completed === undefined,
    );
  });
  const hasError = useNotificationData(
    (s) => s.index.session.unseenHasError[session.id] ?? false,
  );
  const unseenCount = useNotificationData(
    (s) => s.index.session.unseenCount[session.id] ?? 0,
  );
  const isPinned = usePinnedSessionsData((s) => s.ids.includes(session.id));
  const { pin, unpin } = usePinnedSessions();

  const showWorking = !hasPermissions && isWorking;
  const showError = !hasPermissions && !isWorking && !isActive && hasError;
  const showUnseen =
    !hasPermissions && !isWorking && !isActive && !hasError && unseenCount > 0;

  const title = sessionTitle(session.title) || m.common_untitled();

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive}>
        <Link to="/session/$id" params={{ id: session.id }} title={title}>
          <span>{title}</span>
        </Link>
      </SidebarMenuButton>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuAction showOnHover>
            <MoreHorizontal />
            <span className="sr-only">{m.common_moreActions()}</span>
          </SidebarMenuAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className="w-fit"
          side={isMobile ? "bottom" : "right"}
          align={isMobile ? "end" : "start"}
        >
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              if (isPinned) unpin(session.id);
              else pin(session);
            }}
          >
            {isPinned ? <PinOff /> : <Pin />}
            <span>{isPinned ? m.common_unpin() : m.common_pin()}</span>
          </DropdownMenuItem>
          <RenameSessionDialog title={title} onConfirm={onRename}>
            {(openDialog) => (
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  openDialog();
                }}
              >
                <Pencil />
                <span>{m.common_rename()}</span>
              </DropdownMenuItem>
            )}
          </RenameSessionDialog>
          <DeleteSessionDialog title={title} onConfirm={onDelete}>
            {(openDialog) => (
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  openDialog();
                }}
              >
                <Trash2 />
                <span>{m.common_delete()}</span>
              </DropdownMenuItem>
            )}
          </DeleteSessionDialog>
        </DropdownMenuContent>
      </DropdownMenu>
      {(hasPermissions || showWorking || showError || showUnseen) && (
        <SidebarMenuBadge className="group-focus-within/menu-item:opacity-0 group-hover/menu-item:opacity-0 group-has-[[data-state=open]]/menu-item:opacity-0 peer-data-[size=default]/menu-button:top-2">
          {hasPermissions ? (
            <div className="size-1.5 rounded-full bg-amber-500" />
          ) : showWorking ? (
            <div className="size-1.5 animate-pulse rounded-full bg-muted-foreground" />
          ) : showError ? (
            <div className="size-1.5 rounded-full bg-destructive" />
          ) : (
            <div className="size-1.5 rounded-full bg-sky-500" />
          )}
        </SidebarMenuBadge>
      )}
    </SidebarMenuItem>
  );
}
