import { InfoIcon } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSessionContext } from "@/hooks/use-session-context";
import { useLocale } from "@/lib/i18n";
import { m } from "@/paraglide/messages";

function HelpIcon({ label, tooltip }: { label: string; tooltip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={m.sessionInfo_moreInformation({ label })}
          className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-sidebar-foreground/50 ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2"
        >
          <InfoIcon className="size-3" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="left" className="max-w-64 text-pretty">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

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
      <SidebarGroupContent className="px-3 py-2">
        <dl>
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3">
            <dt className="flex min-w-0 items-center gap-1 text-sm text-sidebar-foreground">
              <span className="truncate">{m.sessionInfo_capacity()}</span>
              <HelpIcon
                label={m.sessionInfo_capacity()}
                tooltip={m.sessionInfo_capacityTooltip()}
              />
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
              <div className="mt-2 flex min-h-4 min-w-0 items-center gap-1 text-xs text-sidebar-foreground/70">
                {context.isLoading ? (
                  <Skeleton className="h-4 w-24 rounded-full" />
                ) : (
                  <>
                    <span className="truncate">
                      {m.sessionInfo_tokensInUse({ tokens })}
                    </span>
                    <HelpIcon
                      label={m.sessionInfo_tokensInUse({ tokens })}
                      tooltip={m.sessionInfo_tokensTooltip()}
                    />
                  </>
                )}
              </div>
            </dd>
          </div>
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 border-t border-sidebar-border pt-3">
            <dt className="flex min-w-0 items-center gap-1 text-sm text-sidebar-foreground">
              <span className="truncate">
                {m.sessionInfo_estimatedProviderCost()}
              </span>
              <HelpIcon
                label={m.sessionInfo_estimatedProviderCost()}
                tooltip={m.sessionInfo_estimatedProviderCostTooltip()}
              />
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
