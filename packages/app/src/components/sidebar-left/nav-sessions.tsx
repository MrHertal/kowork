import { useParams } from "@tanstack/react-router";
import { MoreHorizontal } from "lucide-react";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { shallowArrayEqual } from "@/contexts/global-sync";
import { usePinnedSessionsData } from "@/contexts/pinned-sessions";
import {
  useRecentSessions,
  useRecentSessionsData,
} from "@/contexts/recent-sessions";
import { useSearchSessionsData } from "@/contexts/search-sessions";
import { useDeleteSession } from "@/hooks/use-delete-session";
import { useRenameSession } from "@/hooks/use-rename-session";
import { m } from "@/paraglide/messages";

import { SessionRow } from "./session-row";

export function NavSessions() {
  const deleteSession = useDeleteSession();
  const renameSession = useRenameSession();
  const activeId = useParams({
    from: "/session/$id",
    select: (p) => p.id,
    shouldThrow: false,
  });
  const { isMobile } = useSidebar();
  const recent = useRecentSessionsData((s) => s.sessions);
  const hasMore = useRecentSessionsData((s) => s.cursor != null);
  const searchQuery = useSearchSessionsData((s) => s.query);
  const searchResults = useSearchSessionsData((s) => s.results);
  const pinnedIds = usePinnedSessionsData((s) => s.ids, shallowArrayEqual);
  const { loadMore } = useRecentSessions();

  const isSearching = searchQuery.trim() !== "";
  const pinnedSet = new Set(pinnedIds);
  const sessions = isSearching ? searchResults : recent;
  const visible = sessions.filter((s) => !pinnedSet.has(s.id));

  if (visible.length === 0) return null;

  const showMore = !isSearching && hasMore;

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>{m.sidebar_group_conversations()}</SidebarGroupLabel>
      <SidebarMenu>
        {visible.map((session) => (
          <SessionRow
            key={session.id}
            session={session}
            isActive={activeId === session.id}
            isMobile={isMobile}
            onDelete={() =>
              deleteSession({
                id: session.id,
                directory: session.directory,
              })
            }
            onRename={(newTitle) =>
              renameSession(
                { id: session.id, directory: session.directory },
                newTitle,
              )
            }
          />
        ))}
        {showMore && (
          <SidebarMenuItem>
            <SidebarMenuButton
              className="text-sidebar-foreground/70"
              onClick={() => loadMore()}
            >
              <MoreHorizontal />
              <span>{m.sidebar_action_more()}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )}
      </SidebarMenu>
    </SidebarGroup>
  );
}
