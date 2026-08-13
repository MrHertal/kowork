import { useState } from "react";

import { usePlatform } from "@/contexts/platform";
import { m } from "@/paraglide/messages";

import { useUpdateCheck } from "@/hooks/use-update-check";

export function UpdateCard() {
  const platform = usePlatform();
  const update = useUpdateCheck();
  const [installing, setInstalling] = useState(false);

  if (!update.data?.updateAvailable || !update.data?.version) return null;
  if (!platform.update) return null;

  return (
    <div className="rounded-md border border-sidebar-border bg-sidebar p-2 text-xs">
      <div className="mb-2 font-medium">{m.updates_available()}</div>
      <div className="mb-2 text-muted-foreground">
        v{update.data.version}
      </div>
      <button
        type="button"
        disabled={installing}
        onClick={() => {
          void (async () => {
            setInstalling(true);
            try {
              await platform.update?.();
            } finally {
              setInstalling(false);
            }
          })();
        }}
        className="inline-flex h-7 items-center rounded-md bg-sidebar-primary px-2.5 text-xs font-medium text-sidebar-primary-foreground hover:bg-sidebar-primary/90 disabled:opacity-50"
      >
        {installing ? "…" : m.updates_installRestart()}
      </button>
    </div>
  );
}
