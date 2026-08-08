import { useForm } from "@tanstack/react-form";
import { PlusIcon, TrashIcon, WandSparklesIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { useDialog } from "@/contexts/dialog";
import { useGlobalSDK } from "@/contexts/global-sdk";
import { useGlobalData, useGlobalSync } from "@/contexts/global-sync";
import { usePlatform } from "@/contexts/platform";
import { useProviders } from "@/hooks/use-providers";
import { m } from "@/paraglide/messages";

import {
  buildResult,
  formSchema,
  initialValues,
  providerIDAvailableRefine,
} from "./custom-provider-form";
import { DialogSettings } from "./dialog-settings";
import { EntryInput, isFieldInvalid, TextField } from "./form-helpers";
import { SelectProvider } from "./select-provider";
import type { SettingsSection } from "./settings-shell";
import { SettingsShell } from "./settings-shell";

export function CustomProvider({ back }: { back?: "providers" | "settings" }) {
  const dialog = useDialog();
  const platform = usePlatform();
  const globalSDK = useGlobalSDK();
  const globalSync = useGlobalSync();
  const providers = useProviders();
  const config = useGlobalData((s) => s.config);

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

  const disabledProviders = useMemo(
    () => config.disabled_providers ?? [],
    [config.disabled_providers],
  );
  const existingProviderIDs = useMemo(
    () => new Set(providers.all.map((p) => p.id)),
    [providers.all],
  );

  const schema = useMemo(
    () =>
      formSchema.superRefine(
        providerIDAvailableRefine(existingProviderIDs, disabledProviders),
      ),
    [existingProviderIDs, disabledProviders],
  );

  const [submitAttempted, setSubmitAttempted] = useState(false);

  const form = useForm({
    defaultValues: initialValues,
    validators: { onSubmit: schema, onChange: schema },
    onSubmitInvalid: () => setSubmitAttempted(true),
    onSubmit: async ({ value }) => {
      const result = buildResult(value);

      try {
        const nextDisabled = disabledProviders.filter(
          (id) => id !== result.providerID,
        );

        if (result.key) {
          await globalSDK.client.auth.set({
            providerID: result.providerID,
            auth: { type: "api", key: result.key },
          });
        }

        await globalSync.updateConfig({
          provider: { [result.providerID]: result.config },
          disabled_providers: nextDisabled,
        });

        dialog.close();
        toast.success(
          m.provider_connect_toast_connected_title({ provider: result.name }),
          {
            description: m.provider_connect_toast_connected_description({
              provider: result.name,
            }),
          },
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        toast.error(m.common_requestFailed(), { description: message });
        throw err;
      }
    },
  });

  return (
    <SettingsShell
      title={m.provider_custom_breadcrumb_label()}
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
        <WandSparklesIcon className="size-5 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium">{m.provider_custom_title()}</span>
      </div>

      <p className="text-sm text-muted-foreground">
        {m.provider_custom_description_prefix()}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            platform.openLink(
              "https://opencode.ai/docs/providers/#custom-provider",
            );
          }}
          className="underline underline-offset-3 hover:text-foreground"
        >
          {m.provider_custom_description_link()}
        </a>
        {m.provider_custom_description_suffix()}
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void form.handleSubmit();
        }}
      >
        <FieldGroup className="gap-6">
          <form.Field name="providerID">
            {(field) => {
              const invalid = isFieldInvalid(field, submitAttempted);
              return (
                <TextField
                  id={field.name}
                  label={m.provider_custom_field_providerID_label()}
                  placeholder={m.provider_custom_field_providerID_placeholder()}
                  description={m.provider_custom_field_providerID_description()}
                  value={field.state.value}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                  invalid={invalid}
                  errors={field.state.meta.errors}
                  autoFocus
                />
              );
            }}
          </form.Field>

          <form.Field name="name">
            {(field) => {
              const invalid = isFieldInvalid(field, submitAttempted);
              return (
                <TextField
                  id={field.name}
                  label={m.provider_custom_field_name_label()}
                  placeholder={m.provider_custom_field_name_placeholder()}
                  value={field.state.value}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                  invalid={invalid}
                  errors={field.state.meta.errors}
                />
              );
            }}
          </form.Field>

          <form.Field name="baseURL">
            {(field) => {
              const invalid = isFieldInvalid(field, submitAttempted);
              return (
                <TextField
                  id={field.name}
                  label={m.provider_custom_field_baseURL_label()}
                  placeholder={m.provider_custom_field_baseURL_placeholder()}
                  value={field.state.value}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                  invalid={invalid}
                  errors={field.state.meta.errors}
                />
              );
            }}
          </form.Field>

          <form.Field name="apiKey">
            {(field) => (
              <TextField
                id={field.name}
                type="password"
                label={m.provider_custom_field_apiKey_label()}
                placeholder={m.provider_custom_field_apiKey_placeholder()}
                description={m.provider_custom_field_apiKey_description()}
                value={field.state.value}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
                invalid={isFieldInvalid(field, submitAttempted)}
                errors={field.state.meta.errors}
              />
            )}
          </form.Field>

          <form.Field name="models" mode="array">
            {(arrayField) => (
              <FieldSet className="gap-3">
                <FieldLegend variant="label">
                  {m.provider_custom_models_label()}
                </FieldLegend>
                {arrayField.state.value.map((_, i) => (
                  <Field
                    key={i}
                    orientation="horizontal"
                    className="items-start"
                  >
                    <form.Field name={`models[${i}].id`}>
                      {(field) => (
                        <EntryInput
                          placeholder={m.provider_custom_models_id_placeholder()}
                          value={field.state.value}
                          onChange={field.handleChange}
                          onBlur={field.handleBlur}
                          invalid={isFieldInvalid(field, submitAttempted)}
                          errors={field.state.meta.errors}
                        />
                      )}
                    </form.Field>
                    <form.Field name={`models[${i}].name`}>
                      {(field) => (
                        <EntryInput
                          placeholder={m.provider_custom_models_name_placeholder()}
                          value={field.state.value}
                          onChange={field.handleChange}
                          onBlur={field.handleBlur}
                          invalid={isFieldInvalid(field, submitAttempted)}
                          errors={field.state.meta.errors}
                        />
                      )}
                    </form.Field>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => arrayField.removeValue(i)}
                      disabled={arrayField.state.value.length <= 1}
                      aria-label={m.provider_custom_models_remove()}
                    >
                      <TrashIcon className="size-4" aria-hidden="true" />
                    </Button>
                  </Field>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="self-start"
                  onClick={() => arrayField.pushValue({ id: "", name: "" })}
                >
                  <PlusIcon
                    data-icon="inline-start"
                    className="size-4"
                    aria-hidden="true"
                  />
                  {m.provider_custom_models_add()}
                </Button>
              </FieldSet>
            )}
          </form.Field>

          <form.Field name="headers" mode="array">
            {(arrayField) => (
              <FieldSet className="gap-3">
                <FieldLegend variant="label">
                  {m.provider_custom_headers_label()}
                </FieldLegend>
                {arrayField.state.value.map((_, i) => (
                  <Field
                    key={i}
                    orientation="horizontal"
                    className="items-start"
                  >
                    <form.Field name={`headers[${i}].key`}>
                      {(field) => (
                        <EntryInput
                          placeholder={m.provider_custom_headers_key_placeholder()}
                          value={field.state.value}
                          onChange={field.handleChange}
                          onBlur={field.handleBlur}
                          invalid={isFieldInvalid(field, submitAttempted)}
                          errors={field.state.meta.errors}
                        />
                      )}
                    </form.Field>
                    <form.Field name={`headers[${i}].value`}>
                      {(field) => (
                        <EntryInput
                          placeholder={m.provider_custom_headers_value_placeholder()}
                          value={field.state.value}
                          onChange={field.handleChange}
                          onBlur={field.handleBlur}
                          invalid={isFieldInvalid(field, submitAttempted)}
                          errors={field.state.meta.errors}
                        />
                      )}
                    </form.Field>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => arrayField.removeValue(i)}
                      disabled={arrayField.state.value.length <= 1}
                      aria-label={m.provider_custom_headers_remove()}
                    >
                      <TrashIcon className="size-4" aria-hidden="true" />
                    </Button>
                  </Field>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="self-start"
                  onClick={() => arrayField.pushValue({ key: "", value: "" })}
                >
                  <PlusIcon
                    data-icon="inline-start"
                    className="size-4"
                    aria-hidden="true"
                  />
                  {m.provider_custom_headers_add()}
                </Button>
              </FieldSet>
            )}
          </form.Field>

          <form.Subscribe selector={(s) => s.isSubmitting}>
            {(isSubmitting) => (
              <Button
                type="submit"
                className="self-start"
                disabled={isSubmitting}
              >
                {isSubmitting ? m.provider_custom_saving() : m.common_submit()}
              </Button>
            )}
          </form.Subscribe>
        </FieldGroup>
      </form>
    </SettingsShell>
  );
}
