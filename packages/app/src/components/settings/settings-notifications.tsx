// @opencode-ref: opencode/packages/app/src/components/settings-general.tsx
import { BellIcon, Volume2Icon } from "lucide-react";
import { type ReactNode, useId } from "react";

import { Switch } from "@/components/ui/switch";
import { useSettings } from "@/contexts/settings";
import { m } from "@/paraglide/messages";

import { SettingsRow, SettingsSection } from "./settings-row";
import { SoundSelect } from "./sound-select";

interface NotificationRowProps {
  title: ReactNode;
  description: ReactNode;
  notify: boolean;
  onNotifyChange: (value: boolean) => void;
  soundEnabled: boolean;
  soundId: string;
  onSoundChange: (enabled: boolean, soundId: string) => void;
}

function NotificationRow({
  title,
  description,
  notify,
  onNotifyChange,
  soundEnabled,
  soundId,
  onSoundChange,
}: NotificationRowProps) {
  const soundSelectId = useId();
  return (
    <SettingsRow title={title} description={description} orientation="vertical">
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-muted-foreground">
          <BellIcon className="size-4" />
          <span className="sr-only">
            {m.settings_notifications_notify_label()}
          </span>
          <Switch checked={notify} onCheckedChange={onNotifyChange} />
        </label>
        <div className="flex items-center gap-2 text-muted-foreground">
          <label htmlFor={soundSelectId} className="flex items-center">
            <Volume2Icon className="size-4" />
            <span className="sr-only">
              {m.settings_notifications_sound_label()}
            </span>
          </label>
          <SoundSelect
            id={soundSelectId}
            enabled={soundEnabled}
            soundId={soundId}
            onChange={onSoundChange}
          />
        </div>
      </div>
    </SettingsRow>
  );
}

export function SettingsNotifications() {
  const { notifications, sounds } = useSettings();

  return (
    <div className="flex flex-col gap-6">
      <SettingsSection>
        <NotificationRow
          title={m.settings_notifications_agent_title()}
          description={m.settings_notifications_agent_description()}
          notify={notifications.agent}
          onNotifyChange={notifications.setAgent}
          soundEnabled={sounds.agentEnabled}
          soundId={sounds.agent}
          onSoundChange={(enabled, id) => {
            sounds.setAgentEnabled(enabled);
            if (enabled) sounds.setAgent(id);
          }}
        />
        <NotificationRow
          title={m.settings_notifications_permissions_title()}
          description={m.settings_notifications_permissions_description()}
          notify={notifications.permissions}
          onNotifyChange={notifications.setPermissions}
          soundEnabled={sounds.permissionsEnabled}
          soundId={sounds.permissions}
          onSoundChange={(enabled, id) => {
            sounds.setPermissionsEnabled(enabled);
            if (enabled) sounds.setPermissions(id);
          }}
        />
        <NotificationRow
          title={m.settings_notifications_errors_title()}
          description={m.settings_notifications_errors_description()}
          notify={notifications.errors}
          onNotifyChange={notifications.setErrors}
          soundEnabled={sounds.errorsEnabled}
          soundId={sounds.errors}
          onSoundChange={(enabled, id) => {
            sounds.setErrorsEnabled(enabled);
            if (enabled) sounds.setErrors(id);
          }}
        />
      </SettingsSection>
    </div>
  );
}
