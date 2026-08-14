// @opencode-ref: opencode/packages/app/src/components/titlebar.tsx
import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { usePlatform } from "@/contexts/platform";

const TITLEBAR_HEIGHT = 40;
const MIN_TITLEBAR_ZOOM = 0.25;
const MAC_TRAFFIC_LIGHT_INSET = 84;
const WINDOWS_CONTROLS_WIDTH = 138;

export const SIDEBAR_EXPANDED_WIDTH = "16rem";

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- portal target exists only after mount
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
      {/* Keep the drag region off the macOS traffic lights, or they disappear when unfocused. */}
      <div
        data-no-drag
        aria-hidden
        className="absolute inset-y-0 left-0"
        style={{ width: mac ? `${MAC_TRAFFIC_LIGHT_INSET / zoom}px` : "0px" }}
      />
      <div
        className="flex h-full w-full items-center"
        style={{ zoom: counterZoom }}
      >
        <div
          id="kowork-titlebar-left"
          className="flex h-full min-w-max flex-none items-center pr-2 [transition:width_200ms_linear]"
          style={{
            width: `var(--titlebar-left-width, ${SIDEBAR_EXPANDED_WIDTH})`,
            paddingLeft: mac ? `${MAC_TRAFFIC_LIGHT_INSET / zoom}px` : "8px",
          }}
        />
        <div className="pointer-events-none flex h-full min-w-0 flex-1 items-center justify-start px-4">
          <div
            id="kowork-titlebar-center"
            className="pointer-events-auto flex w-fit max-w-full min-w-0 items-center justify-start gap-2"
          />
        </div>
        <div
          id="kowork-titlebar-right"
          className="flex h-full min-w-max flex-none items-center justify-end gap-1 pr-2 [transition:width_200ms_linear] motion-reduce:transition-none lg:w-[max(0px,calc(var(--titlebar-right-width,0px)-var(--titlebar-right-controls-width,0px)))]"
          style={
            {
              "--titlebar-right-controls-width": windows
                ? controlsWidth
                : "0px",
            } as CSSProperties
          }
        />
      </div>
    </header>
  );
}
