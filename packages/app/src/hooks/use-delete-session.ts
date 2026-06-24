import { useNavigate, useParams } from "@tanstack/react-router";
import { useCallback } from "react";

import { useGlobalSDK } from "@/contexts/global-sdk";

export function useDeleteSession() {
  const client = useGlobalSDK().client;
  const navigate = useNavigate();
  const activeId = useParams({
    from: "/session/$id",
    select: (p) => p.id,
    shouldThrow: false,
  });

  const deleteSession = useCallback(
    (session: { id: string; directory: string }) => {
      client.session.delete({
        sessionID: session.id,
        directory: session.directory,
      });
      if (activeId === session.id) {
        navigate({ to: "/" });
      }
    },
    [client, activeId, navigate],
  );

  return deleteSession;
}
