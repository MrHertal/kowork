import { useEffect, useState } from "react";

function format(from: number, to: number): string {
  const totalSeconds = Math.max(0, Math.round((to - from) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

export function useDuration(
  startTime: number,
  endTime?: number,
  working?: boolean,
): string {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!working) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [working]);

  const to = endTime ?? now;
  return format(startTime, to);
}
