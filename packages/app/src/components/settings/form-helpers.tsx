import type { AnyFieldApi } from "@tanstack/react-form";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

// Show errors after the user has actually engaged with the field
// (blurred AND dirty), or after a failed submit. Matches react-hook-form's
// "onTouched" pattern.
export function isFieldInvalid(
  field: AnyFieldApi,
  submitAttempted: boolean,
): boolean {
  const meta = field.state.meta;
  return ((meta.isBlurred && meta.isDirty) || submitAttempted) && !meta.isValid;
}

export type FieldErrors = Array<{ message?: string } | undefined>;

export function TextField({
  id,
  label,
  placeholder,
  description,
  value,
  onChange,
  onBlur,
  invalid,
  errors,
  autoFocus,
  type = "text",
}: {
  id: string;
  label: string;
  placeholder: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  invalid: boolean;
  errors: FieldErrors;
  autoFocus?: boolean;
  type?: "text" | "password";
}) {
  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        name={id}
        type={type}
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={value}
        onBlur={onBlur}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid}
      />
      {invalid ? (
        <FieldError errors={errors} />
      ) : description ? (
        <FieldDescription>{description}</FieldDescription>
      ) : null}
    </Field>
  );
}

export function EntryInput({
  placeholder,
  value,
  onChange,
  onBlur,
  invalid,
  errors,
}: {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  invalid: boolean;
  errors: FieldErrors;
}) {
  return (
    <div className="flex flex-1 flex-col gap-3">
      <Input
        placeholder={placeholder}
        value={value}
        onBlur={onBlur}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid}
      />
      {invalid && <FieldError errors={errors} />}
    </div>
  );
}
