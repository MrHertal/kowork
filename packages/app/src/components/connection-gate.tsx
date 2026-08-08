import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useServer } from "@/contexts/server";
import { useCheckServerHealth } from "@/utils/server-health";
import { m } from "@/paraglide/messages";
import { Logo } from "./logo";

const STARTUP_TIMEOUT_MS = 10_000;
const RETRY_INTERVAL_MS = 1_000;
const SPLASH_DELAY_MS = 150;
const SERVER_TOKEN = "\x00server\x00";

type ConnectionGateProps = {
  disableHealthCheck?: boolean;
  children: ReactNode;
};

export function ConnectionGate({
  disableHealthCheck,
  children,
}: ConnectionGateProps) {
  const server = useServer();
  const checkHealth = useCheckServerHealth();
  const checkHealthRef = useRef(checkHealth);
  checkHealthRef.current = checkHealth;

  const [checkMode, setCheckMode] = useState<"blocking" | "background">(
    "blocking",
  );
  const checkModeRef = useRef(checkMode);
  checkModeRef.current = checkMode;

  const [healthResult, setHealthResult] = useState<boolean | undefined>(
    undefined,
  );
  const latestRef = useRef<boolean | undefined>(undefined);
  if (healthResult !== undefined) latestRef.current = healthResult;

  const [retryTrigger, setRetryTrigger] = useState(0);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    if (disableHealthCheck) {
      setHealthResult(true);
      return;
    }

    const conn = server.current;
    if (!conn) {
      setHealthResult(true);
      return;
    }

    setHealthResult(undefined);
    const id = ++fetchIdRef.current;
    const controller = new AbortController();

    const timer = setTimeout(() => {
      controller.abort();
    }, STARTUP_TIMEOUT_MS);

    void (async () => {
      try {
        while (!controller.signal.aborted) {
          const res = await checkHealthRef.current(conn.http);
          if (controller.signal.aborted) break;
          if (res.healthy) {
            if (id === fetchIdRef.current) setHealthResult(true);
            return;
          }
          if (checkModeRef.current === "background" || conn.type === "http") {
            if (id === fetchIdRef.current) setHealthResult(false);
            return;
          }
        }
        if (id === fetchIdRef.current) setHealthResult(false);
      } catch {
        if (id === fetchIdRef.current) setHealthResult(false);
      } finally {
        clearTimeout(timer);
        setCheckMode("background");
      }
    })();

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [server.current, retryTrigger, disableHealthCheck]);

  const refetch = useCallback(() => {
    setRetryTrigger((n) => n + 1);
  }, []);

  const [splashReady, setSplashReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSplashReady(true), SPLASH_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  if (checkMode === "blocking" && healthResult === undefined) {
    return splashReady ? <SplashLoadingScreen /> : null;
  }

  const effective =
    checkMode === "background" ? latestRef.current : healthResult;

  if (effective === true) return <>{children}</>;

  return <ConnectionError onRetry={refetch} />;
}

function SplashLoadingScreen() {
  return (
    <div className="flex h-dvh w-screen flex-col items-center justify-center bg-background">
      <Logo className="w-20 animate-pulse text-muted-foreground/50" />
    </div>
  );
}

function ConnectionError({ onRetry }: { onRetry?: () => void }) {
  const server = useServer();
  const name = server.name || server.key;

  const parts = useMemo(() => {
    const text = m.server_unreachable({ server: SERVER_TOKEN });
    return text.split(SERVER_TOKEN);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => onRetry?.(), RETRY_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [onRetry]);

  return (
    <div className="flex h-dvh w-screen flex-col items-center justify-center gap-6 bg-background p-6">
      <div className="flex max-w-md flex-col items-center text-center">
        <Logo className="mb-4 w-15 text-foreground" />
        <p className="text-sm text-foreground">
          {server.isLocal ? (
            m.server_local_unreachable()
          ) : (
            <>
              {parts[0]}
              <span className="font-medium">{name}</span>
              {parts[1]}
            </>
          )}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {m.server_retrying()}
        </p>
      </div>
    </div>
  );
}
