// @opencode-ref: opencode/packages/app/src/hooks/use-providers.ts
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

const emptyProviders: ProviderListResponse = {
  all: [],
  connected: [],
  default: {},
};

const providerListEqual = (a: ProviderListResponse, b: ProviderListResponse) =>
  shallowArrayEqual(a.all, b.all) &&
  shallowArrayEqual(a.connected, b.connected) &&
  a.default === b.default;

const optionalProviderListEqual = (
  a: ProviderListResponse | undefined,
  b: ProviderListResponse | undefined,
) => a === b || (!!a && !!b && providerListEqual(a, b));

// The opencode provider autoloads without credentials and keeps only
// free models — that implicit connection is the built-in free tier.
export function isFreeTierProvider(p: Provider) {
  return (
    p.id === "opencode" &&
    Object.keys(p.models).length > 0 &&
    !Object.values(p.models).some((m) => m.cost?.input)
  );
}

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

  const providers: ProviderListResponse = (() => {
    if (!childStore) return globalProvider;
    if (childProviderReady && childProvider) return childProvider;
    return emptyProviders;
  })();

  return useMemo(() => {
    const all = providers.all;
    const connectedSet = new Set(providers.connected);
    const connected = all.filter((p): p is Provider => connectedSet.has(p.id));

    return {
      all,
      default: providers.default,
      popular: all.filter((p) => popularProviderSet.has(p.id)),
      connected,
      paid: connected.filter((p) => !isFreeTierProvider(p)),
      free: connected.filter(isFreeTierProvider),
    };
  }, [providers]);
}
