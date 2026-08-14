import { useTheme } from "next-themes";
import { useEffect } from "react";

// --background is authored in oklch, which Electron's setBackgroundColor can't
// parse — map to the hex chrome colors used by index.html and windows.ts.
const NATIVE_BACKGROUND = { light: "#F8F7F7", dark: "#131010" } as const;

export function NativeThemeSync() {
  const { theme, resolvedTheme } = useTheme();

  useEffect(() => {
    // themeSource makes native chrome (incl. inactive traffic-light tint) and
    // prefers-color-scheme follow the app theme instead of the OS.
    if (theme === "light" || theme === "dark" || theme === "system")
      void window.api?.setThemeSource?.(theme);
    if (resolvedTheme !== "light" && resolvedTheme !== "dark") return;
    void window.api?.setTitlebar?.({ mode: resolvedTheme });
    void window.api?.setBackgroundColor?.(NATIVE_BACKGROUND[resolvedTheme]);
  }, [theme, resolvedTheme]);

  return null;
}
