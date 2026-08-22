import { useEffect, useState } from "react";

const RELEASES_URL = "https://github.com/MrHertal/kowork/releases/latest";

type Os = "macos" | "windows" | "linux";

const labels: Record<Os, string> = {
  macos: "Download for macOS",
  windows: "Download for Windows",
  linux: "Download for Linux",
};

function detectOs(): Os | null {
  const platform = navigator.platform.toLowerCase();
  if (platform.includes("mac")) return "macos";
  if (platform.includes("win")) return "windows";
  if (platform.includes("linux")) return "linux";
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
