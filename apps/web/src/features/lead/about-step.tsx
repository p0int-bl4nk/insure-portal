import {
  COUNTRIES,
  DATE_WINDOWS,
  Gender,
  GENDER_LABELS,
  MaritalStatus,
  MARITAL_STATUS_LABELS,
} from "@insure/shared";
import { Controller, useFormContext } from "react-hook-form";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { formatMobileInput } from "@/lib/utils";

import { ChoiceGroup, optionsFrom } from "./choice-group";
import { DateField } from "./date-field";
import type { LeadFormValues } from "./form";
import { TextField } from "./text-field";

type Country = (typeof COUNTRIES)[number];

const NAME_HINT = "As it appears on your passport or Emirates ID.";

export const AboutStep = () => {
  const { control } = useFormContext<LeadFormValues>();

  return (
    <FieldGroup>
      <div className="grid gap-5 md:grid-cols-3 md:items-start md:gap-x-4">
        <TextField
          name="proposer.firstName"
          label="First name"
          autoComplete="given-name"
          description={NAME_HINT}
        />
        <TextField
          name="proposer.middleName"
          label="Middle name"
          optional
          autoComplete="additional-name"
        />
        <TextField
          name="proposer.lastName"
          label="Last name"
          autoComplete="family-name"
        />
      </div>

      <div className="grid gap-5 md:grid-cols-2 md:items-start md:gap-x-4">
        <DateField
          name="proposer.dateOfBirth"
          label="Date of birth"
          window={DATE_WINDOWS.dateOfBirth}
        />

        <Controller
          control={control}
          name="proposer.nationality"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid || undefined}>
              <FieldLabel htmlFor="nationality">Nationality</FieldLabel>

              <Combobox<Country>
                items={COUNTRIES}
                value={COUNTRIES.find((c) => c.code === field.value) ?? null}
                onValueChange={(country) => field.onChange(country?.code)}
                itemToStringLabel={(country) => country.name}
                isItemEqualToValue={(a, b) => a.code === b.code}
              >
                <ComboboxInput
                  id="nationality"
                  placeholder="Search countries"
                  autoComplete="off"
                  className="h-10 w-full"
                  aria-invalid={fieldState.invalid || undefined}
                  onBlur={field.onBlur}
                />
                <ComboboxContent>
                  <ComboboxEmpty>No country found.</ComboboxEmpty>
                  <ComboboxList>
                    {(country: Country) => (
                      <ComboboxItem key={country.code} value={country}>
                        {country.name}
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>

              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Controller
          control={control}
          name="proposer.gender"
          render={({ field, fieldState }) => (
            <FieldSet
              data-invalid={fieldState.invalid || undefined}
              className="min-w-0"
            >
              <FieldLegend id="gender-legend" variant="label">
                Gender
              </FieldLegend>
              <ChoiceGroup
                aria-labelledby="gender-legend"
                options={optionsFrom(Gender, GENDER_LABELS)}
                value={field.value}
                onChange={field.onChange}
                invalid={fieldState.invalid}
              />
              <FieldError errors={[fieldState.error]} />
            </FieldSet>
          )}
        />

        <Controller
          control={control}
          name="proposer.maritalStatus"
          render={({ field, fieldState }) => (
            <FieldSet
              data-invalid={fieldState.invalid || undefined}
              className="min-w-0"
            >
              <FieldLegend id="marital-legend" variant="label">
                Marital status
              </FieldLegend>
              <ChoiceGroup
                aria-labelledby="marital-legend"
                options={optionsFrom(MaritalStatus, MARITAL_STATUS_LABELS)}
                value={field.value}
                onChange={field.onChange}
                invalid={fieldState.invalid}
              />
              <FieldError errors={[fieldState.error]} />
            </FieldSet>
          )}
        />
      </div>

      <div className="grid gap-5 md:grid-cols-2 md:items-start md:gap-x-4">
        <Controller
          control={control}
          name="proposer.mobile"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid || undefined}>
              <FieldLabel htmlFor="mobile">Mobile number</FieldLabel>

              <InputGroup className="h-10">
                <InputGroupAddon>
                  <InputGroupText>+971</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  id="mobile"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel-national"
                  placeholder="50 123 4567"
                  aria-invalid={fieldState.invalid || undefined}
                  name={field.name}
                  ref={field.ref}
                  value={field.value ?? ""}
                  onChange={(event) =>
                    field.onChange(formatMobileInput(event.target.value))
                  }
                  onBlur={field.onBlur}
                />
              </InputGroup>

              {fieldState.error ? (
                <FieldError errors={[fieldState.error]} />
              ) : (
                <FieldDescription>
                  We&apos;ll call or WhatsApp you with quotes.
                </FieldDescription>
              )}
            </Field>
          )}
        />

        <TextField
          name="proposer.email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
        />
      </div>
    </FieldGroup>
  );
};
