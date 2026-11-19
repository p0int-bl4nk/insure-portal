import { formatIso, toDate, todayInDubai } from "@insure/shared";
import type { DateWindow } from "@insure/shared";
import { cn } from "cn";
import type { ReactNode } from "react";
import { Controller, useFormContext } from "react-hook-form";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import type { documentsField, LeadFormValues, memberField } from "./form";

type DatePath =
  | "policy.startDate"
  | "policy.previousPolicyExpiry"
  | ReturnType<typeof memberField<"dateOfBirth">>
  | ReturnType<typeof documentsField<"emiratesIdExpiry">>;

interface DateFieldProps {
  name: DatePath;
  label: ReactNode;
  description?: ReactNode;
  /** The same window the schema validates against, e.g. DATE_WINDOWS.policyStart. */
  window: DateWindow;
}

/** Native date input; the form value is the Date it picks (a UTC midnight). */
export const DateField = ({
  name,
  label,
  description,
  window,
}: DateFieldProps) => {
  const { control } = useFormContext<LeadFormValues>();
  const { from, to } = window(todayInDubai());

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const date = toDate(field.value);

        return (
          <Field
            data-invalid={fieldState.invalid || undefined}
            className="min-w-0"
          >
            <FieldLabel htmlFor={name}>{label}</FieldLabel>

            <Input
              id={name}
              type="date"
              min={formatIso(from)}
              max={formatIso(to)}
              className={cn(
                "h-10 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:hover:opacity-100",
                // Match other inputs' placeholder colour until a date is chosen.
                !date && "text-muted-foreground"
              )}
              aria-invalid={fieldState.invalid || undefined}
              name={field.name}
              ref={field.ref}
              value={date ? formatIso(date) : ""}
              onChange={(event) =>
                field.onChange(event.target.valueAsDate ?? undefined)
              }
              onBlur={field.onBlur}
            />

            {fieldState.error ? (
              <FieldError errors={[fieldState.error]} />
            ) : (
              description && <FieldDescription>{description}</FieldDescription>
            )}
          </Field>
        );
      }}
    />
  );
};
