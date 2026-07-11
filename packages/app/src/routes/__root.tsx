import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { Fragment, type ReactNode, useEffect } from "react";
import { ConnectionGate } from "@/components/connection-gate";
import { ServerKey } from "@/components/server-key";
import { Titlebar, titlebarHeightPx } from "@/components/titlebar";
import { TitlebarSidebarToggle } from "@/components/titlebar-sidebar-toggle";
import { usePlatform } from "@/contexts/platform";
import { GlobalSDKProvider } from "@/contexts/global-sdk";
import { GlobalSyncProvider } from "@/contexts/global-sync";
import { ServerConnection, ServerProvider } from "@/contexts/server";
import { ModelsProvider } from "@/contexts/models";
import { NotificationProvider } from "@/contexts/notification";
import { PermissionProvider } from "@/contexts/permission";
import { PinnedSessionsProvider } from "@/contexts/pinned-sessions";
import { RecentSessionsProvider } from "@/contexts/recent-sessions";
import { SearchSessionsProvider } from "@/contexts/search-sessions";
import { SettingsProvider, useSettings } from "@/contexts/settings";
import { DialogProvider } from "@/contexts/dialog";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorScreen } from "@/components/error-screen";
import { SidebarLeft } from "@/components/sidebar-left/sidebar-left";
import { SidebarRight } from "@/components/sidebar-right/sidebar-right";
import {
  SidebarRightProvider,
  useSidebarRight,
} from "@/components/sidebar-right/sidebar-right-context";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useMcpBrowserFailedToast } from "@/hooks/use-mcp-browser-failed-toast";

type RouterContext = {
  queryClient: QueryClient;
  defaultServer?: ServerConnection.Key;
  disableHealthCheck?: boolean;
  servers?: ServerConnection.Any[];
};

export const Route = createRootRouteWithContext<RouterContext>()({
  errorComponent: ErrorScreen,
  component: RootRoute,
});

function LocaleRemountBoundary({ children }: { children: ReactNode }) {
  const settings = useSettings();
  return <Fragment key={settings.general.language}>{children}</Fragment>;
}

function RootLayout() {
  const { open: rightSidebarOpen } = useSidebarRight();
  const { platform, os, webviewZoom } = usePlatform();
  useMcpBrowserFailedToast();

  const mac = platform === "desktop" && os === "macos";
  const windows = platform === "desktop" && os === "windows";
  const zoom = webviewZoom ?? 1;

  // On :root so portaled overlays (mobile sheet) inherit the var.
  useEffect(() => {
    const value =
      mac || windows
        ? `max(2.5rem, ${titlebarHeightPx(mac, windows, zoom)}px)`
        : "2.5rem";
    document.documentElement.style.setProperty("--titlebar-height", value);
  }, [mac, windows, zoom]);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Titlebar />
      <SidebarProvider className="min-h-0 flex-1">
        <TitlebarSidebarToggle />
        <SidebarLeft />
        <SidebarInset className="min-w-0">
          <div className="min-h-0 flex-1">
            <Outlet />
          </div>
        </SidebarInset>
        {rightSidebarOpen && <SidebarRight />}
      </SidebarProvider>
    </div>
  );
}

function RootRoute() {
  const { defaultServer, disableHealthCheck, servers } =
    Route.useRouteContext();

  return (
    <ServerProvider
      defaultServer={defaultServer ?? ServerConnection.Key.make("sidecar")}
      disableHealthCheck={disableHealthCheck}
      servers={servers}
    >
      <ConnectionGate disableHealthCheck={disableHealthCheck}>
        <ServerKey>
          <GlobalSDKProvider>
            <GlobalSyncProvider>
              <RecentSessionsProvider>
                <PinnedSessionsProvider>
                  <SearchSessionsProvider>
                    <SettingsProvider>
                      <PermissionProvider>
                        <NotificationProvider>
                          <ModelsProvider>
                            <TooltipProvider>
                              <DialogProvider>
                                <LocaleRemountBoundary>
                                  <SidebarRightProvider>
                                    <RootLayout />
                                  </SidebarRightProvider>
                                  <Toaster
                                    toastOptions={{
                                      classNames: {
                                        description: "!text-muted-foreground",
                                      },
                                    }}
                                  />
                                </LocaleRemountBoundary>
                              </DialogProvider>
                            </TooltipProvider>
                          </ModelsProvider>
                        </NotificationProvider>
                      </PermissionProvider>
                    </SettingsProvider>
                  </SearchSessionsProvider>
                </PinnedSessionsProvider>
              </RecentSessionsProvider>
            </GlobalSyncProvider>
          </GlobalSDKProvider>
        </ServerKey>
      </ConnectionGate>
    </ServerProvider>
  );
}
