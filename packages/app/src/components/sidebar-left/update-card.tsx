import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { usePlatform } from "@/contexts/platform";
import { m } from "@/paraglide/messages";

import { useUpdateCheck } from "@/hooks/use-update-check";

export function UpdateCard() {
  const platform = usePlatform();
  const update = useUpdateCheck();
  const [installing, setInstalling] = useState(false);
  const forceVisible = true;

  if (
    !forceVisible &&
    (!update.data?.updateAvailable || !update.data.version || !platform.update)
  )
    return null;

  return (
    <Card className="gap-2 py-4 shadow-none">
      <CardHeader className="px-4">
        <CardTitle className="text-sm">{m.updates_available()}</CardTitle>
        <CardDescription>{m.updates_description()}</CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        <Button
          size="sm"
          className="w-full bg-sidebar-primary text-sidebar-primary-foreground shadow-none"
          disabled={installing}
          onClick={() => {
            void (async () => {
              setInstalling(true);
              try {
                await platform.update?.();
              } catch (error) {
                toast.error(m.common_requestFailed(), {
                  description:
                    error instanceof Error ? error.message : String(error),
                });
              } finally {
                setInstalling(false);
              }
            })();
          }}
        >
          {installing ? "…" : m.updates_installRestart()}
        </Button>
      </CardContent>
    </Card>
  );
}
