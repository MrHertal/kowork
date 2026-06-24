import { useMemo } from "react";

import type {
  Provider,
  ProviderListResponse,
} from "@opencode-ai/sdk/v2/client";
import { useStore } from "@tanstack/react-store";
import {
  shallowArrayEqual,
  useGlobalData,
  useGlobalSync,
} from "@/contexts/global-sync";

export const popularProviders = [
  "opencode",
  "opencode-go",
  "anthropic",
  "github-copilot",
  "openai",
  "google",
  "openrouter",
  "vercel",
];
const popularProviderSet = new Set(popularProviders);

const providerListEqual = (a: ProviderListResponse, b: ProviderListResponse) =>
  shallowArrayEqual(a.all, b.all) &&
  shallowArrayEqual(a.connected, b.connected) &&
  a.default === b.default;

const optionalProviderListEqual = (
  a: ProviderListResponse | undefined,
  b: ProviderListResponse | undefined,
) => a === b || (!!a && !!b && providerListEqual(a, b));

export function useProviders(directory?: string) {
  const globalSync = useGlobalSync();

  const childStore = directory ? globalSync._child(directory) : undefined;

  const globalProvider = useGlobalData((s) => s.provider, providerListEqual);
  const childProviderReady = useStore(
    childStore ?? globalSync._globalStore,
    (s) => ("provider_ready" in s ? s.provider_ready : false),
  );
  const childProvider = useStore(
    childStore ?? globalSync._globalStore,
    (s) => ("provider_ready" in s ? s.provider : undefined),
    optionalProviderListEqual,
  );

  const providers: ProviderListResponse =
    childStore && childProviderReady && childProvider
      ? childProvider
      : globalProvider;

  return useMemo(() => {
    const all = providers.all;
    const connectedSet = new Set(providers.connected);

    return {
      all,
      default: providers.default,
      popular: all.filter((p) => popularProviderSet.has(p.id)),
      connected: all.filter((p): p is Provider => connectedSet.has(p.id)),
      paid: all.filter(
        (p): p is Provider =>
          connectedSet.has(p.id) &&
          (p.id !== "opencode" ||
            Object.values(p.models).some((m) => m.cost?.input)),
      ),
    };
  }, [providers]);
}
