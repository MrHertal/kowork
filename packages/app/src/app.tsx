import "./index.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import { useMemo } from "react";

import { TitlebarThemeSync } from "@/components/titlebar-theme-sync";
import type { Platform } from "./contexts/platform";
import { PlatformProvider } from "./contexts/platform";
import type { ServerConnection } from "./contexts/server";
import { routeTree } from "./routeTree.gen";

const queryClient = new QueryClient();

function buildRouter(
  memoryHistory?: boolean,
  serverConfig?: {
    defaultServer?: ServerConnection.Key;
    disableHealthCheck?: boolean;
    servers?: ServerConnection.Any[];
  },
) {
  return createRouter({
    routeTree,
    history: memoryHistory
      ? createMemoryHistory({ initialEntries: ["/"] })
      : undefined,
    context: {
      queryClient,
      defaultServer: serverConfig?.defaultServer,
      disableHealthCheck: serverConfig?.disableHealthCheck,
      servers: serverConfig?.servers,
    },
  });
}

type AppRouter = ReturnType<typeof buildRouter>;

declare global {
  interface Window {
    api?: {
      setTitlebar?: (theme: { mode: "light" | "dark" }) => Promise<void>;
    };
  }
}

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}

type AppProps = {
  platform: Platform;
  memoryHistory?: boolean;
  defaultServer?: ServerConnection.Key;
  disableHealthCheck?: boolean;
  servers?: ServerConnection.Any[];
};

export function App({
  platform,
  memoryHistory,
  defaultServer,
  disableHealthCheck,
  servers,
}: AppProps) {
  const router = useMemo(
    () =>
      buildRouter(memoryHistory, {
        defaultServer,
        disableHealthCheck,
        servers,
      }),
    [memoryHistory, defaultServer, disableHealthCheck, servers],
  );

  return (
    <PlatformProvider value={platform}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <TitlebarThemeSync />
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ThemeProvider>
    </PlatformProvider>
  );
}
