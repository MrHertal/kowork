import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";

import { ErrorAlert } from "@/components/error-alert";
import { TitlebarSlot } from "@/components/titlebar";
import { Button } from "@/components/ui/button";
import { useGlobalData, useGlobalSync } from "@/contexts/global-sync";
import { LocalProvider } from "@/contexts/local";
import { PromptProvider } from "@/contexts/prompt";
import { SDKProvider } from "@/contexts/sdk";
import { useServer } from "@/contexts/server";
import { SyncProvider } from "@/contexts/sync";
import { m } from "@/paraglide/messages";
import { Page } from "@/pages/session";

export const Route = createFileRoute("/")({
  component: IndexPage,
});

function IndexPage() {
  return (
    <>
      <TitlebarSlot name="center">
        <span className="truncate text-sm text-foreground">Kowork</span>
      </TitlebarSlot>
      <IndexRoute />
    </>
  );
}

function IndexRoute() {
  const defaultDirectory = useGlobalData((s) => s.path.directory);
  const globalReady = useGlobalData((s) => s.ready);
  const globalSync = useGlobalSync();
  const server = useServer();
  const [attachedDirectory, setAttachedDirectory] = useState<string>();
  const directory = attachedDirectory ?? defaultDirectory;

  const onDirectoryChange = useCallback(
    (next: string) => {
      server.projects.open(next);
      server.projects.touch(next);
      setAttachedDirectory(next);
    },
    [server.projects],
  );

  const onDirectoryDetach = useCallback(() => {
    setAttachedDirectory(undefined);
  }, []);

  if (!directory) {
    if (!globalReady) return null;
    return (
      <div className="flex size-full items-center justify-center p-4">
        <div className="flex w-full max-w-md flex-col items-center gap-4">
          <ErrorAlert
            className="w-full"
            title={m.error_defaultFolder_title()}
            text={m.error_defaultFolder_description()}
          />
          <Button variant="outline" onClick={() => void globalSync.bootstrap()}>
            {m.common_retry()}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SDKProvider directory={directory}>
      <SyncProvider>
        <LocalProvider>
          <PromptProvider>
            <div className="h-full">
              <Page
                attachedDirectory={attachedDirectory}
                defaultDirectory={defaultDirectory}
                onDirectoryChange={onDirectoryChange}
                onDirectoryDetach={onDirectoryDetach}
              />
            </div>
          </PromptProvider>
        </LocalProvider>
      </SyncProvider>
    </SDKProvider>
  );
}
