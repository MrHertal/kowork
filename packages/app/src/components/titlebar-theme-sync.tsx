import { useTheme } from "next-themes";
import { useEffect } from "react";

export function TitlebarThemeSync() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    if (resolvedTheme) {
      window.api?.setTitlebar?.({ mode: resolvedTheme as "light" | "dark" });
    }
  }, [resolvedTheme]);

  return null;
}
