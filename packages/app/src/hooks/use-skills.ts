import type {
  AppSkillsResponses,
  OpencodeClient,
} from "@opencode-ai/sdk/v2/client";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { useGlobalSDK } from "@/contexts/global-sdk";
import { usePlatform } from "@/contexts/platform";

const HIDDEN_SKILL_NAMES = new Set(["customize-opencode"]);

export type Skill = AppSkillsResponses[200][number];

export const skillsQueryOptions = (directory: string, client: OpencodeClient) =>
  queryOptions({
    queryKey: ["skills", directory],
    queryFn: async () => {
      const res = await client.app.skills({}, { throwOnError: true });
      return res.data.filter((skill) => !HIDDEN_SKILL_NAMES.has(skill.name));
    },
  });

export function useSkills(directory: string) {
  const globalSDK = useGlobalSDK();

  const client = useMemo(
    () => globalSDK.createClient({ directory, throwOnError: true }),
    [globalSDK, directory],
  );

  return useQuery(skillsQueryOptions(directory, client));
}

export function useManagedSkillsDir() {
  const platform = usePlatform();

  return useQuery({
    queryKey: ["managed-skills-dir"],
    queryFn: () => platform.managedSkillsDir?.() ?? null,
    staleTime: Infinity,
  });
}
