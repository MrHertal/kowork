import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface SettingsSectionProps {
  title?: string;
  bordered?: boolean;
  children: ReactNode;
  className?: string;
}

export function SettingsSection({
  title,
  bordered = true,
  children,
  className,
}: SettingsSectionProps) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      {title && (
        <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      )}
      {bordered ? (
        <div className="divide-y divide-border rounded-lg border">
          {children}
        </div>
      ) : (
        children
      )}
    </section>
  );
}

interface SettingsRowProps {
  title: ReactNode;
  description?: ReactNode;
  orientation?: "horizontal" | "vertical";
  children: ReactNode;
}

export function SettingsRow({
  title,
  description,
  orientation = "horizontal",
  children,
}: SettingsRowProps) {
  const vertical = orientation === "vertical";
  return (
    <div
      className={cn("flex gap-4 p-4", vertical ? "flex-col" : "items-center")}
    >
      <div className={cn("flex flex-col gap-2", !vertical && "min-w-0 flex-1")}>
        <span className="text-sm font-medium">{title}</span>
        {description && (
          <span className="text-xs text-muted-foreground">{description}</span>
        )}
      </div>
      {children}
    </div>
  );
}
