import { useForm } from "@tanstack/react-form";
import { FolderIcon, WandSparklesIcon } from "lucide-react";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useDialog } from "@/contexts/dialog";
import { useGlobalData } from "@/contexts/global-sync";
import { usePlatform } from "@/contexts/platform";
import { useServer } from "@/contexts/server";
import { useSkillsMutation } from "@/hooks/use-skills-mutation";
import { m } from "@/paraglide/messages";

import {
  buildResult,
  formSchema,
  type FormValues,
  initialValues,
} from "./custom-skill-form";
import { DialogSettings } from "./dialog-settings";
import { isFieldInvalid, TextField } from "./form-helpers";
import type { SettingsSection } from "./settings-shell";
import { SettingsShell } from "./settings-shell";

export function CustomSkill() {
  const dialog = useDialog();
  const server = useServer();
  const fallbackDirectory = useGlobalData((s) => s.path.directory);
  const directory = server.projects.last() ?? fallbackDirectory;

  const goBack = useCallback(() => {
    dialog.show(() => <DialogSettings initialSection="skills" />);
  }, [dialog]);

  const handleNavItemClick = useCallback(
    (id: SettingsSection) => {
      dialog.show(() => <DialogSettings initialSection={id} />);
    },
    [dialog],
  );

  return (
    <SettingsShell
      title={m.settings_skills_custom_breadcrumb_label()}
      activeNavItem="skills"
      breadcrumbParents={[
        {
          label: m.settings_skills_navItem(),
          onClick: goBack,
        },
      ]}
      onNavItemClick={handleNavItemClick}
    >
      <div className="flex items-center gap-3">
        <WandSparklesIcon className="size-5 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium">
          {m.settings_skills_custom_title()}
        </span>
      </div>

      <p className="text-sm text-muted-foreground">
        {m.settings_skills_custom_description()}
      </p>

      {directory ? (
        <CustomSkillForm directory={directory} />
      ) : (
        <p className="text-sm text-muted-foreground">
          {m.settings_skills_connected_empty()}
        </p>
      )}
    </SettingsShell>
  );
}

function CustomSkillForm({ directory }: { directory: string }) {
  const dialog = useDialog();
  const skillsMutation = useSkillsMutation(directory);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const form = useForm({
    defaultValues: initialValues,
    validators: { onSubmit: formSchema, onChange: formSchema },
    onSubmitInvalid: () => setSubmitAttempted(true),
    onSubmit: async ({ value }) => {
      const result = buildResult(value);
      const input =
        result.type === "local"
          ? ({ type: "add-folder", folder: result.folder } as const)
          : ({ type: "add-url", url: result.url } as const);
      await new Promise<void>((resolve, reject) => {
        skillsMutation.mutate(input, {
          onSuccess: () => {
            dialog.show(() => <DialogSettings initialSection="skills" />);
            resolve();
          },
          onError: (err) => reject(err),
        });
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
                {m.settings_skills_custom_type_label()}
              </FieldLegend>
              <RadioGroup
                value={field.state.value}
                onValueChange={(v) => {
                  field.handleChange(v as FormValues["type"]);
                  setSubmitAttempted(false);
                }}
              >
                <TypeOption
                  value="local"
                  label={m.settings_skills_custom_type_local()}
                  description={m.settings_skills_custom_type_local_description()}
                />
                <TypeOption
                  value="remote"
                  label={m.settings_skills_custom_type_remote()}
                  description={m.settings_skills_custom_type_remote_description()}
                />
              </RadioGroup>
            </FieldSet>
          )}
        </form.Field>

        <form.Subscribe selector={(s) => s.values.type}>
          {(type) =>
            type === "local" ? (
              <form.Field name="folder">
                {(field) => (
                  <FolderField
                    value={field.state.value}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                    invalid={isFieldInvalid(field, submitAttempted)}
                    errors={field.state.meta.errors}
                  />
                )}
              </form.Field>
            ) : (
              <form.Field name="url">
                {(field) => (
                  <TextField
                    id={field.name}
                    label={m.settings_skills_custom_field_url_label()}
                    placeholder={m.settings_skills_custom_field_url_placeholder()}
                    value={field.state.value}
                    onChange={field.handleChange}
                    onBlur={field.handleBlur}
                    invalid={isFieldInvalid(field, submitAttempted)}
                    errors={field.state.meta.errors}
                  />
                )}
              </form.Field>
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
                ? m.settings_skills_custom_saving()
                : m.common_submit()}
            </Button>
          )}
        </form.Subscribe>
      </FieldGroup>
    </form>
  );
}

interface FolderFieldProps {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  invalid: boolean;
  errors: Array<{ message?: string } | undefined>;
}

function FolderField({
  value,
  onChange,
  onBlur,
  invalid,
  errors,
}: FolderFieldProps) {
  const platform = usePlatform();

  const handlePick = useCallback(async () => {
    if (!platform.openDirectoryPickerDialog) return;
    const picked = await platform.openDirectoryPickerDialog({
      title: m.settings_skills_custom_field_folder_pickerTitle(),
    });
    if (typeof picked === "string") {
      onChange(picked);
    }
    onBlur();
  }, [platform, onChange, onBlur]);

  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor="skill-folder">
        {m.settings_skills_custom_field_folder_label()}
      </FieldLabel>
      <div className="flex items-center gap-3">
        <Button
          id="skill-folder"
          type="button"
          variant="secondary"
          size="sm"
          onClick={handlePick}
        >
          <FolderIcon />
          {value
            ? m.settings_skills_custom_field_folder_change()
            : m.settings_skills_custom_field_folder_choose()}
        </Button>
        {value && (
          <span className="truncate text-xs text-muted-foreground">
            {value}
          </span>
        )}
      </div>
      {invalid ? (
        <FieldError errors={errors} />
      ) : (
        <FieldDescription>
          {m.settings_skills_custom_field_folder_description()}
        </FieldDescription>
      )}
    </Field>
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
  const id = `skill-type-${value}`;
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
