import * as http from "node:http";
import * as tls from "node:tls";

type NodeHttpWithEnvProxy = typeof http & {
  setGlobalProxyFromEnv: () => void;
};

type NodeTlsWithSystemCertificates = typeof tls & {
  getCACertificates: (type: "default" | "system") => string[];
  setDefaultCACertificates: (certificates: string[]) => void;
};

type ParentMessage = { type: "stop" };

type SidecarMessage =
  | { type: "ready"; url: string }
  | { type: "stopped" }
  | { type: "error"; error: { message: string; stack?: string } };

type Listener = {
  url: string;
  stop(close?: boolean): void | Promise<void>;
};

Object.assign(process.env, {
  OPENCODE_CLIENT: "desktop",
  OPENCODE_DISABLE_EXTERNAL_SKILLS: "true",
  OPENCODE_DISABLE_PROJECT_CONFIG: "true",
  OPENCODE_ENABLE_EXA: "true",
  OPENCODE_EXPERIMENTAL_ICON_DISCOVERY: "true",
});

ensureLoopbackNoProxy();
useSystemCertificates();
useEnvProxy();

let listener: Listener | undefined;
let stopping: Promise<void> | undefined;

process.on("message", (message: ParentMessage) => {
  if (message?.type === "stop") void stop();
});
process.once("disconnect", () => void stop());
process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());

try {
  const { Server } = await import("virtual:opencode-server");
  listener = (await Server.listen({
    hostname: "127.0.0.1",
    port: 0,
  })) as Listener;
  sendParentMessage({ type: "ready", url: listener.url });
} catch (error) {
  sendParentMessage({ type: "error", error: serializeError(error) });
  process.exitCode = 1;
}

async function stop() {
  if (stopping) return stopping;
  stopping = (async () => {
    try {
      await listener?.stop();
    } finally {
      listener = undefined;
      sendParentMessage({ type: "stopped" });
      process.exit(0);
    }
  })();
  return stopping;
}

function sendParentMessage(message: SidecarMessage) {
  if (!process.connected || !process.send) return;
  process.send(message, () => {
    // A concurrent parent exit can close IPC before delivery completes.
  });
}

function ensureLoopbackNoProxy() {
  for (const key of ["NO_PROXY", "no_proxy"] as const) {
    const values = (process.env[key] ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    for (const host of ["127.0.0.1", "localhost", "::1"])
      if (!values.some((value) => value.toLowerCase() === host))
        values.push(host);
    process.env[key] = values.join(",");
  }
}

function useSystemCertificates() {
  try {
    const nodeTls = tls as NodeTlsWithSystemCertificates;
    nodeTls.setDefaultCACertificates([
      ...new Set([
        ...nodeTls.getCACertificates("default"),
        ...nodeTls.getCACertificates("system"),
      ]),
    ]);
  } catch (error) {
    console.warn("failed to load system certificates", error);
  }
}

function useEnvProxy() {
  try {
    (http as NodeHttpWithEnvProxy).setGlobalProxyFromEnv();
  } catch (error) {
    console.warn("failed to configure proxy environment", error);
  }
}

function serializeError(error: unknown) {
  if (error instanceof Error)
    return { message: error.message, stack: error.stack };
  return { message: String(error) };
}
