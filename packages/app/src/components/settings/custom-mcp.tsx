import { useForm } from "@tanstack/react-form";
import { PlusIcon, TrashIcon, WandSparklesIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useDialog } from "@/contexts/dialog";
import {
  shallowArrayEqual,
  useChildData,
  useGlobalData,
} from "@/contexts/global-sync";
import { usePlatform } from "@/contexts/platform";
import { useServer } from "@/contexts/server";
import { useMcpMutation } from "@/hooks/use-mcp-mutation";
import { m } from "@/paraglide/messages";

import {
  buildResult,
  formSchema,
  type FormValues,
  initialValues,
  nameAvailableRefine,
} from "./custom-mcp-form";
import { DialogSettings } from "./dialog-settings";
import { EntryInput, isFieldInvalid, TextField } from "./form-helpers";
import type { SettingsSection } from "./settings-shell";
import { SettingsShell } from "./settings-shell";

export function CustomMcp() {
  const dialog = useDialog();
  const platform = usePlatform();
  const server = useServer();
  const fallbackDirectory = useGlobalData((s) => s.path.directory);
  const directory = server.projects.last() ?? fallbackDirectory;

  const goBack = useCallback(() => {
    dialog.show(() => <DialogSettings initialSection="mcp" />);
  }, [dialog]);

  const handleNavItemClick = useCallback(
    (id: SettingsSection) => {
      dialog.show(() => <DialogSettings initialSection={id} />);
    },
    [dialog],
  );

  return (
    <SettingsShell
      title={m.settings_mcp_custom_breadcrumb_label()}
      activeNavItem="mcp"
      breadcrumbParents={[
        {
          label: m.settings_mcp_navItem(),
          onClick: goBack,
        },
      ]}
      onNavItemClick={handleNavItemClick}
    >
      <div className="flex items-center gap-3">
        <WandSparklesIcon className="size-5 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium">
          {m.settings_mcp_custom_title()}
        </span>
      </div>

      <p className="text-sm text-muted-foreground">
        {m.settings_mcp_custom_description_prefix()}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            platform.openLink("https://opencode.ai/docs/mcp-servers/");
          }}
          className="underline underline-offset-3 hover:text-foreground"
        >
          {m.settings_mcp_custom_description_link()}
        </a>
        {m.settings_mcp_custom_description_suffix()}
      </p>

      {directory ? (
        <CustomMcpForm directory={directory} />
      ) : (
        <p className="text-sm text-muted-foreground">
          {m.settings_mcp_connected_empty()}
        </p>
      )}
    </SettingsShell>
  );
}

function CustomMcpForm({ directory }: { directory: string }) {
  const dialog = useDialog();
  const existingNames = useChildData(
    directory,
    (s) => Object.keys(s.mcp),
    shallowArrayEqual,
  );
  const mcpMutation = useMcpMutation(directory);

  const schema = useMemo(
    () => formSchema.superRefine(nameAvailableRefine(new Set(existingNames))),
    [existingNames],
  );

  const [submitAttempted, setSubmitAttempted] = useState(false);

  const form = useForm({
    defaultValues: initialValues,
    validators: { onSubmit: schema, onChange: schema },
    onSubmitInvalid: () => setSubmitAttempted(true),
    onSubmit: async ({ value }) => {
      const result = buildResult(value);
      await new Promise<void>((resolve, reject) => {
        mcpMutation.mutate(
          { type: "add", name: result.name, config: result.config },
          {
            onSuccess: () => {
              dialog.show(() => <DialogSettings initialSection="mcp" />);
              resolve();
            },
            onError: (err) => reject(err),
          },
        );
      });
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
    >
      <FieldGroup className="gap-6">
        <form.Field name="type">
          {(field) => (
            <FieldSet>
              <FieldLegend variant="label">
                {m.settings_mcp_custom_type_label()}
              </FieldLegend>
              <RadioGroup
                value={field.state.value}
                onValueChange={(v) => {
                  field.handleChange(v as FormValues["type"]);
                  setSubmitAttempted(false);
                }}
              >
                <TypeOption
                  value="remote"
                  label={m.settings_mcp_custom_type_remote()}
                  description={m.settings_mcp_custom_type_remote_description()}
                />
                <TypeOption
                  value="local"
                  label={m.settings_mcp_custom_type_local()}
                  description={m.settings_mcp_custom_type_local_description()}
                />
              </RadioGroup>
            </FieldSet>
          )}
        </form.Field>

        <form.Field name="name">
          {(field) => {
            const invalid = isFieldInvalid(field, submitAttempted);
            return (
              <TextField
                id={field.name}
                label={m.settings_mcp_custom_field_name_label()}
                placeholder={m.settings_mcp_custom_field_name_placeholder()}
                description={m.settings_mcp_custom_field_name_description()}
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

        <form.Subscribe selector={(s) => s.values.type}>
          {(type) =>
            type === "remote" ? (
              <>
                <form.Field name="url">
                  {(field) => {
                    const invalid = isFieldInvalid(field, submitAttempted);
                    return (
                      <TextField
                        id={field.name}
                        label={m.settings_mcp_custom_field_url_label()}
                        placeholder={m.settings_mcp_custom_field_url_placeholder()}
                        value={field.state.value}
                        onChange={field.handleChange}
                        onBlur={field.handleBlur}
                        invalid={invalid}
                        errors={field.state.meta.errors}
                      />
                    );
                  }}
                </form.Field>
                <form.Field name="headers" mode="array">
                  {(arrayField) => (
                    <FieldSet className="gap-3">
                      <FieldLegend variant="label">
                        {m.settings_mcp_custom_headers_label()}
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
                                placeholder={m.settings_mcp_custom_headers_key_placeholder()}
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
                                placeholder={m.settings_mcp_custom_headers_value_placeholder()}
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
                            aria-label={m.settings_mcp_custom_headers_remove()}
                          >
                            <TrashIcon className="size-4" />
                          </Button>
                        </Field>
                      ))}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="self-start"
                        onClick={() =>
                          arrayField.pushValue({ key: "", value: "" })
                        }
                      >
                        <PlusIcon className="size-4" />
                        {m.settings_mcp_custom_headers_add()}
                      </Button>
                    </FieldSet>
                  )}
                </form.Field>
              </>
            ) : (
              <>
                <form.Field name="command">
                  {(field) => {
                    const invalid = isFieldInvalid(field, submitAttempted);
                    return (
                      <TextField
                        id={field.name}
                        label={m.settings_mcp_custom_field_command_label()}
                        placeholder={m.settings_mcp_custom_field_command_placeholder()}
                        description={m.settings_mcp_custom_field_command_description()}
                        value={field.state.value}
                        onChange={field.handleChange}
                        onBlur={field.handleBlur}
                        invalid={invalid}
                        errors={field.state.meta.errors}
                      />
                    );
                  }}
                </form.Field>
                <form.Field name="environment" mode="array">
                  {(arrayField) => (
                    <FieldSet className="gap-3">
                      <FieldLegend variant="label">
                        {m.settings_mcp_custom_environment_label()}
                      </FieldLegend>
                      {arrayField.state.value.map((_, i) => (
                        <Field
                          key={i}
                          orientation="horizontal"
                          className="items-start"
                        >
                          <form.Field name={`environment[${i}].key`}>
                            {(field) => (
                              <EntryInput
                                placeholder={m.settings_mcp_custom_environment_key_placeholder()}
                                value={field.state.value}
                                onChange={field.handleChange}
                                onBlur={field.handleBlur}
                                invalid={isFieldInvalid(field, submitAttempted)}
                                errors={field.state.meta.errors}
                              />
                            )}
                          </form.Field>
                          <form.Field name={`environment[${i}].value`}>
                            {(field) => (
                              <EntryInput
                                placeholder={m.settings_mcp_custom_environment_value_placeholder()}
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
                            aria-label={m.settings_mcp_custom_environment_remove()}
                          >
                            <TrashIcon className="size-4" />
                          </Button>
                        </Field>
                      ))}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="self-start"
                        onClick={() =>
                          arrayField.pushValue({ key: "", value: "" })
                        }
                      >
                        <PlusIcon className="size-4" />
                        {m.settings_mcp_custom_environment_add()}
                      </Button>
                    </FieldSet>
                  )}
                </form.Field>
              </>
            )
          }
        </form.Subscribe>

        <form.Subscribe selector={(s) => s.isSubmitting}>
          {(isSubmitting) => (
            <Button
              type="submit"
              className="self-start"
              disabled={isSubmitting}
            >
              {isSubmitting
                ? m.settings_mcp_custom_saving()
                : m.common_submit()}
            </Button>
          )}
        </form.Subscribe>
      </FieldGroup>
    </form>
  );
}

function TypeOption({
  value,
  label,
  description,
}: {
  value: string;
  label: string;
  description: string;
}) {
  const id = `mcp-type-${value}`;
  return (
    <Field orientation="horizontal">
      <RadioGroupItem value={value} id={id} />
      <FieldContent>
        <FieldLabel htmlFor={id} className="font-normal">
          {label}
        </FieldLabel>
        <FieldDescription>{description}</FieldDescription>
      </FieldContent>
    </Field>
  );
}
