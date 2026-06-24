import { useEffect, useState } from "react";

export function useDelayedShow(active: boolean, delayMs = 50): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!active) {
      setReady(false);
      return;
    }
    const id = setTimeout(() => setReady(true), delayMs);
    return () => clearTimeout(id);
  }, [active, delayMs]);

  return active && ready;
}
