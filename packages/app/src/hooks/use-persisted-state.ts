import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePlatform } from "@/contexts/platform";
import {
  loadPersisted,
  type PersistTarget,
  resolveStorage,
  savePersisted,
} from "@/utils/persist";

export type UsePersistedStateOptions<T> = {
  target: PersistTarget;
  createDefault: () => T;
  loadDefault?: () => T;
  sanitize?: (value: T) => T;
  logName: string;
};

export type UsePersistedStateResult<T> = {
  state: T;
  setState: (next: T | ((prev: T) => T)) => void;
  ready: boolean;
};

export function usePersistedState<T>(
  opts: UsePersistedStateOptions<T>,
): UsePersistedStateResult<T> {
  const { target, createDefault, loadDefault, sanitize, logName } = opts;
  const platform = usePlatform();

  const storage = useMemo(
    () => resolveStorage(platform, target),
    [platform, target],
  );

  const [state, setRawState] = useState<T>(createDefault);
  const [ready, setReady] = useState(false);
  const dirty = useRef(false);

  const createDefaultRef = useRef(createDefault);
  const loadDefaultRef = useRef(loadDefault);
  const sanitizeRef = useRef(sanitize);
  useEffect(() => {
    createDefaultRef.current = createDefault;
    loadDefaultRef.current = loadDefault;
    sanitizeRef.current = sanitize;
  });

  useEffect(() => {
    let cancelled = false;
    dirty.current = false;
    setRawState(createDefaultRef.current());
    setReady(false);
    const fallbackFn = loadDefaultRef.current ?? createDefaultRef.current;
    void loadPersisted(storage, target, fallbackFn())
      .then((value) => {
        if (cancelled) return;
        if (!dirty.current) {
          setRawState(sanitizeRef.current?.(value) ?? value);
        }
        setReady(true);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error(`[${logName}] failed to load persisted state`, {
          error,
        });
        if (!dirty.current) {
          setRawState(fallbackFn());
        }
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [storage, target, logName]);

  useEffect(() => {
    if (!ready) return;
    if (!dirty.current) return;
    dirty.current = false;
    void savePersisted(storage, target, state);
  }, [ready, state, storage, target]);

  const setState = useCallback((next: T | ((prev: T) => T)) => {
    dirty.current = true;
    setRawState(next);
  }, []);

  return { state, setState, ready };
}
