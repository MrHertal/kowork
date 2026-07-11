// @opencode-ref: opencode/packages/app/src/components/titlebar.tsx
import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { usePlatform } from "@/contexts/platform";
import { cn } from "@/lib/utils";

const TITLEBAR_HEIGHT = 40;
const MIN_TITLEBAR_ZOOM = 0.25;
const MAC_TRAFFIC_LIGHT_INSET = 84;
const WINDOWS_CONTROLS_WIDTH = 138;

export function titlebarHeightPx(mac: boolean, windows: boolean, zoom: number) {
  if (mac) return TITLEBAR_HEIGHT / zoom;
  if (windows)
    return TITLEBAR_HEIGHT / Math.min(Math.max(zoom, MIN_TITLEBAR_ZOOM), 1);
  return TITLEBAR_HEIGHT;
}

export type TitlebarSlotName = "left" | "center" | "right";

export function TitlebarSlot({
  name,
  children,
}: {
  name: TitlebarSlotName;
  children: ReactNode;
}) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setTarget(document.getElementById(`kowork-titlebar-${name}`));
  }, [name]);
  return target ? createPortal(children, target) : null;
}

export function Titlebar() {
  const { platform, os, webviewZoom } = usePlatform();

  const mac = platform === "desktop" && os === "macos";
  const windows = platform === "desktop" && os === "windows";
  const zoom = webviewZoom ?? 1;
  const titlebarZoom = windows ? Math.max(zoom, MIN_TITLEBAR_ZOOM) : zoom;
  const counterZoom = windows && titlebarZoom < 1 ? 1 / titlebarZoom : 1;
  const controlsWidth = `${WINDOWS_CONTROLS_WIDTH / Math.max(titlebarZoom, 1)}px`;
  const availableWidth = `env(titlebar-area-width, calc(100vw - ${controlsWidth}))`;

  const style: CSSProperties = {
    minHeight:
      mac || windows ? `${titlebarHeightPx(mac, windows, zoom)}px` : undefined,
    paddingLeft: mac ? `${MAC_TRAFFIC_LIGHT_INSET / zoom}px` : undefined,
    width: windows ? availableWidth : undefined,
    maxWidth: windows ? availableWidth : undefined,
    alignSelf: windows ? "flex-start" : undefined,
  };

  return (
    <header
      data-drag-region
      className="relative flex h-10 shrink-0 overflow-hidden bg-background shadow-[inset_0_-1px_0_0_var(--border)]"
      style={style}
    >
      <div
        className="grid h-full w-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center"
        style={{ zoom: counterZoom }}
      >
        <div
          id="kowork-titlebar-left"
          className={cn("flex min-w-0 items-center gap-1", !mac && "pl-2")}
        />
        <div className="pointer-events-none flex min-w-0 items-center justify-center">
          <div
            id="kowork-titlebar-center"
            className="pointer-events-auto flex w-fit min-w-0 max-w-full justify-center"
          />
        </div>
        <div
          id="kowork-titlebar-right"
          className="flex min-w-0 items-center justify-end gap-1 pr-2"
        />
      </div>
    </header>
  );
}
