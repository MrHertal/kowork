import { Link } from "@tanstack/react-router";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
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

  const isPinned = usePinnedSessionsData((s) => s.ids.includes(sessionId));
  const { pin, unpin } = usePinnedSessions();

  const title = sessionTitle(storeTitle ?? session?.title);
  const parentID = storeParentID ?? session?.parentID;
  const togglePin = () => {
    if (isPinned) unpin(sessionId);
    else if (session) pin(session);
  };
  const remove = () => deleteSession({ id: sessionId, directory });
  const rename = (newTitle: string) =>
    renameSession({ id: sessionId, directory }, newTitle);

  return { title, parentID, isPinned, togglePin, remove, rename };
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
                  {m.header_main_session()}
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
  isPinned,
  togglePin,
  remove,
  rename,
}: Pick<
  SessionHeaderModel,
  "title" | "isPinned" | "togglePin" | "remove" | "rename"
>) {
  return (
    <NavActions
      isPinned={isPinned}
      onTogglePin={togglePin}
      onDelete={remove}
      onRename={rename}
      title={title || m.common_untitled()}
    />
  );
}
