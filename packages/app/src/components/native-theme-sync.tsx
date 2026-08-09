import { useTheme } from "next-themes";
import { useEffect } from "react";

// --background is authored in oklch, which Electron's setBackgroundColor can't
// parse — map to the hex chrome colors used by index.html and windows.ts.
const NATIVE_BACKGROUND = { light: "#F8F7F7", dark: "#131010" } as const;

export function NativeThemeSync() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (resolvedTheme !== "light" && resolvedTheme !== "dark") return;
    void window.api?.setTitlebar?.({ mode: resolvedTheme });
    void window.api?.setBackgroundColor?.(NATIVE_BACKGROUND[resolvedTheme]);
  }, [resolvedTheme]);

  return null;
}
