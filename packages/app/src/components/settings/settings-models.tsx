// @opencode-ref: opencode/packages/app/src/components/settings-models.tsx
import { SearchIcon, XIcon } from "lucide-react";

import { ModelSelectorLogo } from "@/components/ai-elements/model-selector";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Switch } from "@/components/ui/switch";
import { useModels } from "@/contexts/models";
import { type FilteredGroup, useFilteredList } from "@/hooks/use-filtered-list";
import { popularProviders } from "@/hooks/use-providers";
import { m } from "@/paraglide/messages";

type ModelItem = ReturnType<typeof useModels>["list"][number];

const FILTER_KEYS = ["provider.name", "name", "id"];
const groupByProvider = (x: ModelItem) => x.provider.id;
const sortByName = (a: ModelItem, b: ModelItem) => a.name.localeCompare(b.name);
const sortGroups = (
  a: FilteredGroup<ModelItem>,
  b: FilteredGroup<ModelItem>,
) => {
  const aIndex = popularProviders.indexOf(a.category);
  const bIndex = popularProviders.indexOf(b.category);
  const aPopular = aIndex >= 0;
  const bPopular = bIndex >= 0;
  if (aPopular && !bPopular) return -1;
  if (!aPopular && bPopular) return 1;
  if (aPopular && bPopular) return aIndex - bIndex;
  const aName = a.items[0]?.provider.name ?? "";
  const bName = b.items[0]?.provider.name ?? "";
  return aName.localeCompare(bName);
};

export function SettingsModels() {
  const models = useModels();

  const list = useFilteredList<ModelItem>({
    items: models.list,
    filterKeys: FILTER_KEYS,
    groupBy: groupByProvider,
    sortBy: sortByName,
    sortGroupsBy: sortGroups,
  });

  return (
    <>
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          placeholder={m.settings_models_search_placeholder()}
          value={list.filter}
          onChange={(e) => list.setFilter(e.target.value)}
          spellCheck={false}
          autoCorrect="off"
          autoComplete="off"
          autoCapitalize="off"
        />
        {list.filter && (
          <InputGroupAddon align="inline-end">
            <InputGroupButton
              size="icon-xs"
              aria-label={m.common_search_clear()}
              onClick={list.clear}
            >
              <XIcon aria-hidden="true" />
            </InputGroupButton>
          </InputGroupAddon>
        )}
      </InputGroup>

      <div className="flex flex-col gap-6 overflow-y-auto">
        {list.isEmpty ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <span className="text-sm text-muted-foreground">
              {m.settings_models_empty()}
            </span>
            {list.filter && (
              <span className="mt-1 text-sm font-medium">
                &ldquo;{list.filter}&rdquo;
              </span>
            )}
          </div>
        ) : (
          list.groups.map((group) => {
            const provider = group.items[0]?.provider;
            if (!provider) return null;
            return (
              <section key={group.category} className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <ModelSelectorLogo
                    provider={provider.id}
                    className="size-5 shrink-0"
                  />
                  <span className="text-sm font-medium">{provider.name}</span>
                </div>
                <div className="divide-y divide-border rounded-lg border">
                  {group.items.map((item) => {
                    const key = {
                      providerID: item.provider.id,
                      modelID: item.id,
                    };
                    return (
                      <div
                        key={`${item.provider.id}:${item.id}`}
                        className="flex items-center justify-between gap-4 px-4 py-3"
                      >
                        <span className="truncate text-sm">{item.name}</span>
                        <Switch
                          checked={models.visible(key)}
                          onCheckedChange={(checked) =>
                            models.setVisibility(key, checked)
                          }
                          aria-label={item.name}
                        />
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })
        )}
      </div>
    </>
  );
}
