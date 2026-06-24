import { useEffect } from "react";
import { toast } from "sonner";

import { useGlobalSDK } from "@/contexts/global-sdk";
import { usePlatform } from "@/contexts/platform";
import { m } from "@/paraglide/messages";

export function useMcpBrowserFailedToast() {
  const globalSDK = useGlobalSDK();
  const platform = usePlatform();

  useEffect(() => {
    return globalSDK.event.listen((e) => {
      if (e.details.type !== "mcp.browser.open.failed") return;
      const { url } = e.details.properties;

      toast.error(m.settings_mcp_browser_failed_title(), {
        description: m.settings_mcp_browser_failed_description(),
        duration: 30_000,
        action: {
          label: m.common_copy_url(),
          onClick: () => {
            void navigator.clipboard.writeText(url).catch(() => {
              platform.openLink(url);
            });
          },
        },
      });
    });
  }, [globalSDK.event, platform]);
}
