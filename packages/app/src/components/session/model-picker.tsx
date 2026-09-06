import { CheckIcon, PlusIcon, SettingsIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorSeparator,
  ModelSelectorTrigger,
} from "@/components/ai-elements/model-selector";
import { PromptInputButton } from "@/components/ai-elements/prompt-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDialog } from "@/contexts/dialog";
import type { useLocal } from "@/contexts/local";
import { DialogSettings } from "@/components/settings/dialog-settings";
import { isFreeTierProvider } from "@/hooks/use-providers";
import { m } from "@/paraglide/messages";

type ModelState = ReturnType<typeof useLocal>["model"];
type ListModel = NonNullable<ModelState["current"]>;

type ProviderGroup = {
  provider: ListModel["provider"];
  items: ListModel[];
};

export function ModelPicker({ model }: { model: ModelState }) {
  const dialog = useDialog();
  const [open, setOpen] = useState(false);

  const grouped = useMemo(() => {
    const groups: Record<string, ProviderGroup> = {};
    for (const item of model.list) {
      if (!model.visible({ modelID: item.id, providerID: item.provider.id }))
        continue;
      const id = item.provider.id;
      if (!groups[id]) groups[id] = { provider: item.provider, items: [] };
      groups[id].items.push(item);
    }
    return Object.values(groups);
  }, [model]);

  const handleSelect = useCallback(
    (item: ListModel) => {
      model.set(
        { modelID: item.id, providerID: item.provider.id },
        { recent: true },
      );
      setOpen(false);
    },
    [model],
  );

  const handleManage = useCallback(() => {
    document.body.setAttribute("data-swapping", "");
    setOpen(false);
    dialog.show(() => <DialogSettings initialSection="models" />);
  }, [dialog]);

  const handleConnectProvider = useCallback(() => {
    document.body.setAttribute("data-swapping", "");
    setOpen(false);
    dialog.show(() => <DialogSettings initialSection="providers" />);
  }, [dialog]);

  return (
    <ModelSelector onOpenChange={setOpen} open={open}>
      <ModelSelectorTrigger asChild>
        <PromptInputButton className="max-w-[10rem] min-w-0 sm:max-w-[14rem]">
          {model.current && (
            <ModelSelectorLogo
              provider={model.current.provider.id}
              data-icon="inline-start"
              aria-hidden="true"
            />
          )}
          {model.current && (
            <ModelSelectorName>{model.current.name}</ModelSelectorName>
          )}
        </PromptInputButton>
      </ModelSelectorTrigger>
      <ModelSelectorContent
        className="**:data-[slot=dialog-close]:top-2.5"
        title={m.session_model_dialog_title()}
      >
        <ModelSelectorInput
          placeholder={m.session_model_search_placeholder()}
        />
        <ModelSelectorList>
          <ModelSelectorEmpty>{m.session_model_empty()}</ModelSelectorEmpty>
          {grouped.map((group) => (
            <ModelSelectorGroup
              heading={
                isFreeTierProvider(group.provider) ? (
                  <span className="inline-flex items-center gap-1.5 align-middle">
                    {m.settings_providers_free_title()}
                    <Badge
                      variant="secondary"
                      className="h-4 px-1.5 text-[10px] leading-none"
                    >
                      {m.settings_providers_tag_free()}
                    </Badge>
                  </span>
                ) : (
                  (group.provider.name ?? group.provider.id)
                )
              }
              key={group.provider.id}
            >
              {group.items.map((item) => (
                <PickerItem
                  key={`${item.provider.id}:${item.id}`}
                  item={item}
                  isSelected={
                    model.current?.provider.id === item.provider.id &&
                    model.current?.id === item.id
                  }
                  onSelect={handleSelect}
                />
              ))}
            </ModelSelectorGroup>
          ))}
        </ModelSelectorList>
        <ModelSelectorSeparator />
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 p-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="whitespace-nowrap"
            onClick={handleManage}
          >
            <SettingsIcon data-icon="inline-start" aria-hidden="true" />
            {m.session_model_manage_link()}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="whitespace-nowrap"
            onClick={handleConnectProvider}
          >
            <PlusIcon data-icon="inline-start" aria-hidden="true" />
            {m.session_model_connect_provider()}
          </Button>
        </div>
      </ModelSelectorContent>
    </ModelSelector>
  );
}

function PickerItem({
  item,
  isSelected,
  onSelect,
}: {
  item: ListModel;
  isSelected: boolean;
  onSelect: (item: ListModel) => void;
}) {
  const handleSelect = useCallback(() => {
    onSelect(item);
  }, [onSelect, item]);

  return (
    <ModelSelectorItem
      onSelect={handleSelect}
      value={`${item.provider.id}:${item.id}`}
    >
      <ModelSelectorLogo provider={item.provider.id} />
      <ModelSelectorName>{item.name}</ModelSelectorName>
      {isSelected && <CheckIcon className="ml-auto size-4" />}
    </ModelSelectorItem>
  );
}
