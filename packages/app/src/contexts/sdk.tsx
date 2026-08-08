// @opencode-ref: opencode/packages/app/src/context/sdk.tsx
import type { Event, OpencodeClient } from "@opencode-ai/sdk/v2/client";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
  type GlobalSDKContextValue,
  useGlobalSDK,
} from "@/contexts/global-sdk";
import { createEmitter, type Emitter } from "@/utils/emitter";

type SDKEventMap = {
  [K in Event["type"]]: Extract<Event, { type: K }>;
};

export interface SDKContextValue {
  directory: string;
  client: OpencodeClient;
  event: Emitter<SDKEventMap>;
  url: string;
  createClient: GlobalSDKContextValue["createClient"];
}

const SDKContext = createContext<SDKContextValue | null>(null);

interface SDKProviderProps {
  directory: string;
  children: ReactNode;
}

export function SDKProvider({ directory, children }: SDKProviderProps) {
  const globalSDK = useGlobalSDK();

  const client = useMemo(
    () => globalSDK.createClient({ directory, throwOnError: true }),
    [globalSDK, directory],
  );

  const emitterRef = useRef<Emitter<SDKEventMap> | null>(null);
  if (emitterRef.current == null) {
    emitterRef.current = createEmitter<SDKEventMap>();
  }
  const emitter = emitterRef.current;

  useEffect(() => {
    return globalSDK.event.on(directory, (event) => {
      emitter.emit(event.type, event);
    });
  }, [globalSDK, directory, emitter]);

  const ctxValue = useMemo<SDKContextValue>(
    () => ({
      directory,
      client,
      event: emitter,
      url: globalSDK.url,
      createClient: globalSDK.createClient,
    }),
    [directory, client, emitter, globalSDK.url, globalSDK.createClient],
  );

  return <SDKContext.Provider value={ctxValue}>{children}</SDKContext.Provider>;
}

export function useSDK(): SDKContextValue {
  const value = useContext(SDKContext);
  if (!value) {
    throw new Error("useSDK must be used within a <SDKProvider>");
  }
  return value;
}
