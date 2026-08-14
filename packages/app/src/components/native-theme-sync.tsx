import { useTheme } from "next-themes";
import { useEffect } from "react";

// --background is authored in oklch, which Electron's setBackgroundColor can't
// parse — map to the hex chrome colors used by index.html and windows.ts.
const NATIVE_BACKGROUND = { light: "#F8F7F7", dark: "#131010" } as const;

export function NativeThemeSync() {
  const { theme, resolvedTheme } = useTheme();

  useEffect(() => {
    // themeSource aligns native chrome with the app theme — macOS derives the
    // inactive traffic-light tint from it, and it flips prefers-color-scheme
    // in every webContents to the app theme rather than the OS theme.
    if (theme === "light" || theme === "dark" || theme === "system")
      void window.api?.setThemeSource?.(theme);
    if (resolvedTheme !== "light" && resolvedTheme !== "dark") return;
    void window.api?.setTitlebar?.({ mode: resolvedTheme });
    void window.api?.setBackgroundColor?.(NATIVE_BACKGROUND[resolvedTheme]);
  }, [theme, resolvedTheme]);

  return null;
}
