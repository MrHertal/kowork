import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";

import { AppHeader } from "@/components/header/app-header";
import { useGlobalData } from "@/contexts/global-sync";
import { LocalProvider } from "@/contexts/local";
import { PromptProvider } from "@/contexts/prompt";
import { SDKProvider } from "@/contexts/sdk";
import { useServer } from "@/contexts/server";
import { SyncProvider } from "@/contexts/sync";
import { Page } from "@/pages/session";

export const Route = createFileRoute("/")({
  component: IndexRoute,
});

function IndexRoute() {
  const defaultDirectory = useGlobalData((s) => s.path.directory);
  const server = useServer();
  const [directory, setDirectory] = useState<string | undefined>(
    () => server.projects.last() ?? defaultDirectory,
  );

  useEffect(() => {
    if (directory) return;
    setDirectory(server.projects.last() ?? defaultDirectory);
  }, [directory, defaultDirectory, server.projects]);

  const onDirectoryChange = useCallback(
    (next: string) => {
      server.projects.open(next);
      server.projects.touch(next);
      setDirectory(next);
    },
    [server.projects],
  );

  if (!directory) return null;

  return (
    <SDKProvider directory={directory}>
      <SyncProvider>
        <LocalProvider>
          <PromptProvider>
            <div className="flex h-full flex-col">
              <AppHeader />
              <div className="min-h-0 flex-1">
                <Page onDirectoryChange={onDirectoryChange} />
              </div>
            </div>
          </PromptProvider>
        </LocalProvider>
      </SyncProvider>
    </SDKProvider>
  );
}
