// @opencode-ref: opencode/packages/app/src/components/settings-providers.tsx
import {
  ChevronRightIcon,
  PlusIcon,
  UnplugIcon,
  WandSparklesIcon,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { ModelSelectorLogo } from "@/components/ai-elements/model-selector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDialog } from "@/contexts/dialog";
import { useGlobalSDK } from "@/contexts/global-sdk";
import { useGlobalData, useGlobalSync } from "@/contexts/global-sync";
import { popularProviders, useProviders } from "@/hooks/use-providers";
import { scheduleOptimisticWrite } from "@/lib/optimistic";
import { m } from "@/paraglide/messages";

import { ConnectProvider } from "./connect-provider";
import { CustomProvider } from "./custom-provider";
import { IconAction } from "./icon-action";
import { getProviderNote } from "./provider-notes";
import { SelectProvider } from "./select-provider";
import { SettingsListItem } from "./settings-list-item";
import { SettingsSection } from "./settings-row";

type ProviderSource = "env" | "api" | "config" | "custom";

const RECOMMENDED_PROVIDERS = new Set(["opencode", "opencode-go"]);

function getSource(item: { source?: string }): ProviderSource | undefined {
  const value = item.source;
  if (
    value === "env" ||
    value === "api" ||
    value === "config" ||
    value === "custom"
  )
    return value;
  return undefined;
}

function sourceLabel(
  source: ProviderSource | undefined,
  isCustomConfig: boolean,
): string {
  if (source === "env") return m.settings_providers_tag_environment();
  if (source === "api") return m.provider_method_apiKey();
  if (source === "config")
    return isCustomConfig
      ? m.settings_providers_tag_custom()
      : m.settings_providers_tag_config();
  if (source === "custom") return m.settings_providers_tag_custom();
  return m.settings_providers_tag_other();
}

export function SettingsProviders() {
  const dialog = useDialog();
  const globalSDK = useGlobalSDK();
  const globalSync = useGlobalSync();
  const providers = useProviders();
  const config = useGlobalData((s) => s.config);

  const [disconnecting, setDisconnecting] = useState<string | null>(null);

  const isConfigCustom = useCallback(
    (providerID: string) => {
      const provider = config.provider?.[providerID];
      if (!provider) return false;
      if (provider.npm !== "@ai-sdk/openai-compatible") return false;
      if (!provider.models || Object.keys(provider.models).length === 0)
        return false;
      return true;
    },
    [config],
  );

  const connected = providers.paid;
  const free = providers.free;

  const popular = useMemo(() => {
    const connectedIDs = new Set(connected.map((p) => p.id));
    return providers.popular
      .filter((p) => !connectedIDs.has(p.id))
      .slice()
      .sort(
        (a, b) =>
          popularProviders.indexOf(a.id) - popularProviders.indexOf(b.id),
      );
  }, [providers, connected]);

  const disableProvider = useCallback(
    async (providerID: string, name: string) => {
      const before = config.disabled_providers ?? [];
      const next = before.includes(providerID)
        ? before
        : [...before, providerID];

      const optimistic = scheduleOptimisticWrite(
        () =>
          globalSync.updateGlobal((prev) => ({
            ...prev,
            config: { ...prev.config, disabled_providers: next },
          })),
        () =>
          globalSync.updateGlobal((prev) => ({
            ...prev,
            config: { ...prev.config, disabled_providers: before },
          })),
      );

      try {
        await globalSync.updateConfig({ disabled_providers: next });
        optimistic.commit();
        toast.success(m.provider_disconnect_toast_title({ provider: name }), {
          description: m.provider_disconnect_toast_description({
            provider: name,
          }),
        });
      } catch (err) {
        optimistic.rollback();
        const message = err instanceof Error ? err.message : String(err);
        toast.error(m.common_requestFailed(), { description: message });
      }
    },
    [config, globalSync],
  );

  const disconnect = useCallback(
    async (providerID: string, name: string) => {
      setDisconnecting(providerID);
      try {
        if (isConfigCustom(providerID)) {
          await globalSDK.client.auth
            .remove({ providerID })
            .catch(() => undefined);
          await disableProvider(providerID, name);
          return;
        }

        await globalSDK.client.auth.remove({ providerID });
        await globalSDK.client.global.dispose();
        toast.success(m.provider_disconnect_toast_title({ provider: name }), {
          description: m.provider_disconnect_toast_description({
            provider: name,
          }),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        toast.error(m.common_requestFailed(), { description: message });
        setDisconnecting(null);
      }
    },
    [globalSDK, disableProvider, isConfigCustom],
  );

  // Clear the spinner once the row leaves the list (env rows stay; their source flips).
  if (disconnecting) {
    const item = connected.find((p) => p.id === disconnecting);
    if (!item || getSource(item) === "env") {
      setDisconnecting(null);
    }
  }

  const handleConnect = useCallback(
    (providerID: string) => {
      dialog.show(() => (
        <ConnectProvider providerID={providerID} back="settings" />
      ));
    },
    [dialog],
  );

  const handleCustom = useCallback(() => {
    dialog.show(() => <CustomProvider back="settings" />);
  }, [dialog]);

  const handleViewAll = useCallback(() => {
    dialog.show(() => <SelectProvider />);
  }, [dialog]);

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection
        title={m.settings_providers_section_connected()}
        bordered={connected.length > 0 || free.length > 0}
      >
        {connected.length === 0 && free.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            {m.settings_providers_connected_empty()}
          </p>
        ) : (
          <>
            {connected.map((item) => {
              const source = getSource(item);
              const canDisconnect = source !== "env";
              const label = sourceLabel(
                source,
                source === "config" && isConfigCustom(item.id),
              );

              const isPending = disconnecting === item.id;

              return (
                <SettingsListItem
                  key={item.id}
                  icon={
                    <ModelSelectorLogo
                      provider={item.id}
                      className="size-5 shrink-0"
                    />
                  }
                  title={item.name}
                  badge={<Badge variant="secondary">{label}</Badge>}
                  description={
                    !canDisconnect
                      ? m.settings_providers_connected_environmentDescription()
                      : undefined
                  }
                  action={
                    canDisconnect ? (
                      <IconAction
                        icon={<UnplugIcon aria-hidden="true" />}
                        label={m.provider_disconnect_label()}
                        tooltip={
                          isPending
                            ? m.provider_disconnect_disconnecting()
                            : undefined
                        }
                        onClick={() => void disconnect(item.id, item.name)}
                        disabled={isPending}
                      />
                    ) : undefined
                  }
                />
              );
            })}
            {free.map((item) => (
              <SettingsListItem
                key={item.id}
                icon={
                  <ModelSelectorLogo
                    provider={item.id}
                    className="size-5 shrink-0"
                  />
                }
                title={m.settings_providers_free_title()}
                badge={
                  <Badge variant="secondary">
                    {m.settings_providers_tag_free()}
                  </Badge>
                }
                description={m.settings_providers_connected_freeDescription()}
              />
            ))}
          </>
        )}
      </SettingsSection>

      <div className="flex flex-col gap-5">
        <SettingsSection title={m.settings_providers_section_popular()}>
          {popular.map((item) => {
            const note = getProviderNote(item.id);
            return (
              <SettingsListItem
                key={item.id}
                icon={
                  <ModelSelectorLogo
                    provider={item.id}
                    className="size-5 shrink-0"
                  />
                }
                title={item.name}
                badge={
                  RECOMMENDED_PROVIDERS.has(item.id) ? (
                    <Badge variant="outline">
                      {m.dialog_provider_tag_recommended()}
                    </Badge>
                  ) : undefined
                }
                description={note}
                action={
                  <>
                    <Button
                      variant="secondary"
                      size="icon-sm"
                      className="sm:hidden"
                      onClick={() => handleConnect(item.id)}
                      aria-label={m.settings_providers_custom_connect()}
                    >
                      <PlusIcon aria-hidden="true" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="hidden sm:inline-flex"
                      onClick={() => handleConnect(item.id)}
                    >
                      <PlusIcon data-icon="inline-start" aria-hidden="true" />
                      {m.settings_providers_custom_connect()}
                    </Button>
                  </>
                }
              />
            );
          })}

          <SettingsListItem
            icon={
              <WandSparklesIcon className="size-5 shrink-0 text-muted-foreground" />
            }
            title={m.settings_providers_custom_label()}
            badge={
              <Badge variant="outline">{m.dialog_provider_tag_custom()}</Badge>
            }
            description={m.settings_providers_custom_description()}
            action={
              <>
                <Button
                  variant="secondary"
                  size="icon-sm"
                  className="sm:hidden"
                  onClick={handleCustom}
                  aria-label={m.settings_providers_custom_connect()}
                >
                  <PlusIcon aria-hidden="true" />
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="hidden sm:inline-flex"
                  onClick={handleCustom}
                >
                  <PlusIcon data-icon="inline-start" aria-hidden="true" />
                  {m.settings_providers_custom_connect()}
                </Button>
              </>
            }
          />
        </SettingsSection>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={handleViewAll}
        >
          <ChevronRightIcon data-icon="inline-start" aria-hidden="true" />
          {m.dialog_provider_viewAll()}
        </Button>
      </div>
    </div>
  );
}
