import { execFile } from "node:child_process";
import {
  closeSync,
  existsSync,
  openSync,
  readdirSync,
  readSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import type { Configuration } from "electron-builder";

const execFileAsync = promisify(execFile);
const electronDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(electronDir, "..", "..");
const signScript = path.join(rootDir, "script", "sign-windows.ps1");

async function signWindows(configuration: { path: string }) {
  if (process.platform !== "win32") return;
  if (process.env.GITHUB_ACTIONS !== "true") return;

  await execFileAsync(
    "pwsh",
    [
      "-NoLogo",
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      signScript,
      configuration.path,
    ],
    { cwd: rootDir },
  );
}

// The runtime pack is generated + gitignored, and electron-builder only *warns*
// on a missing extraResources source — so without this a skipped `build:runtime`
// ships an app with no python/node_libs that still signs + notarizes cleanly.
function ensureRuntimePackPresent() {
  const manifest = path.join(
    electronDir,
    "resources",
    "runtime",
    "MANIFEST.json",
  );
  if (!existsSync(manifest)) {
    throw new Error(
      `Office runtime pack missing (${path.relative(electronDir, manifest)}). ` +
        `Run \`pnpm --filter @kowork/electron build:runtime\` before packaging.`,
    );
  }
}

// Mach-O magic numbers (first 4 bytes, both endiannesses; incl. fat/universal).
const MACHO_MAGICS = new Set([
  "feedface",
  "cefaedfe",
  "feedfacf",
  "cffaedfe",
  "cafebabe",
  "bebafeca",
]);

function isMachO(file: string): boolean {
  let fd: number | undefined;
  try {
    fd = openSync(file, "r");
    const buf = Buffer.alloc(4);
    if (readSync(fd, buf, 0, 4, 0) < 4) return false;
    return MACHO_MAGICS.has(buf.toString("hex"));
  } catch {
    return false;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function* walkFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkFiles(p);
    else if (entry.isFile()) yield p;
  }
}

// Notarization rejects any unsigned/non-hardened Mach-O, and `codesign --verify
// --deep` only re-hashes resources — it doesn't prove each nested binary carries
// its own hardened signature. So assert that explicitly and fail before upload.
async function verifyMacRuntimeSigning(context: {
  electronPlatformName: string;
  appOutDir: string;
  packager: { appInfo: { productFilename: string } };
}) {
  if (context.electronPlatformName !== "darwin") return;

  let appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );
  if (!existsSync(appPath)) {
    const app = readdirSync(context.appOutDir).find((n) => n.endsWith(".app"));
    if (!app) return;
    appPath = path.join(context.appOutDir, app);
  }

  const runtimeDir = path.join(appPath, "Contents", "Resources", "runtime");
  if (!existsSync(runtimeDir)) return; // pack not bundled — nothing to gate

  await execFileAsync("codesign", [
    "--verify",
    "--deep",
    "--strict",
    "--verbose=2",
    appPath,
  ]);

  const offenders: string[] = [];
  let machoCount = 0;
  for (const file of walkFiles(runtimeDir)) {
    if (!isMachO(file)) continue;
    machoCount++;
    try {
      const { stderr } = await execFileAsync("codesign", [
        "--display",
        "--verbose=2",
        file,
      ]);
      const flags = /flags=0x[0-9a-f]+\(([^)]*)\)/.exec(stderr)?.[1] ?? "";
      if (!flags.split(",").includes("runtime")) {
        offenders.push(`${path.relative(runtimeDir, file)} (not hardened)`);
      }
    } catch {
      offenders.push(`${path.relative(runtimeDir, file)} (unsigned)`);
    }
  }

  if (offenders.length) {
    throw new Error(
      `Runtime pack: ${offenders.length}/${machoCount} Mach-O unsigned or not hardened:\n  ` +
        offenders.join("\n  "),
    );
  }
  console.log(
    `[verify-signing] runtime pack OK: ${machoCount} Mach-O signed + hardened`,
  );
}

const channel = (() => {
  const raw = process.env.KOWORK_CHANNEL;
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw;
  return "dev";
})();

const getBase = (): Configuration => ({
  artifactName: "kowork-electron-${os}-${arch}.${ext}",
  beforePack: ensureRuntimePackPresent,
  afterSign: verifyMacRuntimeSigning,
  directories: {
    output: "dist",
    buildResources: "resources",
  },
  files: [
    "out/**/*",
    "resources/**/*",
    "!resources/skills/**",
    "!resources/runtime/**",
  ],
  extraResources: [
    {
      from: "native/",
      to: "native/",
      filter: [
        "index.js",
        "index.d.ts",
        "build/Release/mac_window.node",
        "swift-build/**",
      ],
    },
    {
      from: "resources/skills/",
      to: "skills/",
    },
    {
      from: "resources/runtime/",
      to: "runtime/",
    },
  ],
  mac: {
    category: "public.app-category.developer-tools",
    icon: `resources/icons/icon.icns`,
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: "resources/entitlements.plist",
    entitlementsInherit: "resources/entitlements.plist",
    notarize: true,
    target: ["dmg", "zip"],
  },
  dmg: {
    sign: true,
  },
  protocols: {
    name: "Kowork",
    schemes: ["kowork"],
  },
  win: {
    icon: `resources/icons/icon.ico`,
    signtoolOptions: {
      sign: signWindows,
    },
    target: ["nsis"],
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    installerIcon: `resources/icons/icon.ico`,
    installerHeaderIcon: `resources/icons/icon.ico`,
  },
  linux: {
    icon: `resources/icons`,
    category: "Development",
    target: ["AppImage", "deb", "rpm"],
  },
});

function getConfig() {
  const base = getBase();

  switch (channel) {
    case "dev": {
      return {
        ...base,
        appId: "app.kowork.desktop.dev",
        productName: "Kowork Dev",
        rpm: { packageName: "kowork-dev" },
      };
    }
    case "beta": {
      return {
        ...base,
        appId: "app.kowork.desktop.beta",
        productName: "Kowork Beta",
        protocols: { name: "Kowork Beta", schemes: ["kowork"] },
        rpm: { packageName: "kowork-beta" },
      };
    }
    case "prod": {
      return {
        ...base,
        appId: "app.kowork.desktop",
        productName: "Kowork",
        protocols: { name: "Kowork", schemes: ["kowork"] },
        rpm: { packageName: "kowork" },
      };
    }
  }
}

export default getConfig();
