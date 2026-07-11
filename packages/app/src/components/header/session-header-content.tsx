import { Link } from "@tanstack/react-router";
import { formatDistanceToNow } from "date-fns";
import { Pin } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { useChildData } from "@/contexts/global-sync";
import {
  usePinnedSessions,
  usePinnedSessionsData,
} from "@/contexts/pinned-sessions";
import { useSDK } from "@/contexts/sdk";
import { useDeleteSession } from "@/hooks/use-delete-session";
import { useRenameSession } from "@/hooks/use-rename-session";
import { useSession } from "@/hooks/use-session";
import { m } from "@/paraglide/messages";
import { getDateLocale } from "@/utils/locale";
import { sessionTitle } from "@/utils/session-title";

import { NavActions } from "./nav-actions";

export function useSessionHeader(sessionId: string) {
  const { directory } = useSDK();
  const deleteSession = useDeleteSession();
  const renameSession = useRenameSession();
  const { data: session } = useSession(sessionId);

  const storeTitle = useChildData(
    directory,
    (s) => s.session.find((item) => item.id === sessionId)?.title,
  );
  const storeParentID = useChildData(
    directory,
    (s) => s.session.find((item) => item.id === sessionId)?.parentID,
  );
  const storeUpdatedMs = useChildData(
    directory,
    (s) => s.session.find((item) => item.id === sessionId)?.time.updated,
  );

  const title = sessionTitle(storeTitle ?? session?.title);
  const parentID = storeParentID ?? session?.parentID;
  const updatedMs = storeUpdatedMs ?? session?.time.updated;
  const updatedAt = updatedMs
    ? formatDistanceToNow(updatedMs, {
        addSuffix: true,
        locale: getDateLocale(),
      })
    : undefined;

  const isPinned = usePinnedSessionsData((s) => s.ids.includes(sessionId));
  const { pin, unpin } = usePinnedSessions();

  const togglePin = () => {
    if (isPinned) {
      unpin(sessionId);
      return;
    }
    if (session) pin(session);
  };
  const remove = () => deleteSession({ id: sessionId, directory });
  const rename = (newTitle: string) =>
    renameSession({ id: sessionId, directory }, newTitle);

  return { title, parentID, updatedAt, isPinned, togglePin, remove, rename };
}

export type SessionHeaderModel = ReturnType<typeof useSessionHeader>;

export function SessionTitle({
  title,
  parentID,
}: Pick<SessionHeaderModel, "title" | "parentID">) {
  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {parentID && (
          <>
            <BreadcrumbItem className="shrink-0">
              <BreadcrumbLink asChild>
                <Link to="/session/$id" params={{ id: parentID }}>
                  {m.header_main_conversation()}
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </>
        )}
        <BreadcrumbItem className="min-w-0">
          <BreadcrumbPage className="truncate">
            {title || m.common_untitled()}
          </BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export function SessionActions({
  title,
  updatedAt,
  isPinned,
  togglePin,
  remove,
  rename,
}: SessionHeaderModel) {
  return (
    <>
      {updatedAt && (
        <div className="mr-1.5 hidden text-sm font-medium text-muted-foreground md:inline-block">
          {updatedAt}
        </div>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={togglePin}
        aria-pressed={isPinned}
        aria-label={isPinned ? m.common_unpin() : m.common_pin()}
      >
        <Pin
          className={isPinned ? "text-primary" : undefined}
          fill={isPinned ? "currentColor" : "none"}
        />
      </Button>
      <NavActions
        onDelete={remove}
        onRename={rename}
        title={title || m.common_untitled()}
      />
    </>
  );
}
