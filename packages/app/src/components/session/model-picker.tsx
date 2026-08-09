import { CheckIcon, SettingsIcon } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { useDialog } from "@/contexts/dialog";
import type { useLocal } from "@/contexts/local";
import { DialogSettings } from "@/components/settings/dialog-settings";
import { m } from "@/paraglide/messages";

type ModelState = ReturnType<typeof useLocal>["model"];
type ListModel = NonNullable<ModelState["current"]>;

export function ModelPicker({ model }: { model: ModelState }) {
  const dialog = useDialog();
  const [open, setOpen] = useState(false);

  const grouped = useMemo(() => {
    const groups: Record<string, ListModel[]> = {};
    for (const item of model.list) {
      if (!model.visible({ modelID: item.id, providerID: item.provider.id }))
        continue;
      const provider = item.provider.name ?? item.provider.id;
      if (!groups[provider]) groups[provider] = [];
      groups[provider].push(item);
    }
    return groups;
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
          {Object.entries(grouped).map(([provider, items]) => (
            <ModelSelectorGroup heading={provider} key={provider}>
              {items.map((item) => (
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
        <div className="flex p-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={handleManage}
          >
            <SettingsIcon data-icon="inline-start" aria-hidden="true" />
            {m.session_model_manage_link()}
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
