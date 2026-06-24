import { cn } from "@/lib/utils";
import { usePlatform } from "@/contexts/platform";

export function Titlebar() {
  const { platform, os, webviewZoom } = usePlatform();

  const mac = platform === "desktop" && os === "macos";
  const windows = platform === "desktop" && os === "windows";
  const zoom = webviewZoom ?? 1;
  const minHeight = mac ? `${40 / zoom}px` : undefined;

  if (platform !== "desktop") return null;
  if (os === "linux") return null;

  return (
    <header
      className={cn("relative h-10 shrink-0 border-b", windows && "pr-36")}
      style={
        {
          minHeight,
          WebkitAppRegion: "drag",
        } as React.CSSProperties
      }
    />
  );
}
