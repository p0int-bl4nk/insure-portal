import type { ComponentProps, ReactNode } from "react";
import { Controller, useFormContext } from "react-hook-form";
import type { FieldPathByValue } from "react-hook-form";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import type { LeadFormValues } from "./form";

/** Text fields, plus the numeric measurements (typed as `unknown` until parsed). */
type TextPath =
  | FieldPathByValue<LeadFormValues, string | undefined>
  | `measurements.${keyof LeadFormValues["measurements"]}`;

type TextFieldProps = {
  name: TextPath;
  label: ReactNode;
  optional?: boolean;
  description?: ReactNode;
  /** Reformats the raw input as the user types (e.g. adds date slashes). */
  format?: (raw: string) => string;
} & Omit<
  ComponentProps<typeof Input>,
  "id" | "name" | "value" | "onChange" | "onBlur" | "ref"
>;

export const TextField = ({
  name,
  label,
  optional,
  description,
  format,
  ...input
}: TextFieldProps) => {
  const { control } = useFormContext<LeadFormValues>();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field
          data-invalid={fieldState.invalid || undefined}
          className="min-w-0"
        >
          <FieldLabel htmlFor={name}>
            {label}
            {optional && (
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            )}
          </FieldLabel>

          <Input
            id={name}
            className="h-10"
            aria-invalid={fieldState.invalid || undefined}
            name={field.name}
            ref={field.ref}
            value={String(field.value ?? "")}
            onChange={(event) =>
              field.onChange(
                format ? format(event.target.value) : event.target.value
              )
            }
            onBlur={field.onBlur}
            {...input}
          />

          {fieldState.error ? (
            <FieldError errors={[fieldState.error]} />
          ) : (
            description && <FieldDescription>{description}</FieldDescription>
          )}
        </Field>
      )}
    />
  );
};
