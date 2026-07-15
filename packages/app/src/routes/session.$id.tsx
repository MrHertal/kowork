import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { SessionTitlebar } from "@/components/header/session-titlebar";
import { Spinner } from "@/components/ui/spinner";
import { useGlobalData } from "@/contexts/global-sync";
import { LocalProvider } from "@/contexts/local";
import { useNotification, useNotificationData } from "@/contexts/notification";
import { PromptProvider } from "@/contexts/prompt";
import { SDKProvider } from "@/contexts/sdk";
import { SyncProvider } from "@/contexts/sync";
import { useDelayedShow } from "@/hooks/use-delayed-show";
import { useSession } from "@/hooks/use-session";
import { m } from "@/paraglide/messages";
import { Page } from "@/pages/session";
import { getSessionDirectoryMode } from "@/utils/session-directory";

export const Route = createFileRoute("/session/$id")({
  component: SessionRoute,
});

function SessionRoute() {
  const { id } = Route.useParams();
  const { isPending, isError, data: session } = useSession(id);
  const defaultDirectory = useGlobalData((s) => s.path.directory);
  const { sessionMarkViewed } = useNotification();
  const unseenCount = useNotificationData(
    (s) => s.index.session.unseenCount[id] ?? 0,
  );

  useEffect(() => {
    if (unseenCount > 0) sessionMarkViewed(id);
  }, [id, unseenCount, sessionMarkViewed]);

  const showLoader = useDelayedShow(isPending, 300);

  if (isPending) {
    if (!showLoader) return null;
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground">
          {m.error_session_loadFailed()}
        </p>
      </div>
    );
  }

  return (
    <SDKProvider directory={session.directory}>
      <SyncProvider>
        <LocalProvider sessionId={session.id}>
          <PromptProvider sessionId={session.id}>
            <SessionTitlebar sessionId={session.id} />
            <div className="h-full">
              <Page
                sessionId={session.id}
                folderAttached={
                  getSessionDirectoryMode(session, defaultDirectory) ===
                  "attached"
                }
              />
            </div>
          </PromptProvider>
        </LocalProvider>
      </SyncProvider>
    </SDKProvider>
  );
}
