import { useQuery } from "@tanstack/react-query";
import { usePlatform } from "@/contexts/platform";
import { useSettings } from "@/contexts/settings";

export function useUpdateCheck() {
  const platform = usePlatform();
  const settings = useSettings();

  return useQuery({
    queryKey: ["update-check"],
    enabled:
      settings.ready && !!platform.checkUpdate && settings.updates.startup,
    queryFn: () =>
      platform.checkUpdate?.() ??
      Promise.resolve({ updateAvailable: false, version: undefined }),
    refetchInterval: (query) =>
      query.state.data?.updateAvailable ? false : 10 * 60 * 1000,
    staleTime: 10 * 60 * 1000,
  });
}
