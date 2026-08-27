// @opencode-ref: opencode/packages/app/src/components/dialog-select-mcp.tsx
// @opencode-ref: opencode/packages/app/src/components/status-popover-body.tsx
import type { McpStatus } from "@opencode-ai/sdk/v2/client";
import {
  LogInIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
  WandSparklesIcon,
} from "lucide-react";
import { useMemo } from "react";

import { mcpServerTitle } from "@/components/session/tools/mcp-tool";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useDialog } from "@/contexts/dialog";
import { useChildData, useGlobalData } from "@/contexts/global-sync";
import { useServer } from "@/contexts/server";
import { POPULAR_MCP, type PopularMcp } from "@/data/popular-mcp";
import { useDelayedShow } from "@/hooks/use-delayed-show";
import { useMcpMutation } from "@/hooks/use-mcp-mutation";
import { useMcpStatusSync } from "@/hooks/use-mcp-status-sync";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

import { CustomMcp } from "./custom-mcp";
import { IconAction } from "./icon-action";
import { McpLogo } from "./mcp-logo";
import {
  SettingsListItem,
  SettingsListItemSkeleton,
} from "./settings-list-item";
import { SettingsSection } from "./settings-row";

const STATUS_LABEL: Record<McpStatus["status"], () => string> = {
  connected: m.settings_mcp_status_connected,
  disabled: m.settings_mcp_status_disabled,
  failed: m.settings_mcp_status_failed,
  needs_auth: m.settings_mcp_status_needs_auth,
  needs_client_registration: m.settings_mcp_status_needs_client_registration,
};

interface SettingsMcpProps {
  directory?: string;
}

export function SettingsMcp({ directory }: SettingsMcpProps) {
  const server = useServer();
  const fallbackDirectory = useGlobalData((s) => s.path.directory);
  const resolved = directory ?? server.projects.last() ?? fallbackDirectory;

  if (!resolved) {
    return <ConnectedSection items={[]} ready={true} />;
  }

  return <SettingsMcpContent directory={resolved} />;
}

function SettingsMcpContent({ directory }: { directory: string }) {
  useMcpStatusSync(directory);
  const mcp = useChildData(directory, (s) => s.mcp);
  const ready = useChildData(directory, (s) => s.mcp_ready);
  const mcpMutation = useMcpMutation(directory);

  const items = useMemo(
    () =>
      Object.entries(mcp)
        .map(([name, status]) => ({ name, status }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [mcp],
  );

  const popular = useMemo(
    () => POPULAR_MCP.filter((server) => !(server.id in mcp)),
    [mcp],
  );

  const variables = mcpMutation.variables;
  const pendingName =
    mcpMutation.isPending && variables ? variables.name : undefined;
  const addPending = variables?.type === "add" ? pendingName : undefined;
  const removePending = variables?.type === "remove" ? pendingName : undefined;
  const actionPending =
    variables?.type === "enable" || variables?.type === "disable"
      ? pendingName
      : undefined;

  return (
    <div className="flex flex-col gap-6">
      <ConnectedSection
        items={items}
        ready={ready}
        actionPending={actionPending}
        removePending={removePending}
        addPending={addPending}
        authPending={
          variables?.type === "authenticate" ? pendingName : undefined
        }
        onEnable={(name) => mcpMutation.mutate({ type: "enable", name })}
        onDisable={(name) => mcpMutation.mutate({ type: "disable", name })}
        onAuthenticate={(name) =>
          mcpMutation.mutate({ type: "authenticate", name })
        }
        onRemove={(name) => mcpMutation.mutate({ type: "remove", name })}
      />
      <PopularSection
        items={popular}
        onConnect={(server) =>
          mcpMutation.mutate({
            type: "add",
            name: server.id,
            config: {
              type: "remote",
              url: server.url,
              enabled: true,
              ...(server.oauth ? { oauth: server.oauth } : {}),
            },
          })
        }
      />
    </div>
  );
}

interface ConnectedSectionProps {
  items: Array<{ name: string; status: McpStatus }>;
  ready: boolean;
  actionPending?: string;
  removePending?: string;
  addPending?: string;
  authPending?: string;
  onEnable?: (name: string) => void;
  onDisable?: (name: string) => void;
  onAuthenticate?: (name: string) => void;
  onRemove?: (name: string) => void;
}

function ConnectedSection({
  items,
  ready,
  actionPending,
  removePending,
  addPending,
  authPending,
  onEnable,
  onDisable,
  onAuthenticate,
  onRemove,
}: ConnectedSectionProps) {
  const showList = ready && items.length > 0;
  const showLoading = useDelayedShow(!ready, 150);
  return (
    <SettingsSection
      title={m.settings_mcp_section_connected()}
      bordered={showList}
    >
      {!ready && showLoading ? (
        <ConnectedLoading />
      ) : !ready || items.length === 0 ? (
        <p
          className={cn(
            "py-4 text-center text-xs text-muted-foreground",
            !ready && "invisible",
          )}
          aria-hidden={!ready || undefined}
        >
          {m.settings_mcp_connected_empty()}
        </p>
      ) : (
        items.map((item) => (
          <McpRow
            key={item.name}
            name={item.name}
            status={item.status}
            actionPending={actionPending === item.name}
            removePending={removePending === item.name}
            addPending={addPending === item.name}
            authPending={authPending === item.name}
            onEnable={() => onEnable?.(item.name)}
            onDisable={() => onDisable?.(item.name)}
            onAuthenticate={() => onAuthenticate?.(item.name)}
            onRemove={() => onRemove?.(item.name)}
          />
        ))
      )}
    </SettingsSection>
  );
}

interface PopularSectionProps {
  items: PopularMcp[];
  onConnect: (server: PopularMcp) => void;
}

function PopularSection({ items, onConnect }: PopularSectionProps) {
  const dialog = useDialog();
  const openCustom = () => dialog.show(() => <CustomMcp />);

  return (
    <SettingsSection title={m.settings_mcp_section_popular()}>
      {items.map((server) => (
        <SettingsListItem
          key={server.id}
          icon={
            <McpLogo
              src={server.logo}
              alt={`${server.name} logo`}
              className={server.logoClassName}
            />
          }
          title={server.name}
          description={server.description()}
          action={
            <ConnectButton
              onClick={() => onConnect(server)}
              ariaLabel={server.name}
            />
          }
        />
      ))}

      <SettingsListItem
        icon={
          <WandSparklesIcon className="size-5 shrink-0 text-muted-foreground" />
        }
        title={m.settings_mcp_custom_label()}
        badge={
          <Badge variant="outline">{m.dialog_provider_tag_custom()}</Badge>
        }
        description={m.settings_mcp_custom_description()}
        action={
          <ConnectButton
            onClick={openCustom}
            ariaLabel={m.settings_mcp_custom_label()}
          />
        }
      />
    </SettingsSection>
  );
}

interface ConnectButtonProps {
  onClick?: () => void;
  ariaLabel?: string;
  disabled?: boolean;
}

function ConnectButton({ onClick, ariaLabel, disabled }: ConnectButtonProps) {
  return (
    <>
      <Button
        variant="secondary"
        size="icon-sm"
        className="sm:hidden"
        disabled={disabled}
        onClick={onClick}
        aria-label={ariaLabel ?? m.settings_mcp_connect()}
      >
        <PlusIcon aria-hidden="true" />
      </Button>
      <Button
        variant="secondary"
        size="sm"
        className="hidden sm:inline-flex"
        disabled={disabled}
        onClick={onClick}
      >
        <PlusIcon data-icon="inline-start" aria-hidden="true" />
        {m.settings_mcp_connect()}
      </Button>
    </>
  );
}

interface McpRowProps {
  name: string;
  status: McpStatus;
  actionPending: boolean;
  removePending: boolean;
  addPending: boolean;
  authPending: boolean;
  onEnable: () => void;
  onDisable: () => void;
  onAuthenticate: () => void;
  onRemove: () => void;
}

function McpRow({
  name,
  status,
  actionPending,
  removePending,
  addPending,
  authPending,
  onEnable,
  onDisable,
  onAuthenticate,
  onRemove,
}: McpRowProps) {
  const isAuth = status.status === "needs_auth";
  const isError =
    status.status === "failed" || status.status === "needs_client_registration";
  const connecting =
    (addPending && status.status === "disabled") ||
    (authPending && status.status === "needs_auth") ||
    (actionPending && isError);
  const label = connecting
    ? m.settings_mcp_status_connecting()
    : STATUS_LABEL[status.status]();
  const error = isError ? status.error : undefined;
  const checked = status.status === "connected";
  const busy = actionPending || removePending || addPending || authPending;
  const badgeVariant = isError && !connecting ? "destructive" : "secondary";
  const popular = POPULAR_MCP.find((p) => p.id === name);
  const displayName = mcpServerTitle(name);

  return (
    <SettingsListItem
      icon={
        <McpLogo
          src={popular?.logo}
          alt={`${displayName} logo`}
          className={popular?.logoClassName}
        />
      }
      title={displayName}
      badge={<Badge variant={badgeVariant}>{label}</Badge>}
      description={error}
      action={
        <div className="flex items-center gap-2">
          {isAuth ? (
            <IconAction
              icon={<LogInIcon aria-hidden="true" />}
              label={m.settings_mcp_authenticate()}
              onClick={onAuthenticate}
              disabled={busy}
            />
          ) : isError ? (
            <IconAction
              icon={<RotateCcwIcon aria-hidden="true" />}
              label={m.settings_mcp_retry()}
              onClick={onEnable}
              disabled={busy}
            />
          ) : (
            <Switch
              checked={checked}
              disabled={busy}
              onCheckedChange={(next) => {
                if (busy) return;
                if (next) onEnable();
                else onDisable();
              }}
            />
          )}
          <IconAction
            icon={<Trash2Icon aria-hidden="true" />}
            label={m.settings_mcp_remove()}
            onClick={onRemove}
            disabled={busy}
          />
        </div>
      }
    />
  );
}

function ConnectedLoading() {
  return (
    <div className="space-y-2">
      <SettingsListItemSkeleton />
      <SettingsListItemSkeleton />
    </div>
  );
}
