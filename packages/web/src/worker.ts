// @opencode-ref: opencode/packages/console/app/src/routes/download/[channel]/[platform].ts

const RELEASES_URL = "https://github.com/MrHertal/kowork/releases/latest";
const DOWNLOAD_URL = `${RELEASES_URL}/download`;

const assets = {
  macOS: "kowork-electron-mac-arm64.dmg",
  Windows: "kowork-electron-win-x64.exe",
} as const;

interface Env {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
}

export default {
  fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname !== "/download" && url.pathname !== "/download/") {
      return env.ASSETS.fetch(request);
    }

    const userAgent = request.headers.get("user-agent")?.toLowerCase() ?? "";
    const asset = userAgent.includes("windows")
      ? assets.Windows
      : userAgent.includes("macintosh")
        ? assets.macOS
        : undefined;

    return new Response(null, {
      status: 302,
      headers: {
        location: asset ? `${DOWNLOAD_URL}/${asset}` : RELEASES_URL,
        "cache-control": "private, no-store",
      },
    });
  },
};
