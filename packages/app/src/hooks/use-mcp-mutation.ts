import type {
  McpLocalConfig,
  McpRemoteConfig,
  McpStatus,
} from "@opencode-ai/sdk/v2/client";
import { useMutation } from "@tanstack/react-query";
import { useMemo } from "react";
import { toast } from "sonner";

import { useGlobalSDK } from "@/contexts/global-sdk";
import { useGlobalSync } from "@/contexts/global-sync";
import { usePlatform } from "@/contexts/platform";
import { scheduleOptimisticWrite } from "@/lib/optimistic";
import { m } from "@/paraglide/messages";

class AuthAbortedError extends Error {
  override readonly name = "AuthAbortedError";
}

// Module-scoped (not per hook instance) so an unmount/remount can still
// abort an OAuth fetch left running by a previous mount.
const inFlightAuth = new Map<string, AbortController>();

const authKey = (directory: string, name: string) => `${directory}\0${name}`;

// Aborts the previous controller (if any) before registering the new one
// so its mutation rejects and can't write stale status into the store.
function registerAuth(directory: string, name: string): AbortController {
  const key = authKey(directory, name);
  inFlightAuth.get(key)?.abort();
  const ac = new AbortController();
  inFlightAuth.set(key, ac);
  return ac;
}

function clearAuth(directory: string, name: string, ac: AbortController) {
  const key = authKey(directory, name);
  if (inFlightAuth.get(key) === ac) inFlightAuth.delete(key);
}

export type McpConfig = McpLocalConfig | McpRemoteConfig;

export type McpMutationInput =
  | { type: "add"; name: string; config: McpConfig }
  | { type: "remove"; name: string }
  | { type: "enable"; name: string }
  | { type: "disable"; name: string }
  | { type: "authenticate"; name: string };

type McpMutationResult =
  | { type: "add"; name: string; status: McpStatus }
  | { type: "remove"; name: string; mcp: Record<string, McpStatus> }
  | {
      type: "enable" | "disable" | "authenticate";
      name: string;
      status: McpStatus;
    };

export function useMcpMutation(directory: string) {
  const globalSDK = useGlobalSDK();
  const globalSync = useGlobalSync();
  const platform = usePlatform();

  const client = useMemo(
    () => globalSDK.createClient({ directory, throwOnError: true }),
    [globalSDK, directory],
  );

  return useMutation<McpMutationResult, Error, McpMutationInput>({
    mutationFn: async (input) => {
      switch (input.type) {
        case "add": {
          const { name, config } = input;

          const optimistic = scheduleOptimisticWrite(
            () =>
              globalSync.updateChild(directory, (d) => {
                d.mcp[name] = { status: "disabled" };
              }),
            () =>
              globalSync.updateChild(directory, (d) => {
                delete d.mcp[name];
              }),
          );

          try {
            if (platform.opencodeConfigPatch) {
              await platform.opencodeConfigPatch(["mcp", name], config);
            }

            let status: McpStatus;
            try {
              const added = await client.mcp.add({ name, config });
              status = added.data?.[name] ?? { status: "disabled" };
            } catch (err) {
              if (platform.opencodeConfigPatch) {
                await platform
                  .opencodeConfigPatch(["mcp", name], undefined)
                  .catch(() => undefined);
              }
              throw err;
            }

            optimistic.commit();
            globalSync.updateChild(directory, (d) => {
              d.mcp[name] = status;
            });

            if (status.status === "needs_auth") {
              const ac = registerAuth(directory, name);
              try {
                await client.mcp.auth.authenticate(
                  { name },
                  { signal: ac.signal },
                );
              } catch {
                if (ac.signal.aborted) throw new AuthAbortedError();
                toast.error(m.settings_mcp_auth_failed_title(), {
                  description: m.settings_mcp_auth_failed_description(),
                });
              } finally {
                clearAuth(directory, name, ac);
              }
            }

            // MCP clients are directory-scoped while desktop connector config
            // and credentials are global. Reload every active directory after
            // authentication finishes so chats see the persisted connector.
            if (platform.opencodeConfigPatch) {
              await globalSDK.client.global.dispose();
            }
            const refreshed = await client.mcp.status().catch(() => null);
            if (refreshed?.data?.[name]) status = refreshed.data[name];

            return { type: "add", name, status };
          } catch (err) {
            optimistic.rollback();
            throw err;
          }
        }

        case "remove": {
          const { name } = input;
          // dispose below would unblock a dangling auth fetch, which would
          // then write stale status into the slot we're deleting.
          const key = authKey(directory, name);
          inFlightAuth.get(key)?.abort();
          inFlightAuth.delete(key);

          const snapshot = globalSync._child(directory).state.mcp[name];

          const optimistic = scheduleOptimisticWrite(
            () =>
              globalSync.updateChild(directory, (d) => {
                delete d.mcp[name];
              }),
            () => {
              if (snapshot) {
                globalSync.updateChild(directory, (d) => {
                  d.mcp[name] = snapshot;
                });
              }
            },
          );

          try {
            await client.mcp.disconnect({ name }).catch(() => undefined);
            await client.mcp.auth.remove({ name }).catch(() => undefined);

            if (platform.opencodeConfigPatch) {
              await platform.opencodeConfigPatch(["mcp", name], undefined);
              // dispose invalidates the config cache so the next
              // mcp.status() reflects the disk deletion.
              await globalSDK.client.global.dispose();
            }

            optimistic.commit();
            const refreshed = await client.mcp.status();
            return { type: "remove", name, mcp: refreshed.data ?? {} };
          } catch (err) {
            optimistic.rollback();
            throw err;
          }
        }

        case "enable":
        case "disable": {
          const { type, name } = input;
          const enabling = type === "enable";

          if (enabling) {
            await client.mcp.connect({ name });
          } else {
            await client.mcp.disconnect({ name });
          }

          if (platform.opencodeConfigPatch) {
            try {
              await platform.opencodeConfigPatch(
                ["mcp", name, "enabled"],
                enabling,
              );
            } catch (err) {
              if (enabling) {
                await client.mcp.disconnect({ name }).catch(() => undefined);
              } else {
                await client.mcp.connect({ name }).catch(() => undefined);
              }
              throw err;
            }
            await globalSDK.client.global.dispose();
          }

          const refreshed = await client.mcp.status().catch(() => null);
          const status = refreshed?.data?.[name] ?? {
            status: enabling ? "connected" : "disabled",
          };
          return { type, name, status };
        }

        case "authenticate": {
          const { name } = input;
          const ac = registerAuth(directory, name);
          try {
            await client.mcp.auth.authenticate({ name }, { signal: ac.signal });
          } catch {
            if (ac.signal.aborted) throw new AuthAbortedError();
            toast.error(m.settings_mcp_auth_failed_title(), {
              description: m.settings_mcp_auth_failed_description(),
            });
          } finally {
            clearAuth(directory, name, ac);
          }
          // Re-read regardless of whether auth threw: a partial OAuth
          // can still flip the server to "connected" or back to "needs_auth".
          const refreshed = await client.mcp.status().catch(() => null);
          const status = refreshed?.data?.[name] ?? { status: "needs_auth" };
          return { type: "authenticate", name, status };
        }
      }
    },
    onSuccess: (result) => {
      switch (result.type) {
        case "add":
        case "enable":
        case "disable":
        case "authenticate": {
          const { name, status } = result;
          globalSync.updateChild(directory, (d) => {
            d.mcp[name] = status;
          });
          return;
        }
        case "remove": {
          // dispose tore down runtime state — replace whole map.
          globalSync.updateChild(directory, (d) => {
            d.mcp = result.mcp;
          });
          return;
        }
      }
    },
    onError: (err) => {
      // User cancelled OAuth via a sibling mutation (e.g. remove); silent.
      if (err instanceof AuthAbortedError) return;
      console.warn("mcp mutation failed", err);
      toast.error(m.settings_mcp_save_failed_title());
    },
  });
}
