// @opencode-ref: opencode/packages/app/src/context/models.tsx
import type { Model, Provider } from "@opencode-ai/sdk/v2/client";
import { differenceInMonths } from "date-fns";
import {
  filter,
  firstBy,
  flat,
  groupBy,
  mapValues,
  pipe,
  values,
} from "remeda";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
} from "react";

import { useProviders } from "@/hooks/use-providers";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { Persist } from "@/utils/persist";

export type ModelKey = { providerID: string; modelID: string };

type Visibility = "show" | "hide";
type User = ModelKey & { visibility: Visibility; favorite?: boolean };

interface ModelsStore {
  user: User[];
  recent: ModelKey[];
  variant?: Record<string, string | undefined>;
}

type AvailableModel = Model & { provider: Provider };

type ListModel = AvailableModel & { latest: boolean };

const PERSIST_TARGET = Persist.global("model", ["model.v1"]);
const RECENT_LIMIT = 5;

const createDefaultStore = (): ModelsStore => ({
  user: [],
  recent: [],
  variant: {},
});

function modelKey(model: ModelKey) {
  return `${model.providerID}:${model.modelID}`;
}

interface DerivedModels {
  available: AvailableModel[];
  releaseMap: Map<string, Date>;
  latestSet: Set<string>;
  visibilityMap: Map<string, Visibility>;
  list: ListModel[];
}

function buildDerived(
  store: ModelsStore,
  connectedProviders: Provider[],
): DerivedModels {
  const available = connectedProviders.flatMap((p) =>
    Object.values(p.models).map((m) => ({
      ...m,
      provider: p,
    })),
  );

  const releaseMap = new Map(
    available.map((model) => {
      const parsed = new Date(model.release_date);
      return [
        modelKey({ providerID: model.provider.id, modelID: model.id }),
        parsed,
      ] as const;
    }),
  );

  const now = new Date();
  const latest = pipe(
    available,
    filter((x) => {
      const date = releaseMap.get(
        modelKey({ providerID: x.provider.id, modelID: x.id }),
      );
      if (!date || isNaN(date.getTime())) return false;
      return Math.abs(differenceInMonths(date, now)) < 6;
    }),
    groupBy((x) => x.provider.id),
    mapValues((models) =>
      pipe(
        models,
        groupBy((x) => x.family ?? ""),
        values(),
        (groups: AvailableModel[][]) =>
          groups.flatMap((g) => {
            const first = firstBy(g, [(x) => x.release_date, "desc"]);
            return first
              ? [{ modelID: first.id, providerID: first.provider.id }]
              : [];
          }),
      ),
    ),
    values(),
    flat(),
  );

  const latestSet = new Set(latest.map((x) => modelKey(x)));

  const visibilityMap = new Map<string, Visibility>();
  for (const item of store.user) {
    visibilityMap.set(`${item.providerID}:${item.modelID}`, item.visibility);
  }

  const list = available.map((m) => ({
    ...m,
    name: m.name.replace("(latest)", "").trim(),
    latest: m.name.includes("(latest)"),
  }));

  return { available, releaseMap, latestSet, visibilityMap, list };
}

interface ModelsContextValue {
  ready: boolean;
  list: ListModel[];
  find: (key: ModelKey) => ListModel | undefined;
  visible: (model: ModelKey) => boolean;
  setVisibility: (model: ModelKey, state: boolean) => void;
  recent: {
    list: ModelKey[];
    push: (model: ModelKey) => void;
  };
  variant: {
    get: (model: ModelKey) => string | undefined;
    set: (model: ModelKey, value: string | undefined) => void;
  };
}

const ModelsContext = createContext<ModelsContextValue | null>(null);

interface ModelsProviderProps {
  children: ReactNode;
}

export function ModelsProvider({ children }: ModelsProviderProps) {
  const providers = useProviders();

  const {
    state: store,
    setState: setStore,
    ready,
  } = usePersistedState<ModelsStore>({
    target: PERSIST_TARGET,
    createDefault: createDefaultStore,
    logName: "models",
  });

  const derived = useMemo(
    () => buildDerived(store, providers.connected),
    [store, providers.connected],
  );

  const find = useCallback(
    (key: ModelKey) =>
      derived.list.find(
        (m) => m.id === key.modelID && m.provider.id === key.providerID,
      ),
    [derived],
  );

  const visible = useCallback(
    (model: ModelKey) => {
      const key = modelKey(model);
      const vis = derived.visibilityMap.get(key);
      if (vis === "hide") return false;
      if (vis === "show") return true;
      if (derived.latestSet.has(key)) return true;
      const date = derived.releaseMap.get(key);
      if (!date || isNaN(date.getTime())) return true;
      return false;
    },
    [derived],
  );

  const setVisibility = useCallback((model: ModelKey, show: boolean) => {
    const visibility: Visibility = show ? "show" : "hide";
    setStore((prev) => {
      const index = prev.user.findIndex(
        (x) => x.modelID === model.modelID && x.providerID === model.providerID,
      );
      const nextUser =
        index >= 0
          ? prev.user.map((u, i) => (i === index ? { ...u, visibility } : u))
          : [...prev.user, { ...model, visibility }];
      return { ...prev, user: nextUser };
    });
  }, []);

  const pushRecent = useCallback((model: ModelKey) => {
    setStore((prev) => {
      const key = modelKey(model);
      const filtered = prev.recent.filter((x) => modelKey(x) !== key);
      return { ...prev, recent: [model, ...filtered].slice(0, RECENT_LIMIT) };
    });
  }, []);

  const getVariant = useCallback(
    (model: ModelKey) =>
      store.variant?.[`${model.providerID}/${model.modelID}`],
    [store.variant],
  );

  const setVariant = useCallback(
    (model: ModelKey, value: string | undefined) => {
      const key = `${model.providerID}/${model.modelID}`;
      setStore((prev) => ({
        ...prev,
        variant: { ...prev.variant, [key]: value },
      }));
    },
    [],
  );

  const ctxValue = useMemo<ModelsContextValue>(
    () => ({
      ready,
      list: derived.list,
      find,
      visible,
      setVisibility,
      recent: {
        list: store.recent,
        push: pushRecent,
      },
      variant: {
        get: getVariant,
        set: setVariant,
      },
    }),
    [
      ready,
      derived.list,
      store.recent,
      find,
      visible,
      setVisibility,
      pushRecent,
      getVariant,
      setVariant,
    ],
  );

  return (
    <ModelsContext.Provider value={ctxValue}>{children}</ModelsContext.Provider>
  );
}

export function useModels(): ModelsContextValue {
  const ctx = useContext(ModelsContext);
  if (!ctx) throw new Error("useModels must be used within ModelsProvider");
  return ctx;
}
