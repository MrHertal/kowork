import { MessageCircleOff, SearchX } from "lucide-react";

import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { shallowArrayEqual } from "@/contexts/global-sync";
import { usePinnedSessionsData } from "@/contexts/pinned-sessions";
import { useRecentSessionsData } from "@/contexts/recent-sessions";
import {
  matchesQuery,
  useSearchSessionsData,
} from "@/contexts/search-sessions";
import { m } from "@/paraglide/messages";

export function SessionsEmpty() {
  const recent = useRecentSessionsData((s) => s.sessions);
  const recentLoading = useRecentSessionsData((s) => s.loading);
  const searchQuery = useSearchSessionsData((s) => s.query);
  const searchResults = useSearchSessionsData((s) => s.results);
  const searchLoading = useSearchSessionsData((s) => s.loading);
  const pinnedIds = usePinnedSessionsData((s) => s.ids, shallowArrayEqual);
  const pinnedSessions = usePinnedSessionsData((s) => s.sessions);

  const trimmed = searchQuery.trim();
  const isSearching = trimmed !== "";
  const loading = isSearching ? searchLoading : recentLoading;

  if (loading) return null;

  const pinnedSet = new Set(pinnedIds);
  const sessions = isSearching ? searchResults : recent;
  const recentVisible = sessions.filter((s) => !pinnedSet.has(s.id));

  const pinnedHasItems = isSearching
    ? pinnedIds.some((id) => {
        const session = pinnedSessions[id];
        return session ? matchesQuery(session.title, trimmed) : false;
      })
    : pinnedIds.length > 0;

  if (recentVisible.length > 0 || pinnedHasItems) return null;

  const Icon = isSearching ? SearchX : MessageCircleOff;
  const message = isSearching
    ? m.sidebar_sessions_no_matches()
    : m.sidebar_sessions_empty();

  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle className="text-xs font-normal">{message}</EmptyTitle>
      </EmptyHeader>
    </Empty>
  );
}
