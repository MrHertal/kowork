import { InfoIcon } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SidebarGroupAction,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import { useSessionContext } from "@/hooks/use-session-context";
import { useLocale } from "@/lib/i18n";
import { m } from "@/paraglide/messages";

export function TaskContextSection({ sessionId }: { sessionId: string }) {
  const locale = useLocale();
  const context = useSessionContext(sessionId);
  const percentFormatter = new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 0,
  });
  const percent =
    context.usage?.percent === null || context.usage?.percent === undefined
      ? "\u2014"
      : `${percentFormatter.format(Math.min(context.usage.percent, 100) / 100)}${context.usage.percent > 100 ? "+" : ""}`;
  const tokens = new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(context.usage?.tokens ?? 0);
  const cost =
    context.cost === null || context.cost === undefined
      ? "\u2014"
      : new Intl.NumberFormat(locale, {
          style: "currency",
          currency: "USD",
        }).format(context.cost);

  return (
    <SidebarGroup>
      <SidebarGroupLabel asChild>
        <h2>{m.sessionInfo_context()}</h2>
      </SidebarGroupLabel>
      <Popover>
        <PopoverTrigger asChild>
          <SidebarGroupAction
            aria-label={m.sessionInfo_aboutContext()}
            className="right-4 text-sidebar-foreground/70 [&>svg]:size-3"
          >
            <InfoIcon aria-hidden="true" />
          </SidebarGroupAction>
        </PopoverTrigger>
        <PopoverContent side="left" align="start">
          <PopoverHeader>
            <PopoverTitle>{m.sessionInfo_aboutContext()}</PopoverTitle>
          </PopoverHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <div className="text-sm font-medium">
                {m.sessionInfo_capacity()}
              </div>
              <PopoverDescription>
                {m.sessionInfo_contextCapacityDescription()}
              </PopoverDescription>
            </div>
            <div className="space-y-1">
              <div className="text-sm font-medium">
                {m.sessionInfo_estimatedProviderCost()}
              </div>
              <PopoverDescription>
                {m.sessionInfo_contextCostDescription()}
              </PopoverDescription>
            </div>
          </div>
          <PopoverDescription className="text-xs">
            {m.sessionInfo_contextChildSessionNote()}
          </PopoverDescription>
        </PopoverContent>
      </Popover>
      <SidebarGroupContent className="px-3 py-2">
        <dl>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
            <dt className="min-w-0 text-sm text-sidebar-foreground">
              <span className="block truncate">{m.sessionInfo_capacity()}</span>
            </dt>
            <dd className="min-w-10 shrink-0 text-right text-xs font-normal text-sidebar-foreground tabular-nums">
              {context.isCapacityPending ? (
                <Skeleton className="ml-auto h-3 w-8 rounded-full" />
              ) : (
                percent
              )}
            </dd>
            <dd className="col-span-2">
              <div className="mt-2 h-1.5">
                {context.isCapacityPending ? (
                  <Skeleton className="h-full w-full rounded-full" />
                ) : context.usage?.percent !== null &&
                  context.usage?.percent !== undefined ? (
                  <Progress
                    value={Math.min(Math.max(context.usage.percent, 0), 100)}
                    aria-label={m.sessionInfo_capacity()}
                    aria-valuenow={Math.min(
                      Math.max(context.usage.percent, 0),
                      100,
                    )}
                    aria-valuetext={percent}
                    className="h-full bg-sidebar-foreground/10 [&_[data-slot=progress-indicator]]:bg-sidebar-foreground"
                  />
                ) : (
                  <div className="h-full" aria-hidden="true" />
                )}
              </div>
              <div className="mt-2 min-h-4 min-w-0 text-xs text-sidebar-foreground/70">
                {context.isLoading ? (
                  <Skeleton className="h-4 w-24 rounded-full" />
                ) : (
                  <span className="block truncate">
                    {m.sessionInfo_tokensInUse({ tokens })}
                  </span>
                )}
              </div>
            </dd>
          </div>
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-t border-sidebar-border pt-3">
            <dt className="min-w-0 text-sm text-sidebar-foreground">
              <span className="block truncate">
                {m.sessionInfo_estimatedProviderCost()}
              </span>
            </dt>
            <dd className="min-w-16 shrink-0 text-right text-xs font-normal whitespace-nowrap text-sidebar-foreground tabular-nums">
              {context.isCostPending ? (
                <Skeleton className="ml-auto h-3 w-10 rounded-full" />
              ) : (
                cost
              )}
            </dd>
          </div>
        </dl>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
