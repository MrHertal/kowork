import type { ReactNode } from "react";
import { useState } from "react";

import { SettingsGeneral } from "./settings-general";
import { SettingsMcp } from "./settings-mcp";
import { SettingsModels } from "./settings-models";
import { SettingsNotifications } from "./settings-notifications";
import { SettingsProviders } from "./settings-providers";
import { SettingsSkills } from "./settings-skills";
import {
  NAV_ITEMS,
  type SettingsSection,
  SettingsShell,
} from "./settings-shell";

interface DialogSettingsProps {
  initialSection?: SettingsSection;
  directory?: string;
}

export function DialogSettings({
  initialSection = "general",
  directory,
}: DialogSettingsProps = {}) {
  const [activeSection, setActiveSection] =
    useState<SettingsSection>(initialSection);

  const activeItem = NAV_ITEMS.find((item) => item.id === activeSection)!;

  const SECTION_CONTENT: Record<SettingsSection, () => ReactNode> = {
    general: () => <SettingsGeneral />,
    notifications: () => <SettingsNotifications />,
    models: () => <SettingsModels />,
    providers: () => <SettingsProviders />,
    mcp: () => <SettingsMcp directory={directory} />,
    skills: () => <SettingsSkills directory={directory} />,
  };

  return (
    <SettingsShell
      title={activeItem.name()}
      activeNavItem={activeSection}
      onNavItemClick={setActiveSection}
    >
      {SECTION_CONTENT[activeSection]()}
    </SettingsShell>
  );
}
