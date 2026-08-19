import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import { Fragment, type ReactNode, useEffect } from "react";
import { ConnectionGate } from "@/components/connection-gate";
import { ServerKey } from "@/components/server-key";
import { Titlebar, titlebarHeightPx } from "@/components/titlebar";
import { TitlebarSidebarToggle } from "@/components/titlebar-sidebar-toggle";
import { MenuCommands } from "@/components/menu-commands";
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
import { SidebarLeftProvider } from "@/components/sidebar-left/sidebar-left-provider";
import { SidebarRight } from "@/components/sidebar-right/sidebar-right";
import { SidebarRightProvider } from "@/components/sidebar-right/sidebar-right-context";
import { SidebarRightTrigger } from "@/components/sidebar-right/sidebar-right-trigger";
import { SidebarInset } from "@/components/ui/sidebar";
import { useMcpBrowserFailedToast } from "@/hooks/use-mcp-browser-failed-toast";
import { UpdateCheck } from "@/hooks/use-update-check";

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
      <SidebarLeftProvider className="min-h-0 flex-1">
        <TitlebarSidebarToggle />
        <SidebarRightTrigger />
        <MenuCommands />
        <SidebarLeft />
        <SidebarInset className="min-w-0">
          <div className="min-h-0 flex-1">
            <Outlet />
          </div>
        </SidebarInset>
        <SidebarRight />
      </SidebarLeftProvider>
    </div>
  );
}

function RootRoute() {
  const { defaultServer, disableHealthCheck, servers } =
    Route.useRouteContext();
  const rightSidebarAvailable = useRouterState({
    select: (state) =>
      state.matches.some((match) => match.routeId === "/session/$id"),
  });

  return (
    <ServerProvider
      defaultServer={defaultServer ?? ServerConnection.Key.make("sidecar")}
      disableHealthCheck={disableHealthCheck}
      servers={servers}
    >
      <SettingsProvider>
        <UpdateCheck />
        <ConnectionGate disableHealthCheck={disableHealthCheck}>
          <ServerKey>
            <GlobalSDKProvider>
              <GlobalSyncProvider>
                <RecentSessionsProvider>
                  <PinnedSessionsProvider>
                    <SearchSessionsProvider>
                      <PermissionProvider>
                        <NotificationProvider>
                          <ModelsProvider>
                            <TooltipProvider delayDuration={700}>
                              <DialogProvider>
                                <LocaleRemountBoundary>
                                  <SidebarRightProvider
                                    routeAvailable={rightSidebarAvailable}
                                  >
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
                    </SearchSessionsProvider>
                  </PinnedSessionsProvider>
                </RecentSessionsProvider>
              </GlobalSyncProvider>
            </GlobalSDKProvider>
          </ServerKey>
        </ConnectionGate>
      </SettingsProvider>
    </ServerProvider>
  );
}
