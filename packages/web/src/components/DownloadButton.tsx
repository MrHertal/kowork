import { useEffect, useState } from "react";

const RELEASES_URL = "https://github.com/MrHertal/kowork/releases/latest";

type Os = "macos" | "windows" | "linux";

const labels: Record<Os, string> = {
  macos: "Download for macOS",
  windows: "Download for Windows",
  linux: "Download for Linux",
};

function detectOs(): Os | null {
  const ua = navigator.userAgent;
  // iPadOS reports as Macintosh; only touch-capable Macs are actually iPads
  if (ua.includes("Macintosh") && navigator.maxTouchPoints > 0) return null;
  if (ua.includes("Mac OS X") || ua.includes("Macintosh")) return "macos";
  if (ua.includes("Windows")) return "windows";
  if (ua.includes("Linux")) return "linux";
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
      className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
    >
      {os ? labels[os] : "Download"}
    </a>
  );
}
