import { useParams } from "@tanstack/react-router";

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  useSidebar,
} from "@/components/ui/sidebar";
import { shallowArrayEqual } from "@/contexts/global-sync";
import { usePinnedSessionsData } from "@/contexts/pinned-sessions";
import {
  matchesQuery,
  useSearchSessionsData,
} from "@/contexts/search-sessions";
import { useDeleteSession } from "@/hooks/use-delete-session";
import { useRenameSession } from "@/hooks/use-rename-session";
import { m } from "@/paraglide/messages";

import { SessionRow } from "./session-row";

export function NavPinnedSessions() {
  const deleteSession = useDeleteSession();
  const renameSession = useRenameSession();
  const activeId = useParams({
    from: "/session/$id",
    select: (p) => p.id,
    shouldThrow: false,
  });
  const { isMobile } = useSidebar();
  const ids = usePinnedSessionsData((s) => s.ids, shallowArrayEqual);
  const sessions = usePinnedSessionsData((s) => s.sessions);
  const searchQuery = useSearchSessionsData((s) => s.query);

  const trimmed = searchQuery.trim();
  const items = ids
    .map((id) => sessions[id])
    .filter((s) => !!s)
    .filter((s) => trimmed === "" || matchesQuery(s.title, trimmed));

  if (items.length === 0) return null;

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>
        {m.sidebar_group_pinned()}
        <span className="ml-1 text-muted-foreground/60">
          {m.common_count({ count: items.length })}
        </span>
      </SidebarGroupLabel>
      <SidebarMenu>
        {items.map((session) => (
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
      </SidebarMenu>
    </SidebarGroup>
  );
}
