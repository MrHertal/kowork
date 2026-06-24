import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useGlobalSDK } from "@/contexts/global-sdk";
import { usePlatform } from "@/contexts/platform";
import { m } from "@/paraglide/messages";

export type SkillsMutationInput =
  | { type: "add-folder"; folder: string }
  | { type: "add-url"; url: string }
  | { type: "remove-folder"; folder: string }
  | { type: "install-popular"; id: string }
  | { type: "uninstall-popular"; id: string };

export type SkillsMutationResult =
  | { type: "added" }
  | { type: "duplicate" }
  | { type: "removed" };

function readSkillsArray(
  config: unknown,
  key: "paths" | "urls",
): readonly string[] {
  if (config && typeof config === "object" && "skills" in config) {
    const skills = (config as { skills?: unknown }).skills;
    if (skills && typeof skills === "object" && key in skills) {
      const value = (skills as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        return value.filter((v): v is string => typeof v === "string");
      }
    }
  }
  return [];
}

export function useSkillsMutation(directory: string) {
  const globalSDK = useGlobalSDK();
  const platform = usePlatform();
  const queryClient = useQueryClient();

  return useMutation<SkillsMutationResult, Error, SkillsMutationInput>({
    mutationFn: async (input) => {
      if (input.type === "install-popular") {
        if (!platform.installBundledSkill) {
          throw new Error("installBundledSkill IPC unavailable");
        }
        await platform.installBundledSkill(input.id);
        await globalSDK.client.global.dispose().catch(() => undefined);
        await queryClient.refetchQueries({ queryKey: ["skills", directory] });
        return { type: "added" };
      }

      if (input.type === "uninstall-popular") {
        if (!platform.uninstallBundledSkill) {
          throw new Error("uninstallBundledSkill IPC unavailable");
        }
        await platform.uninstallBundledSkill(input.id);
        await globalSDK.client.global.dispose().catch(() => undefined);
        await queryClient.refetchQueries({ queryKey: ["skills", directory] });
        return { type: "removed" };
      }

      if (!platform.opencodeConfigRead || !platform.opencodeConfigPatch) {
        throw new Error("opencodeConfig IPC unavailable");
      }

      // Read fresh: the store config only refreshes at bootstrap, so back-to-
      // back mutations would otherwise stomp each other.
      const fresh = await platform.opencodeConfigRead();

      if (input.type === "remove-folder") {
        const existing = readSkillsArray(fresh, "paths");
        const next = existing.filter((p) => p !== input.folder);
        if (next.length !== existing.length) {
          await platform.opencodeConfigPatch(["skills", "paths"], next);
          await globalSDK.client.global.dispose().catch(() => undefined);
        }
        // refetch, not invalidate: blocks until fresh data lands (no stale flash).
        await queryClient.refetchQueries({ queryKey: ["skills", directory] });
        return { type: "removed" };
      }

      const key = input.type === "add-folder" ? "paths" : "urls";
      const value = input.type === "add-folder" ? input.folder : input.url;
      const existing = readSkillsArray(fresh, key);
      if (existing.includes(value)) {
        return { type: "duplicate" };
      }

      await platform.opencodeConfigPatch(["skills", key], [...existing, value]);
      // Best-effort cache bust; the patch already landed if this fails.
      await globalSDK.client.global.dispose().catch(() => undefined);
      await queryClient.refetchQueries({ queryKey: ["skills", directory] });
      return { type: "added" };
    },
    onSuccess: (result) => {
      if (result.type === "duplicate") {
        toast.info(m.settings_skills_already_added_title());
      }
    },
    onError: (err) => {
      console.warn("skill mutation failed", err);
      toast.error(m.settings_skills_save_failed_title());
    },
  });
}
