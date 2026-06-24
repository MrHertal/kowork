import type * as React from "react";

interface DetailRowProps {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  subValue?: string;
}

export function DetailRow({
  icon: Icon,
  label,
  value,
  subValue,
}: DetailRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <div className="flex shrink-0 items-center gap-2">
        <Icon className="size-4 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <div className="flex min-w-0 items-baseline gap-1 text-right">
        <div className="truncate font-medium">{value}</div>
        {subValue && (
          <span className="shrink-0 text-xs text-muted-foreground">
            {subValue}
          </span>
        )}
      </div>
    </div>
  );
}
