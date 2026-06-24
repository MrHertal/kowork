import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface SettingsListItemProps {
  icon?: ReactNode;
  title: ReactNode;
  badge?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

export function SettingsListItem({
  icon,
  title,
  badge,
  description,
  action,
}: SettingsListItemProps) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex items-center gap-3">
          {icon}
          <span className="truncate text-sm font-medium">{title}</span>
          {badge}
        </div>
        {description && (
          <span
            className={cn(
              "line-clamp-2 text-xs wrap-anywhere text-muted-foreground",
              icon && "ps-8",
            )}
          >
            {description}
          </span>
        )}
      </div>
      {action}
    </div>
  );
}

export function SettingsListItemSkeleton() {
  return <Skeleton className="h-12 rounded-lg" />;
}
