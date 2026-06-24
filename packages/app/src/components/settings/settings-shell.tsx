import {
  BellIcon,
  BlocksIcon,
  BoxesIcon,
  GraduationCapIcon,
  PlugIcon,
  Settings2Icon,
} from "lucide-react";
import { Fragment, type ReactNode } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { m } from "@/paraglide/messages";

// ---------------------------------------------------------------------------
// Shared nav items — single source of truth for the settings sidebar
// ---------------------------------------------------------------------------

export type SettingsSection =
  | "general"
  | "notifications"
  | "models"
  | "providers"
  | "mcp"
  | "skills";

interface NavItem {
  id: SettingsSection;
  name: () => string;
  icon: React.ComponentType<{ className?: string }>;
}

export const NAV_ITEMS: NavItem[] = [
  { id: "general", name: m.settings_general_navItem, icon: Settings2Icon },
  {
    id: "notifications",
    name: m.settings_notifications_navItem,
    icon: BellIcon,
  },
  { id: "providers", name: m.settings_providers_navItem, icon: BlocksIcon },
  { id: "models", name: m.settings_models_navItem, icon: BoxesIcon },
  { id: "mcp", name: m.settings_mcp_navItem, icon: PlugIcon },
  { id: "skills", name: m.settings_skills_navItem, icon: GraduationCapIcon },
];

// ---------------------------------------------------------------------------
// SettingsShell — reusable dialog frame with sidebar + breadcrumb
// ---------------------------------------------------------------------------

interface BreadcrumbParent {
  label: string;
  onClick: () => void;
}

interface SettingsShellProps {
  title: string;
  breadcrumbParents?: BreadcrumbParent[];
  activeNavItem?: string;
  onNavItemClick: (id: SettingsSection) => void;
  children: ReactNode;
}

export function SettingsShell({
  title,
  breadcrumbParents,
  activeNavItem,
  onNavItemClick,
  children,
}: SettingsShellProps) {
  return (
    <DialogContent
      className="flex h-[70dvh] flex-col overflow-hidden p-0 sm:max-w-[calc(100%-2rem)] md:grid md:h-auto md:max-h-[min(580px,85dvh)] md:max-w-[700px] lg:max-w-[880px]"
      onOpenAutoFocus={(e) => {
        e.preventDefault();
        if (e.currentTarget instanceof HTMLElement) {
          e.currentTarget.focus();
        }
      }}
    >
      <DialogTitle className="sr-only">{m.dialog_settings_title()}</DialogTitle>
      <DialogDescription className="sr-only">
        {m.dialog_settings_description()}
      </DialogDescription>
      <SidebarProvider
        className="min-h-0 flex-1 items-start overflow-hidden"
        style={{ "--sidebar-width": "14rem" } as React.CSSProperties}
      >
        <Sidebar collapsible="none" className="hidden md:flex">
          <SidebarContent>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  {NAV_ITEMS.map((item) => (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        isActive={item.id === activeNavItem}
                        onClick={() => onNavItemClick(item.id)}
                      >
                        <item.icon />
                        <span>{item.name()}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
        <main className="flex min-h-0 flex-1 flex-col self-stretch overflow-hidden bg-background md:h-[min(560px,calc(85dvh-20px))]">
          <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
            <div className="flex min-w-0 flex-1 items-center gap-2 px-4 pr-14">
              {breadcrumbParents?.length ? (
                <Breadcrumb className="min-w-0">
                  <BreadcrumbList className="flex-nowrap overflow-hidden">
                    {breadcrumbParents.map((parent, i) => (
                      <Fragment key={i}>
                        <BreadcrumbItem className="shrink-0">
                          <BreadcrumbLink
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              parent.onClick();
                            }}
                          >
                            {parent.label}
                          </BreadcrumbLink>
                        </BreadcrumbItem>
                        <BreadcrumbSeparator />
                      </Fragment>
                    ))}
                    <BreadcrumbItem className="min-w-0">
                      <BreadcrumbPage className="truncate">
                        {title}
                      </BreadcrumbPage>
                    </BreadcrumbItem>
                  </BreadcrumbList>
                </Breadcrumb>
              ) : (
                <>
                  <span className="hidden truncate text-sm font-medium md:inline">
                    {title}
                  </span>
                  {activeNavItem && (
                    <Select
                      value={activeNavItem}
                      onValueChange={(value) =>
                        onNavItemClick(value as SettingsSection)
                      }
                    >
                      <SelectTrigger size="sm" className="md:hidden">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent
                        position="popper"
                        side="bottom"
                        align="start"
                      >
                        {NAV_ITEMS.map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            <item.icon />
                            {item.name()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </>
              )}
            </div>
          </header>
          <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-4 pt-1">
            {children}
          </div>
        </main>
      </SidebarProvider>
    </DialogContent>
  );
}
