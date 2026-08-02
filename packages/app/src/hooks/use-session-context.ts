import type { Message } from "@opencode-ai/sdk/v2/client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useRef } from "react";

import { shallowArrayEqual, useSyncData } from "@/contexts/sync";
import { useSDK } from "@/contexts/sdk";
import { useProviders } from "@/hooks/use-providers";
import { getSessionContextUsage } from "@/utils/session-context";

const emptyMessages: Message[] = [];

export function useSessionContext(sessionId: string) {
  const sdk = useSDK();
  const messages = useSyncData(
    (state) => state.message[sessionId] ?? emptyMessages,
    shallowArrayEqual,
  );
  const [messagesReady, providerReady, status] = useSyncData(
    (state) =>
      [
        state.message[sessionId] !== undefined,
        state.provider_ready,
        state.session_status[sessionId]?.type,
      ] as const,
    shallowArrayEqual,
  );
  const providers = useProviders(sdk.directory);
  const cost = useQuery({
    queryKey: ["session-context-cost", sdk.url, sessionId],
    queryFn: async ({ signal }) => {
      const result = await sdk.client.session.get(
        { sessionID: sessionId },
        { signal },
      );
      if (result.error) throw result.error;
      return result.data?.cost ?? null;
    },
  });
  const usage = getSessionContextUsage(messages, providers.all);
  const revision = usage
    ? `${usage.message.id}:${usage.message.cost}:${usage.tokens}`
    : undefined;
  const previous = useRef({ messagesReady, revision, sessionId, status });
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const refreshPending = useRef(false);
  const runRefetch = useEffectEvent(() => {
    refreshTimer.current = undefined;
    if (cost.isFetching) {
      refreshPending.current = true;
      return;
    }
    void cost.refetch();
  });
  const scheduleRefetch = useEffectEvent(() => {
    if (cost.isFetching) {
      refreshPending.current = true;
      return;
    }
    if (refreshTimer.current) return;
    refreshTimer.current = setTimeout(runRefetch, 0);
  });

  useEffect(() => {
    const refresh = (eventSessionId: string) => {
      if (eventSessionId !== sessionId) return;
      scheduleRefetch();
    };
    const unsubscribeMessage = sdk.event.on("message.removed", (event) => {
      refresh(event.properties.sessionID);
    });
    const unsubscribePartUpdated = sdk.event.on(
      "message.part.updated",
      (event) => {
        if (event.properties.part.type !== "step-finish") return;
        refresh(event.properties.part.sessionID);
      },
    );
    const unsubscribePartRemoved = sdk.event.on(
      "message.part.removed",
      (event) => {
        refresh(event.properties.sessionID);
      },
    );
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = undefined;
      refreshPending.current = false;
      unsubscribeMessage();
      unsubscribePartUpdated();
      unsubscribePartRemoved();
    };
  }, [sdk.event, sessionId]);

  useEffect(() => {
    if (cost.isFetching || !refreshPending.current) return;
    refreshPending.current = false;
    scheduleRefetch();
  }, [cost.isFetching]);

  useEffect(() => {
    const last = previous.current;
    previous.current = { messagesReady, revision, sessionId, status };
    if (last.sessionId !== sessionId) return;
    if (!last.messagesReady && messagesReady) return;
    const becameIdle =
      status === "idle" && !!last.status && last.status !== "idle";
    const usageChanged = !!revision && revision !== last.revision;
    if (!becameIdle && !usageChanged) return;
    scheduleRefetch();
  }, [messagesReady, revision, sessionId, status]);

  return {
    cost: cost.data,
    isCapacityPending: !messagesReady || !providerReady,
    isCostPending: cost.isPending,
    isLoading: !messagesReady,
    usage,
  };
}
