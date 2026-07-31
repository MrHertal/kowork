import { useEffect, useRef, useState } from "react";

export function useDelayedShow(
  active: boolean,
  delayMs = 50,
  minimumVisibleMs = 0,
): boolean {
  const [ready, setReady] = useState(false);
  const shownAt = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (active) {
      if (ready) return;
      const id = setTimeout(() => {
        shownAt.current = performance.now();
        setReady(true);
      }, delayMs);
      return () => clearTimeout(id);
    }

    if (!ready) return;
    const elapsed = performance.now() - (shownAt.current ?? 0);
    const remaining = Math.max(0, minimumVisibleMs - elapsed);
    const id = setTimeout(() => {
      shownAt.current = undefined;
      setReady(false);
    }, remaining);
    return () => clearTimeout(id);
  }, [active, delayMs, minimumVisibleMs, ready]);

  return ready && (active || minimumVisibleMs > 0);
}
