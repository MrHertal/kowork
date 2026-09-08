// @opencode-ref: opencode/packages/app/src/components/settings-general.tsx
import { useEffect, useRef } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { m } from "@/paraglide/messages";
import { SOUND_IDS, SOUND_LABEL, playSoundById } from "@/utils/sound";

const OFF_VALUE = "off";

const PREVIEW_DEBOUNCE_MS = 100;

export interface SoundSelectProps {
  id?: string;
  enabled: boolean;
  soundId: string;
  onChange: (enabled: boolean, soundId: string) => void;
}

export function SoundSelect({
  id,
  enabled,
  soundId,
  onChange,
}: SoundSelectProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  const cancelPreview = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (stopRef.current) {
      stopRef.current();
      stopRef.current = null;
    }
  };

  const schedulePreview = (id: string | undefined) => {
    cancelPreview();
    if (!id) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void playSoundById(id).then((stop) => {
        if (stop) stopRef.current = stop;
      });
    }, PREVIEW_DEBOUNCE_MS);
  };

  useEffect(() => () => cancelPreview(), []);

  const value = enabled ? soundId : OFF_VALUE;

  return (
    <Select
      value={value}
      onValueChange={(next) => {
        cancelPreview();
        if (next === OFF_VALUE) {
          onChange(false, soundId);
        } else {
          onChange(true, next);
          void playSoundById(next).then((stop) => {
            if (stop) stopRef.current = stop;
          });
        }
      }}
      onOpenChange={(open) => {
        if (!open) cancelPreview();
      }}
    >
      <SelectTrigger id={id} size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem
          value={OFF_VALUE}
          onPointerEnter={() => schedulePreview(undefined)}
          onFocus={() => schedulePreview(undefined)}
        >
          {m.settings_notifications_sound_off()}
        </SelectItem>
        {SOUND_IDS.map((id) => (
          <SelectItem
            key={id}
            value={id}
            onPointerEnter={() => schedulePreview(id)}
            onFocus={() => schedulePreview(id)}
          >
            {SOUND_LABEL[id]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
