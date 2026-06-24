import { useEffect, useMemo } from "react";

import { useGlobalSDK } from "@/contexts/global-sdk";
import { useGlobalSync } from "@/contexts/global-sync";

export function useMcpStatusSync(directory: string) {
  const globalSDK = useGlobalSDK();
  const globalSync = useGlobalSync();

  const client = useMemo(
    () => globalSDK.createClient({ directory, throwOnError: true }),
    [globalSDK, directory],
  );

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const result = await client.mcp.status();
        if (cancelled) return;
        globalSync.updateChild(directory, (d) => {
          d.mcp = result.data ?? {};
          d.mcp_ready = true;
        });
      } catch {
        // Surfaced elsewhere; keep current store state.
      }
    };

    void refresh();

    const unsubscribe = globalSDK.event.on(directory, (event) => {
      if (event.type === "mcp.tools.changed") void refresh();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [client, directory, globalSDK, globalSync]);
}
