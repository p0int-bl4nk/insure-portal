import { formatIso, toDate, todayInDubai } from "@insure/shared";
import type { DateWindow } from "@insure/shared";
import { CalendarBlankIcon } from "@phosphor-icons/react";
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

import { describedBy, errorId } from "./form";
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

            <div className="relative">
              <Input
                id={name}
                type="date"
                min={formatIso(from)}
                max={formatIso(to)}
                className={cn(
                  // iOS Safari draws its own control: it ignores the height,
                  // sizes the width to its content, centres the value and shows
                  // no calendar icon. Drop the native look so it matches the
                  // other inputs, and draw the icon ourselves.
                  "relative h-10 appearance-none pr-9 text-left",
                  "[&::-webkit-date-and-time-value]:m-0 [&::-webkit-date-and-time-value]:min-h-[1.5em] [&::-webkit-date-and-time-value]:text-left",
                  // Chrome/Edge: the native picker button sits under our icon
                  // and gets the same focus box as the dropdown's chevron.
                  "[&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:top-1/2 [&::-webkit-calendar-picker-indicator]:right-[5px] [&::-webkit-calendar-picker-indicator]:m-0 [&::-webkit-calendar-picker-indicator]:box-border [&::-webkit-calendar-picker-indicator]:size-6 [&::-webkit-calendar-picker-indicator]:-translate-y-1/2 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:border [&::-webkit-calendar-picker-indicator]:border-transparent [&::-webkit-calendar-picker-indicator]:bg-none [&::-webkit-calendar-picker-indicator]:p-0",
                  "[&::-webkit-calendar-picker-indicator:focus-visible]:border-ring [&::-webkit-calendar-picker-indicator:focus-visible]:ring-ring/50 [&::-webkit-calendar-picker-indicator:focus-visible]:ring-1",
                  "focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-1",
                  // Match other inputs' placeholder colour until a date is chosen.
                  !date && "text-muted-foreground"
                )}
                aria-invalid={fieldState.invalid || undefined}
                aria-describedby={describedBy(
                  name,
                  fieldState.invalid,
                  description ? `${name}-hint` : undefined
                )}
                name={field.name}
                ref={field.ref}
                value={date ? formatIso(date) : ""}
                onChange={(event) =>
                  field.onChange(event.target.valueAsDate ?? undefined)
                }
                onBlur={field.onBlur}
                onClick={(event) => event.currentTarget.showPicker()}
              />
              {/* Firefox shows its own calendar button. */}
              <CalendarBlankIcon
                aria-hidden="true"
                className="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 supports-[-moz-appearance:none]:hidden"
              />
            </div>

            {fieldState.error ? (
              <FieldError id={errorId(name)} errors={[fieldState.error]} />
            ) : (
              description && (
                <FieldDescription id={`${name}-hint`}>
                  {description}
                </FieldDescription>
              )
            )}
          </Field>
        );
      }}
    />
  );
};
