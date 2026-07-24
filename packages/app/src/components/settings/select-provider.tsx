import { PlusIcon, SearchIcon, XIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { ModelSelectorLogo } from "@/components/ai-elements/model-selector";
import { Badge } from "@/components/ui/badge";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { useDialog } from "@/contexts/dialog";
import { popularProviders, useProviders } from "@/hooks/use-providers";

import { m } from "@/paraglide/messages";

import { ConnectProvider } from "./connect-provider";
import { CustomProvider } from "./custom-provider";
import { DialogSettings } from "./dialog-settings";
import { getProviderNote } from "./provider-notes";
import { SettingsSection } from "./settings-row";
import type { SettingsSection as SettingsNavSection } from "./settings-shell";
import { SettingsShell } from "./settings-shell";

const CUSTOM_ID = "_custom";
const popularSet = new Set(popularProviders);

type ProviderItem = { id: string; name: string };

export function SelectProvider() {
  const dialog = useDialog();
  const providers = useProviders();

  const [search, setSearch] = useState("");

  const goBack = useCallback(() => {
    dialog.show(() => <DialogSettings initialSection="providers" />);
  }, [dialog]);

  const handleNavItemClick = useCallback(
    (id: SettingsNavSection) => {
      dialog.show(() => <DialogSettings initialSection={id} />);
    },
    [dialog],
  );

  const items = useMemo((): ProviderItem[] => {
    return [
      { id: CUSTOM_ID, name: m.dialog_provider_custom_label() },
      ...providers.all,
    ];
  }, [providers]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.id.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q),
    );
  }, [items, search]);

  const { popular, other } = useMemo(() => {
    const popular: ProviderItem[] = [];
    const other: ProviderItem[] = [];

    for (const item of filtered) {
      if (popularSet.has(item.id)) {
        popular.push(item);
      } else {
        other.push(item);
      }
    }

    popular.sort((a, b) => {
      if (popularProviders.includes(a.id) && popularProviders.includes(b.id))
        return popularProviders.indexOf(a.id) - popularProviders.indexOf(b.id);
      return a.name.localeCompare(b.name);
    });

    other.sort((a, b) => {
      if (a.id === CUSTOM_ID) return -1;
      if (b.id === CUSTOM_ID) return 1;
      return a.name.localeCompare(b.name);
    });

    return { popular, other };
  }, [filtered]);

  const handleSelect = (item: ProviderItem) => {
    if (item.id === CUSTOM_ID) {
      dialog.show(() => <CustomProvider back="providers" />);
      return;
    }
    dialog.show(() => (
      <ConnectProvider providerID={item.id} back="providers" />
    ));
  };

  const renderItem = (item: ProviderItem) => {
    const note = getProviderNote(item.id);
    const description =
      item.id === "opencode" ? m.dialog_provider_opencode_tagline() : note;
    const badge =
      item.id === CUSTOM_ID
        ? m.dialog_provider_tag_custom()
        : item.id === "opencode" || item.id === "opencode-go"
          ? m.dialog_provider_tag_recommended()
          : undefined;

    return (
      <button
        key={item.id}
        type="button"
        className="flex w-full items-center justify-between gap-4 rounded-md px-4 py-3 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
        onClick={() => handleSelect(item)}
      >
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex items-center gap-3">
            <ModelSelectorLogo
              provider={item.id === CUSTOM_ID ? "synthetic" : item.id}
              className="size-5 shrink-0"
            />
            <span className="truncate text-sm font-medium">{item.name}</span>
            {badge && <Badge variant="outline">{badge}</Badge>}
          </div>
          {description && (
            <span className="ps-8 text-xs wrap-anywhere text-muted-foreground">
              {description}
            </span>
          )}
        </div>
        <PlusIcon className="size-3.5 shrink-0 text-muted-foreground" />
      </button>
    );
  };

  return (
    <SettingsShell
      title={m.provider_connect_breadcrumb_label()}
      activeNavItem="providers"
      breadcrumbParents={[
        {
          label: m.provider_connect_breadcrumb_parent(),
          onClick: goBack,
        },
      ]}
      onNavItemClick={handleNavItemClick}
    >
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          autoFocus
          placeholder={m.dialog_provider_search_placeholder()}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          spellCheck={false}
          autoCorrect="off"
          autoComplete="off"
          autoCapitalize="off"
        />
        {search !== "" && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              aria-label={m.common_search_clear()}
              onClick={() => setSearch("")}
            >
              <XIcon aria-hidden="true" />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>

      <div className="flex flex-col gap-6 overflow-y-auto">
        {popular.length === 0 && other.length === 0 && (
          <p className="py-4 text-center text-xs text-muted-foreground">
            {m.dialog_provider_empty()}
          </p>
        )}

        {popular.length > 0 && (
          <SettingsSection
            title={m.dialog_provider_group_popular()}
            bordered={false}
          >
            {popular.map(renderItem)}
          </SettingsSection>
        )}

        {other.length > 0 && (
          <SettingsSection
            title={m.dialog_provider_group_other()}
            bordered={false}
          >
            {other.map(renderItem)}
          </SettingsSection>
        )}
      </div>
    </SettingsShell>
  );
}
