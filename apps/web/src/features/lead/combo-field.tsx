import { COUNTRIES, Emirate, EMIRATE_LABELS } from "@insure/shared";
import type { CountryCode } from "@insure/shared";
import type { ReactNode } from "react";
import { Controller, useFormContext } from "react-hook-form";
import type { FieldPathByValue } from "react-hook-form";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";

import { optionsFrom } from "./choice-group";
import type { Option } from "./choice-group";
import type { LeadFormValues } from "./form";

interface ComboFieldProps<T extends string> {
  name: FieldPathByValue<LeadFormValues, T | undefined>;
  label: ReactNode;
  options: readonly Option<T>[];
  placeholder: string;
  empty: string;
}

/** Searchable single choice, for lists too long for buttons. */
export const ComboField = <T extends string>({
  name,
  label,
  options,
  placeholder,
  empty,
}: ComboFieldProps<T>) => {
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
          <FieldLabel htmlFor={name}>{label}</FieldLabel>

          <Combobox<Option<T>>
            items={options}
            value={options.find((o) => o.value === field.value) ?? null}
            onValueChange={(option) => field.onChange(option?.value)}
            itemToStringLabel={(option) => option.label}
            isItemEqualToValue={(a, b) => a.value === b.value}
          >
            <ComboboxInput
              id={name}
              placeholder={placeholder}
              autoComplete="off"
              className="h-10 w-full"
              aria-invalid={fieldState.invalid || undefined}
              onBlur={field.onBlur}
            />
            <ComboboxContent>
              <ComboboxEmpty>{empty}</ComboboxEmpty>
              <ComboboxList>
                {(option: Option<T>) => (
                  <ComboboxItem key={option.value} value={option}>
                    {option.label}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>

          <FieldError errors={[fieldState.error]} />
        </Field>
      )}
    />
  );
};

const COUNTRY_OPTIONS: readonly Option<CountryCode>[] = COUNTRIES.map(
  ({ code, name }) => ({ value: code, label: name })
);

export const NationalityField = ({
  name,
}: {
  name: FieldPathByValue<LeadFormValues, CountryCode | undefined>;
}) => (
  <ComboField
    name={name}
    label="Nationality"
    options={COUNTRY_OPTIONS}
    placeholder="Search countries"
    empty="No country found."
  />
);

const EMIRATE_OPTIONS = optionsFrom(Emirate, EMIRATE_LABELS);

export const EmirateField = ({
  name,
}: {
  name: FieldPathByValue<LeadFormValues, Emirate | undefined>;
}) => (
  <ComboField
    name={name}
    label="Emirate of visa issuance"
    options={EMIRATE_OPTIONS}
    placeholder="Choose an emirate"
    empty="No emirate found."
  />
);
