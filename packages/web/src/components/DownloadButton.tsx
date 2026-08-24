import { useEffect, useState } from "react";

const RELEASES_URL = "https://github.com/MrHertal/kowork/releases/latest";

type Os = "macos" | "windows";

const labels: Record<Os, string> = {
  macos: "Download for macOS",
  windows: "Download for Windows",
};

function detectOs(): Os | null {
  const ua = navigator.userAgent;
  // iPadOS reports as Macintosh; only touch-capable Macs are actually iPads
  if (ua.includes("Macintosh") && navigator.maxTouchPoints > 0) return null;
  if (ua.includes("Mac OS X") || ua.includes("Macintosh")) return "macos";
  if (ua.includes("Windows")) return "windows";
  return null;
}

export function DownloadButton() {
  const [os, setOs] = useState<Os | null>(null);

  useEffect(() => {
    setOs(detectOs());
  }, []);

  return (
    <a
      href={RELEASES_URL}
      className="inline-flex min-h-12 items-center justify-center rounded-xl bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/25"
    >
      {os ? labels[os] : "Download"}
    </a>
  );
}
