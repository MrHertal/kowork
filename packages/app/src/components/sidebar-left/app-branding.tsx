// import logoUrl from "@/assets/logo.svg";
import { SidebarMenu, SidebarMenuItem } from "@/components/ui/sidebar";

export function AppBranding() {
  return (
    <SidebarMenu className="px-2 pt-1">
      <SidebarMenuItem>
        <div className="flex h-8 w-full items-center gap-2 overflow-hidden rounded-md p-1.5 text-sm">
          {/* <img
            src={logoUrl}
            alt="Kowork"
            className="size-5 shrink-0"
          /> */}
          <span className="truncate text-base font-semibold">Kowork</span>
        </div>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
