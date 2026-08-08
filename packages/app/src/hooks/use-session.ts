import { useGlobalSDK } from "@/contexts/global-sdk";
import { useQuery } from "@tanstack/react-query";

export function useSession(id: string) {
  const globalSDK = useGlobalSDK();

  return useQuery({
    queryKey: ["session", id],
    queryFn: async () => {
      const res = await globalSDK.client.session.get({ sessionID: id });
      if (res.error) {
        throw res.error instanceof Error
          ? res.error
          : Object.assign(new Error(), res.error);
      }
      return res.data;
    },
  });
}
