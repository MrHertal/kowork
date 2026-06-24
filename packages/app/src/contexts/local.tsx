// @opencode-ref: opencode/packages/app/src/context/local.tsx
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { Agent, UserMessage } from "@opencode-ai/sdk/v2/client";
import type { ModelKey as ModelsModelKey } from "@/contexts/models";
import { shallowArrayEqual, useChildData } from "@/contexts/global-sync";
import { useSDK } from "@/contexts/sdk";
import { useModels } from "@/contexts/models";
import { useProviders } from "@/hooks/use-providers";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { Persist, type PersistTarget } from "@/utils/persist";
import {
  cycleModelVariant,
  getConfiguredAgentVariant,
  resolveModelVariant,
} from "@/utils/model-variant";

export type ModelKey = {
  providerID: string;
  modelID: string;
  variant?: string;
};

type State = {
  agent?: string;
  model?: ModelKey;
  variant?: string | null;
};

type Saved = {
  session: Record<string, State | undefined>;
};

type Ephemeral = {
  current?: string;
  draft?: State;
  last?: {
    type: "agent" | "model" | "variant";
    agent?: string;
    model?: ModelKey | null;
    variant?: string | null;
  };
};

type ListModel = NonNullable<ReturnType<ReturnType<typeof useModels>["find"]>>;

const WORKSPACE_KEY = "__workspace__";

const createDefaultSaved = (): Saved => ({ session: {} });

const emptyAgents: Agent[] = [];

const migrate = (value: unknown) => {
  if (!value || typeof value !== "object") return { session: {} };

  const item = value as {
    session?: Record<string, State | undefined>;
    pick?: Record<string, State | undefined>;
  };

  if (item.session && typeof item.session === "object")
    return { session: item.session };
  if (!item.pick || typeof item.pick !== "object") return { session: {} };

  return {
    session: Object.fromEntries(
      Object.entries(item.pick).filter(([key]) => key !== WORKSPACE_KEY),
    ),
  };
};

interface LocalContextValue {
  agent: {
    list: Agent[];
    current: Agent | undefined;
    set: (name: string | undefined) => void;
    move: (direction: 1 | -1) => void;
  };
  model: {
    ready: boolean;
    current: ListModel | undefined;
    recent: ListModel[];
    list: ListModel[];
    cycle: (direction: 1 | -1) => void;
    set: (item: ModelKey | undefined, options?: { recent?: boolean }) => void;
    visible: (item: ModelsModelKey) => boolean;
    setVisibility: (item: ModelsModelKey, visible: boolean) => void;
    variant: {
      configured: string | undefined;
      selected: string | null | undefined;
      current: string | undefined;
      list: string[];
      set: (value: string | undefined) => void;
      cycle: () => void;
    };
  };
  session: {
    reset: () => void;
    promote: (sessionID: string) => void;
    restore: (msg: UserMessage) => void;
  };
}

const LocalContext = createContext<LocalContextValue | null>(null);

interface LocalProviderProps {
  sessionId?: string;
  children: ReactNode;
}

export function LocalProvider({ sessionId, children }: LocalProviderProps) {
  const sdk = useSDK();
  const providers = useProviders();
  const models = useModels();

  const modelsRef = useRef(models);
  modelsRef.current = models;

  const persistTarget = useMemo<PersistTarget>(
    () => ({
      ...Persist.workspace(sdk.directory, "model-selection", [
        "model-selection.v1",
      ]),
      migrate,
    }),
    [sdk.directory],
  );

  const {
    state: saved,
    setState: setSaved,
    ready: persistReady,
  } = usePersistedState<Saved>({
    target: persistTarget,
    createDefault: createDefaultSaved,
    logName: "local",
  });

  const [ephemeral, setEphemeral] = useState<Ephemeral>({});

  const agents = useChildData(
    sdk.directory,
    (s) => s.agent ?? emptyAgents,
    shallowArrayEqual,
  );

  const agentList = useMemo(
    () => agents.filter((item) => item.mode !== "subagent" && !item.hidden),
    [agents],
  );

  const connectedSet = useMemo(
    () => new Set(providers.connected.map((item) => item.id)),
    [providers.connected],
  );

  const validModel = useCallback(
    (model: ModelKey): boolean => {
      const provider = providers.all.find(
        (item) => item.id === model.providerID,
      );
      return (
        !!provider?.models[model.modelID] && connectedSet.has(model.providerID)
      );
    },
    [providers.all, connectedSet],
  );

  const scope = useMemo<State | undefined>(() => {
    if (!sessionId) return ephemeral.draft;
    return saved.session[sessionId];
  }, [sessionId, ephemeral.draft, saved.session]);

  const pickAgent = useCallback(
    (name: string | undefined) => {
      if (agentList.length === 0) return undefined;
      return agentList.find((item) => item.name === name) ?? agentList[0];
    },
    [agentList],
  );

  const currentAgent = useMemo(
    () => pickAgent(scope?.agent ?? ephemeral.current),
    [pickAgent, scope?.agent, ephemeral.current],
  );

  const configModel = useChildData(sdk.directory, (s) => s.config.model);

  const configuredModel = useMemo<ModelKey | undefined>(() => {
    if (!configModel) return undefined;
    const parts = configModel.split("/");
    const providerID = parts[0];
    const modelID = parts[1];
    if (!providerID || !modelID) return undefined;
    const model = { providerID, modelID };
    if (validModel(model)) return model;
    return undefined;
  }, [configModel, validModel]);

  const recentModel = useMemo<ModelKey | undefined>(() => {
    for (const item of models.recent.list) {
      if (validModel(item)) return item;
    }
    return undefined;
  }, [models.recent.list, validModel]);

  const defaultModel = useMemo<ModelKey | undefined>(() => {
    const defaults = providers.default;
    for (const provider of providers.connected) {
      const configured = defaults[provider.id];
      if (configured) {
        const model = { providerID: provider.id, modelID: configured };
        if (validModel(model)) return model;
      }

      const first = Object.values(provider.models)[0];
      if (!first) continue;
      const model = { providerID: provider.id, modelID: first.id };
      if (validModel(model)) return model;
    }
    return undefined;
  }, [providers.default, providers.connected, validModel]);

  const fallbackModel = useMemo(
    () => configuredModel ?? recentModel ?? defaultModel,
    [configuredModel, recentModel, defaultModel],
  );

  const firstModel = useCallback(
    (...items: Array<ModelKey | undefined>) => {
      for (const model of items) {
        if (!model) continue;
        if (validModel(model)) return model;
      }
      return undefined;
    },
    [validModel],
  );

  const currentModelKey = useMemo(
    () => firstModel(scope?.model, currentAgent?.model, fallbackModel),
    [firstModel, scope?.model, currentAgent?.model, fallbackModel],
  );

  const currentModel = useMemo(
    () => (currentModelKey ? models.find(currentModelKey) : undefined),
    [currentModelKey, models.find],
  );

  const recentModels = useMemo(
    () =>
      models.recent.list
        .map(models.find)
        .filter((m): m is ListModel => m != null),
    [models.recent.list, models.find],
  );

  const configuredVariant = useMemo(() => {
    const agent = currentAgent;
    const model = currentModel;
    if (!agent || !model) return undefined;
    return getConfiguredAgentVariant({
      agent: { model: agent.model, variant: agent.variant },
      model: {
        providerID: model.provider.id,
        modelID: model.id,
        variants: model.variants,
      },
    });
  }, [currentAgent, currentModel]);

  const selectedVariant = scope?.variant;

  const variantList = useMemo(() => {
    if (!currentModel?.variants) return [];
    return Object.keys(currentModel.variants);
  }, [currentModel?.variants]);

  const currentVariant = useMemo(
    () =>
      resolveModelVariant({
        variants: variantList,
        selected: selectedVariant,
        configured: configuredVariant,
      }),
    [variantList, selectedVariant, configuredVariant],
  );

  useEffect(() => {
    if (agentList.length === 0) {
      setEphemeral((prev) => {
        if (prev.current === undefined) return prev;
        return { ...prev, current: undefined };
      });
      return;
    }
    setEphemeral((prev) => {
      if (agentList.some((item) => item.name === prev.current)) return prev;
      return { ...prev, current: agentList[0]?.name };
    });
  }, [agentList]);

  const write = useCallback(
    (next: Partial<State>) => {
      const currentScope = scope ?? { agent: currentAgent?.name };
      const state: State = { ...currentScope, ...next };

      if (sessionId) {
        setSaved((prev) => ({
          ...prev,
          session: { ...prev.session, [sessionId]: state },
        }));
        return;
      }
      setEphemeral((prev) => ({ ...prev, draft: state }));
    },
    [scope, currentAgent?.name, sessionId],
  );

  const setAgent = useCallback(
    (name: string | undefined) => {
      const item = pickAgent(name);
      if (!item) {
        setEphemeral((prev) => ({ ...prev, current: undefined }));
        return;
      }

      setEphemeral((prev) => ({
        ...prev,
        current: item.name,
        last: {
          type: "agent" as const,
          agent: item.name,
          model: item.model,
          variant: item.variant ?? null,
        },
      }));

      const prev = scope;
      write({
        agent: item.name,
        model: item.model ?? prev?.model,
        variant: item.variant ?? prev?.variant,
      });
    },
    [pickAgent, scope, write],
  );

  const moveAgent = useCallback(
    (direction: 1 | -1) => {
      if (agentList.length === 0) {
        setEphemeral((prev) => ({ ...prev, current: undefined }));
        return;
      }

      let next =
        agentList.findIndex((item) => item.name === currentAgent?.name) +
        direction;
      if (next < 0) next = agentList.length - 1;
      if (next >= agentList.length) next = 0;
      const item = agentList[next];
      if (!item) return;
      setAgent(item.name);
    },
    [agentList, currentAgent?.name, setAgent],
  );

  const setModel = useCallback(
    (item: ModelKey | undefined, options?: { recent?: boolean }) => {
      setEphemeral((prev) => ({
        ...prev,
        last: {
          type: "model" as const,
          agent: currentAgent?.name,
          model: item ?? null,
          variant: scope?.variant,
        },
      }));
      write({ model: item });
      if (!item) return;
      modelsRef.current.setVisibility(item, true);
      if (options?.recent) modelsRef.current.recent.push(item);
    },
    [currentAgent?.name, scope?.variant, write],
  );

  const cycleModel = useCallback(
    (direction: 1 | -1) => {
      if (!currentModel) return;

      const index = recentModels.findIndex(
        (entry) =>
          entry?.provider.id === currentModel.provider.id &&
          entry?.id === currentModel.id,
      );
      if (index === -1) return;

      let next = index + direction;
      if (next < 0) next = recentModels.length - 1;
      if (next >= recentModels.length) next = 0;

      const entry = recentModels[next];
      if (!entry) return;
      setModel({ providerID: entry.provider.id, modelID: entry.id });
    },
    [currentModel, recentModels, setModel],
  );

  const setVariant = useCallback(
    (value: string | undefined) => {
      setEphemeral((prev) => ({
        ...prev,
        last: {
          type: "variant" as const,
          agent: currentAgent?.name,
          model: currentModel
            ? {
                providerID: currentModel.provider.id,
                modelID: currentModel.id,
              }
            : null,
          variant: value ?? null,
        },
      }));
      write({ variant: value ?? null });
    },
    [currentAgent?.name, currentModel, write],
  );

  const cycleVariantFn = useCallback(() => {
    if (variantList.length === 0) return;
    setVariant(
      cycleModelVariant({
        variants: variantList,
        selected: selectedVariant,
        configured: configuredVariant,
      }),
    );
  }, [variantList, selectedVariant, configuredVariant, setVariant]);

  const resetSession = useCallback(() => {
    setEphemeral((prev) => ({ ...prev, draft: undefined }));
  }, []);

  const promoteSession = useCallback(
    (targetSessionID: string) => {
      const model = currentModel;
      const snapshot: State = {
        agent: currentAgent?.name,
        model: model
          ? { providerID: model.provider.id, modelID: model.id }
          : undefined,
        variant: selectedVariant,
      };
      if (!snapshot.agent && !snapshot.model) return;

      setSaved((prev) => ({
        ...prev,
        session: { ...prev.session, [targetSessionID]: snapshot },
      }));
      setEphemeral((prev) => ({ ...prev, draft: undefined }));
    },
    [currentModel, currentAgent, selectedVariant],
  );

  const restoreSession = useCallback(
    (msg: UserMessage) => {
      if (!sessionId) return;
      if (msg.sessionID !== sessionId) return;
      if (saved.session[sessionId] !== undefined) return;

      setSaved((prev) => ({
        ...prev,
        session: {
          ...prev.session,
          [sessionId]: {
            agent: msg.agent,
            model: msg.model,
            variant: msg.model.variant ?? null,
          },
        },
      }));
    },
    [sessionId, saved.session],
  );

  const ctxValue = useMemo<LocalContextValue>(
    () => ({
      agent: {
        list: agentList,
        current: currentAgent,
        set: setAgent,
        move: moveAgent,
      },
      model: {
        ready: models.ready && persistReady,
        current: currentModel,
        recent: recentModels,
        list: models.list,
        cycle: cycleModel,
        set: setModel,
        visible: models.visible,
        setVisibility: models.setVisibility,
        variant: {
          configured: configuredVariant,
          selected: selectedVariant,
          current: currentVariant,
          list: variantList,
          set: setVariant,
          cycle: cycleVariantFn,
        },
      },
      session: {
        reset: resetSession,
        promote: promoteSession,
        restore: restoreSession,
      },
    }),
    [
      agentList,
      currentAgent,
      setAgent,
      moveAgent,
      models.ready,
      persistReady,
      currentModel,
      recentModels,
      models.list,
      cycleModel,
      setModel,
      models.visible,
      models.setVisibility,
      configuredVariant,
      selectedVariant,
      currentVariant,
      variantList,
      setVariant,
      cycleVariantFn,
      resetSession,
      promoteSession,
      restoreSession,
    ],
  );

  return (
    <LocalContext.Provider value={ctxValue}>{children}</LocalContext.Provider>
  );
}

export function useLocal(): LocalContextValue {
  const ctx = useContext(LocalContext);
  if (!ctx) throw new Error("useLocal must be used within a <LocalProvider>");
  return ctx;
}
