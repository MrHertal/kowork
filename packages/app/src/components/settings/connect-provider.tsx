import type {
  ProviderAuthAuthorization,
  ProviderAuthMethod,
} from "@opencode-ai/sdk/v2/client";
import { useForm } from "@tanstack/react-form";
import { ArrowLeftIcon, BanIcon, ClipboardCopyIcon } from "lucide-react";
import {
  type SyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { z } from "zod";

import { ModelSelectorLogo } from "@/components/ai-elements/model-selector";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useDialog } from "@/contexts/dialog";
import { useGlobalSDK } from "@/contexts/global-sdk";
import { useGlobalData, useGlobalSync } from "@/contexts/global-sync";
import { usePlatform } from "@/contexts/platform";
import { useProviders } from "@/hooks/use-providers";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

import { DialogSettings } from "./dialog-settings";
import { isFieldInvalid, TextField } from "./form-helpers";
import { SelectProvider } from "./select-provider";
import type { SettingsSection } from "./settings-shell";
import { SettingsShell } from "./settings-shell";

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

interface ConnectState {
  methodIndex: number | undefined;
  authorization: ProviderAuthAuthorization | undefined;
  state: "pending" | "complete" | "error" | "prompt" | undefined;
  error: string | undefined;
}

type ConnectAction =
  | { type: "method.select"; index: number }
  | { type: "method.reset" }
  | { type: "auth.prompt" }
  | { type: "auth.pending" }
  | { type: "auth.complete"; authorization: ProviderAuthAuthorization }
  | { type: "auth.error"; error: string };

const initialState: ConnectState = {
  methodIndex: undefined,
  authorization: undefined,
  state: undefined,
  error: undefined,
};

function connectReducer(
  state: ConnectState,
  action: ConnectAction,
): ConnectState {
  switch (action.type) {
    case "method.select":
      return {
        methodIndex: action.index,
        authorization: undefined,
        state: undefined,
        error: undefined,
      };
    case "method.reset":
      return {
        methodIndex: undefined,
        authorization: undefined,
        state: undefined,
        error: undefined,
      };
    case "auth.prompt":
      return { ...state, state: "prompt", error: undefined };
    case "auth.pending":
      return { ...state, state: "pending", error: undefined };
    case "auth.complete":
      return {
        ...state,
        state: "complete",
        authorization: action.authorization,
        error: undefined,
      };
    case "auth.error":
      return { ...state, state: "error", error: action.error };
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const AUTH_FALLBACK: ProviderAuthMethod[] = [
  { type: "api" as const, label: "API Key" },
];

function formatError(value: unknown, fallback: string): string {
  if (value && typeof value === "object" && "data" in value) {
    const data = (value as { data?: { message?: unknown } }).data;
    if (typeof data?.message === "string" && data.message) return data.message;
  }
  if (value && typeof value === "object" && "error" in value) {
    const nested = formatError((value as { error?: unknown }).error, "");
    if (nested) return nested;
  }
  if (value && typeof value === "object" && "message" in value) {
    const message = (value as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  if (value instanceof Error && value.message) return value.message;
  if (typeof value === "string" && value) return value;
  return fallback;
}

function methodLabel(value?: { type?: string; label?: string }): string {
  if (!value) return "";
  if (value.type === "api") return m.provider_method_apiKey();
  return value.label ?? "";
}

// ---------------------------------------------------------------------------
// ConnectProvider (exported)
// ---------------------------------------------------------------------------

export function ConnectProvider({
  providerID,
  back,
}: {
  providerID: string;
  back?: "providers" | "settings";
}) {
  const dialog = useDialog();
  const platform = usePlatform();
  const globalSDK = useGlobalSDK();
  const globalSync = useGlobalSync();
  const providers = useProviders();
  const cachedAuth = useGlobalData((s) => s.provider_auth[providerID]);

  const [state, dispatch] = useReducer(connectReducer, initialState);
  const [fetchState, setFetchState] = useState<{
    loading: boolean;
    methods: ProviderAuthMethod[];
  }>({ loading: !cachedAuth, methods: AUTH_FALLBACK });

  // Derive from cache when available, fall back to fetch state
  const loading = cachedAuth ? false : fetchState.loading;
  const methods = cachedAuth ?? fetchState.methods;

  const aliveRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const autoSelectedRef = useRef(false);

  // Track mount lifecycle (StrictMode remount safe)
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (timerRef.current !== undefined) {
        clearTimeout(timerRef.current);
        timerRef.current = undefined;
      }
    };
  }, []);

  // Fetch auth methods when not cached
  useEffect(() => {
    if (cachedAuth) return;
    let cancelled = false;
    globalSDK.client.provider
      .auth()
      .then((res) => {
        if (cancelled) return;
        const data = res.data ?? {};
        globalSync.updateGlobal((prev) => ({ ...prev, provider_auth: data }));
        setFetchState({
          loading: false,
          methods: data[providerID] ?? AUTH_FALLBACK,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setFetchState({ loading: false, methods: AUTH_FALLBACK });
      });
    return () => {
      cancelled = true;
    };
  }, [providerID, cachedAuth, globalSDK, globalSync]);

  const provider = useMemo(() => {
    return (
      providers.all.find((x) => x.id === providerID) ?? {
        id: providerID,
        name: providerID,
      }
    );
  }, [providers, providerID]);

  const method = useMemo(
    () =>
      state.methodIndex !== undefined ? methods[state.methodIndex] : undefined,
    [state.methodIndex, methods],
  );

  const title = useMemo(() => {
    if (
      providerID === "anthropic" &&
      method?.label?.toLowerCase().includes("max")
    ) {
      return m.provider_connect_title_anthropicProMax();
    }
    return m.provider_connect_title({ provider: provider.name });
  }, [providerID, provider.name, method]);

  const selectMethod = useCallback(
    async (index: number, inputs?: Record<string, string>) => {
      if (timerRef.current !== undefined) {
        clearTimeout(timerRef.current);
        timerRef.current = undefined;
      }

      const selected = methods[index];
      if (!selected) return;
      dispatch({ type: "method.select", index });

      if (selected.type === "oauth") {
        if (selected.prompts?.length && !inputs) {
          dispatch({ type: "auth.prompt" });
          return;
        }
        dispatch({ type: "auth.pending" });
        const start = Date.now();
        try {
          const res = await globalSDK.client.provider.oauth.authorize(
            { providerID, method: index, inputs },
            { throwOnError: true },
          );
          if (!aliveRef.current) return;
          const elapsed = Date.now() - start;
          const delay = 1000 - elapsed;
          if (delay > 0) {
            timerRef.current = setTimeout(() => {
              timerRef.current = undefined;
              if (!aliveRef.current) return;
              dispatch({ type: "auth.complete", authorization: res.data! });
            }, delay);
          } else {
            dispatch({ type: "auth.complete", authorization: res.data! });
          }
        } catch (e) {
          if (!aliveRef.current) return;
          dispatch({
            type: "auth.error",
            error: formatError(e, m.common_requestFailed()),
          });
        }
      }
    },
    [methods, providerID, globalSDK],
  );

  // Auto-select if only 1 method
  useEffect(() => {
    if (autoSelectedRef.current) return;
    if (loading) return;
    if (methods.length === 1) {
      autoSelectedRef.current = true;
      selectMethod(0);
    }
  }, [loading, methods.length, selectMethod]);

  const complete = useCallback(async () => {
    await globalSDK.client.global.dispose();
    dialog.close();
    toast.success(
      m.provider_connect_toast_connected_title({ provider: provider.name }),
      {
        description: m.provider_connect_toast_connected_description({
          provider: provider.name,
        }),
      },
    );
  }, [globalSDK, dialog, provider.name]);

  const goBack = useCallback(() => {
    if (back === "settings") {
      dialog.show(() => <DialogSettings initialSection="providers" />);
      return;
    }
    dialog.show(() => <SelectProvider />);
  }, [back, dialog]);

  const handleNavItemClick = useCallback(
    (id: SettingsSection) => {
      dialog.show(() => <DialogSettings initialSection={id} />);
    },
    [dialog],
  );

  const [promptStep, setPromptStep] = useState(0);
  const [promptResetKey, setPromptResetKey] = useState(0);

  const hasPrompts =
    method?.type === "oauth" && (method.prompts?.length ?? 0) > 0;
  const showBack =
    state.methodIndex !== undefined &&
    (methods.length > 1 ||
      (hasPrompts && (state.state !== "prompt" || promptStep > 0)));

  const handleBack = useCallback(() => {
    if (methods.length > 1) {
      dispatch({ type: "method.reset" });
      return;
    }
    if (hasPrompts) {
      setPromptStep(0);
      setPromptResetKey((k) => k + 1);
      dispatch({ type: "auth.prompt" });
    }
  }, [methods.length, hasPrompts]);

  // --- Render ---

  const renderContent = () => {
    if (loading) {
      return <LoadingView />;
    }
    if (state.methodIndex === undefined) {
      return (
        <MethodSelectionView
          methods={methods}
          providerName={provider.name}
          onSelect={selectMethod}
        />
      );
    }
    if (state.state === "pending") {
      return <LoadingView />;
    }
    if (state.state === "prompt" && method) {
      return (
        <OAuthPromptsView
          key={promptResetKey}
          method={method}
          methodIndex={state.methodIndex}
          selectMethod={selectMethod}
          onStepChange={setPromptStep}
        />
      );
    }
    if (state.state === "error") {
      return (
        <div className="flex items-center gap-2 text-sm">
          <BanIcon className="size-4 text-destructive" />
          <span>{state.error ?? m.common_requestFailed()}</span>
        </div>
      );
    }
    if (method?.type === "api") {
      return (
        <ApiAuthView
          providerID={providerID}
          providerName={provider.name}
          globalSDK={globalSDK}
          complete={complete}
        />
      );
    }
    if (method?.type === "oauth" && state.authorization?.method === "code") {
      return (
        <OAuthCodeView
          providerID={providerID}
          providerName={provider.name}
          methodIndex={state.methodIndex!}
          methodLabel={methodLabel(method)}
          authorization={state.authorization}
          globalSDK={globalSDK}
          complete={complete}
        />
      );
    }
    if (method?.type === "oauth" && state.authorization?.method === "auto") {
      return (
        <OAuthAutoView
          providerID={providerID}
          providerName={provider.name}
          methodIndex={state.methodIndex!}
          authorization={state.authorization}
          globalSDK={globalSDK}
          complete={complete}
          dispatch={dispatch}
        />
      );
    }
    return null;
  };

  return (
    <SettingsShell
      title={title}
      activeNavItem="providers"
      breadcrumbParents={
        back === "providers"
          ? [
              {
                label: m.provider_connect_breadcrumb_parent(),
                onClick: () => handleNavItemClick("providers"),
              },
              {
                label: m.provider_connect_breadcrumb_label(),
                onClick: goBack,
              },
            ]
          : [
              {
                label: m.provider_connect_breadcrumb_parent(),
                onClick: goBack,
              },
            ]
      }
      onNavItemClick={handleNavItemClick}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "overflow-hidden transition-[width] duration-200",
            showBack ? "w-8" : "w-0",
          )}
        >
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleBack}
            aria-label={m.common_back()}
            tabIndex={showBack ? 0 : -1}
          >
            <ArrowLeftIcon className="size-4" aria-hidden="true" />
          </Button>
        </div>
        <ModelSelectorLogo provider={providerID} className="size-5 shrink-0" />
        <span className="text-sm font-medium">{title}</span>
      </div>

      {renderContent()}
    </SettingsShell>
  );
}

// ---------------------------------------------------------------------------
// LoadingView
// ---------------------------------------------------------------------------

function LoadingView() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
      <Spinner />
      <span>{m.provider_connect_status()}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MethodSelectionView
// ---------------------------------------------------------------------------

function MethodSelectionView({
  methods,
  providerName,
  onSelect,
}: {
  methods: ProviderAuthMethod[];
  providerName: string;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {m.provider_connect_methods_select({ provider: providerName })}
      </p>
      <div className="flex flex-col items-start gap-3">
        {methods.map((meth, index) => (
          <Button
            key={meth.label}
            variant="outline"
            size="sm"
            onClick={() => onSelect(index)}
          >
            {methodLabel(meth)}
          </Button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OAuthPromptsView
// ---------------------------------------------------------------------------

function OAuthPromptsView({
  method,
  methodIndex,
  selectMethod,
  onStepChange,
}: {
  method: ProviderAuthMethod;
  methodIndex: number;
  selectMethod: (index: number, inputs: Record<string, string>) => void;
  onStepChange?: (step: number) => void;
}) {
  const prompts = useMemo(() => {
    if (method.type !== "oauth") return [];
    return method.prompts ?? [];
  }, [method]);

  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);

  const matches = useCallback(
    (prompt: (typeof prompts)[number], values: Record<string, string>) => {
      if (!prompt.when) return true;
      const actual = values[prompt.when.key];
      if (actual === undefined) return false;
      return prompt.when.op === "eq"
        ? actual === prompt.when.value
        : actual !== prompt.when.value;
    },
    [],
  );

  const current = useMemo(() => {
    const index = prompts.findIndex(
      (prompt, i) => i >= currentIndex && matches(prompt, formValues),
    );
    if (index === -1) return undefined;
    const prompt = prompts[index];
    if (!prompt) return undefined;
    return { index, prompt };
  }, [prompts, currentIndex, formValues, matches]);

  const advance = useCallback(
    (fromIndex: number, values: Record<string, string>) => {
      const next = prompts.findIndex(
        (prompt, i) => i > fromIndex && matches(prompt, values),
      );
      if (next !== -1) {
        setCurrentIndex(next);
        onStepChange?.(next);
        return;
      }
      selectMethod(methodIndex, values);
    },
    [prompts, matches, selectMethod, methodIndex, onStepChange],
  );

  const handleSubmit = useCallback(
    (e: SyntheticEvent) => {
      e.preventDefault();
      if (!current || current.prompt.type !== "text") return;
      const prompt = current.prompt;
      const value = formValues[prompt.key] ?? "";
      if (!value.trim()) return;
      advance(current.index, formValues);
    },
    [current, formValues, advance],
  );

  if (!current) return null;

  if (current.prompt.type === "select") {
    const prompt = current.prompt;
    const options = prompt.options ?? [];
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">{prompt.message}</p>
        <Select
          value={formValues[prompt.key] ?? ""}
          onValueChange={(value) => {
            const nextValues = { ...formValues, [prompt.key]: value };
            setFormValues(nextValues);
            advance(current.index, nextValues);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder={m.provider_select_option_placeholder()} />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                <span>{opt.label}</span>
                {opt.hint && (
                  <span className="ml-2 text-muted-foreground">{opt.hint}</span>
                )}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  const prompt = current.prompt;
  return (
    <form onSubmit={handleSubmit}>
      <FieldGroup className="gap-6">
        <Field>
          <FieldLabel htmlFor={prompt.key}>{prompt.message}</FieldLabel>
          <Input
            id={prompt.key}
            name={prompt.key}
            autoFocus
            placeholder={prompt.placeholder}
            value={formValues[prompt.key] ?? ""}
            onChange={(e) =>
              setFormValues((prev) => ({
                ...prev,
                [prompt.key]: e.target.value,
              }))
            }
          />
        </Field>
        <Button
          type="submit"
          className="self-start"
          disabled={!(formValues[prompt.key] ?? "").trim()}
        >
          {m.common_continue()}
        </Button>
      </FieldGroup>
    </form>
  );
}

// ---------------------------------------------------------------------------
// ApiAuthView
// ---------------------------------------------------------------------------

const apiAuthSchema = z
  .object({ apiKey: z.string() })
  .superRefine((value, ctx) => {
    if (!value.apiKey.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["apiKey"],
        message: m.provider_connect_apiKey_required(),
      });
    }
  });

function ApiAuthView({
  providerID,
  providerName,
  globalSDK,
  complete,
}: {
  providerID: string;
  providerName: string;
  globalSDK: ReturnType<typeof useGlobalSDK>;
  complete: () => Promise<void>;
}) {
  const platform = usePlatform();
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [serverError, setServerError] = useState<string | undefined>();

  const form = useForm({
    defaultValues: { apiKey: "" },
    validators: { onSubmit: apiAuthSchema, onChange: apiAuthSchema },
    onSubmitInvalid: () => setSubmitAttempted(true),
    onSubmit: async ({ value }) => {
      const apiKey = value.apiKey.trim();
      try {
        await globalSDK.client.auth.set({
          providerID,
          auth: { type: "api", key: apiKey },
        });
        await complete();
      } catch (err) {
        setServerError(formatError(err, m.provider_connect_save_failed()));
        throw err;
      }
    },
  });

  return (
    <div className="flex flex-col gap-6">
      {providerID === "opencode" ? (
        <p className="text-sm text-muted-foreground">
          {m.provider_connect_opencodeZen_description_prefix()}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              platform.openLink("https://opencode.ai/zen");
            }}
            className="underline underline-offset-3 hover:text-foreground"
          >
            {m.provider_connect_opencodeZen_link()}
          </a>
          {m.provider_connect_opencodeZen_description_suffix()}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {m.provider_connect_apiKey_description({ provider: providerName })}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
      >
        <FieldGroup className="gap-6">
          <form.Field name="apiKey">
            {(field) => {
              const invalid = isFieldInvalid(field, submitAttempted);
              const showError = invalid || !!serverError;
              const errors = invalid
                ? field.state.meta.errors
                : [{ message: serverError }];
              return (
                <TextField
                  id={field.name}
                  type="password"
                  label={m.provider_connect_apiKey_label({
                    provider: providerName,
                  })}
                  placeholder={m.provider_connect_apiKey_placeholder()}
                  value={field.state.value}
                  onChange={(value) => {
                    setServerError(undefined);
                    field.handleChange(value);
                  }}
                  onBlur={field.handleBlur}
                  invalid={showError}
                  errors={errors}
                  autoFocus
                />
              );
            }}
          </form.Field>
          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(isSubmitting) => (
              <Button
                type="submit"
                className="self-start"
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? m.provider_connect_connecting()
                  : m.common_continue()}
              </Button>
            )}
          </form.Subscribe>
        </FieldGroup>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OAuthCodeView
// ---------------------------------------------------------------------------

const oauthCodeSchema = z
  .object({ code: z.string() })
  .superRefine((value, ctx) => {
    if (!value.code.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["code"],
        message: m.provider_connect_oauth_code_required(),
      });
    }
  });

function OAuthCodeView({
  providerID,
  providerName,
  methodIndex,
  methodLabel: label,
  authorization,
  globalSDK,
  complete,
}: {
  providerID: string;
  providerName: string;
  methodIndex: number;
  methodLabel: string;
  authorization: ProviderAuthAuthorization;
  globalSDK: ReturnType<typeof useGlobalSDK>;
  complete: () => Promise<void>;
}) {
  const platform = usePlatform();
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [serverError, setServerError] = useState<string | undefined>();

  const form = useForm({
    defaultValues: { code: "" },
    validators: { onSubmit: oauthCodeSchema, onChange: oauthCodeSchema },
    onSubmitInvalid: () => setSubmitAttempted(true),
    onSubmit: async ({ value }) => {
      const code = value.code.trim();
      let response;
      try {
        response = await globalSDK.client.provider.oauth.callback({
          providerID,
          method: methodIndex,
          code,
        });
      } catch (err) {
        setServerError(
          formatError(err, m.provider_connect_oauth_code_save_failed()),
        );
        throw err;
      }
      if (response.error) {
        setServerError(
          formatError(response.error, m.provider_connect_oauth_code_invalid()),
        );
        throw new Error("oauth callback rejected");
      }
      await complete();
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        {m.provider_connect_oauth_code_visit_prefix()}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            platform.openLink(authorization.url);
          }}
          className="underline underline-offset-3 hover:text-foreground"
        >
          {m.provider_connect_oauth_code_visit_link()}
        </a>
        {m.provider_connect_oauth_code_visit_suffix({ provider: providerName })}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
      >
        <FieldGroup className="gap-6">
          <form.Field name="code">
            {(field) => {
              const invalid = isFieldInvalid(field, submitAttempted);
              const showError = invalid || !!serverError;
              const errors = invalid
                ? field.state.meta.errors
                : [{ message: serverError }];
              return (
                <TextField
                  id={field.name}
                  label={m.provider_connect_oauth_code_label({ method: label })}
                  placeholder={m.provider_connect_oauth_code_placeholder()}
                  value={field.state.value}
                  onChange={(value) => {
                    setServerError(undefined);
                    field.handleChange(value);
                  }}
                  onBlur={field.handleBlur}
                  invalid={showError}
                  errors={errors}
                  autoFocus
                />
              );
            }}
          </form.Field>
          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(isSubmitting) => (
              <Button
                type="submit"
                className="self-start"
                disabled={isSubmitting}
              >
                {isSubmitting
                  ? m.provider_connect_oauth_code_verifying()
                  : m.common_continue()}
              </Button>
            )}
          </form.Subscribe>
        </FieldGroup>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OAuthAutoView
// ---------------------------------------------------------------------------

function OAuthAutoView({
  providerID,
  providerName,
  methodIndex,
  authorization,
  globalSDK,
  complete,
  dispatch,
}: {
  providerID: string;
  providerName: string;
  methodIndex: number;
  authorization: ProviderAuthAuthorization;
  globalSDK: ReturnType<typeof useGlobalSDK>;
  complete: () => Promise<void>;
  dispatch: React.Dispatch<ConnectAction>;
}) {
  const platform = usePlatform();
  const confirmationCode = useMemo(() => {
    const instructions = authorization.instructions;
    if (instructions?.includes(":")) {
      return instructions.split(":")[1]?.trim();
    }
    return instructions;
  }, [authorization.instructions]);

  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;
    void (async () => {
      const result = await globalSDK.client.provider.oauth
        .callback({ providerID, method: methodIndex })
        .then((value) =>
          value.error
            ? { ok: false as const, error: value.error }
            : { ok: true as const },
        )
        .catch((err) => ({ ok: false as const, error: err }));

      if (cancelled) return;

      if (!result.ok) {
        dispatch({
          type: "auth.error",
          error: formatError(result.error, m.common_requestFailed()),
        });
        return;
      }

      await complete();
    })();
    return () => {
      cancelled = true;
    };
  }, [
    globalSDK.client.provider.oauth,
    providerID,
    methodIndex,
    dispatch,
    complete,
  ]);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        {m.provider_connect_oauth_auto_visit_prefix()}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            platform.openLink(authorization.url);
          }}
          className="underline underline-offset-3 hover:text-foreground"
        >
          {m.provider_connect_oauth_auto_visit_link()}
        </a>
        {m.provider_connect_oauth_auto_visit_suffix({ provider: providerName })}
      </p>
      {confirmationCode && (
        <Field>
          <FieldLabel htmlFor="confirmation-code">
            {m.provider_connect_oauth_auto_confirmationCode()}
          </FieldLabel>
          <div className="flex items-center gap-2">
            <Input
              id="confirmation-code"
              readOnly
              value={confirmationCode}
              className="font-mono"
            />
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => {
                void navigator.clipboard.writeText(confirmationCode);
                toast.success(m.common_copied());
              }}
              aria-label={m.provider_copyConfirmationCode()}
            >
              <ClipboardCopyIcon className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </Field>
      )}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        <span>{m.provider_connect_oauth_auto_waiting()}</span>
      </div>
    </div>
  );
}
