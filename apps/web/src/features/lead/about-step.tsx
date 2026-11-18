import {
  COUNTRIES,
  Emirate,
  EMIRATE_LABELS,
  Gender,
  GENDER_LABELS,
  MaritalStatus,
  MARITAL_STATUS_LABELS,
  SalaryBand,
  SALARY_BAND_LABELS,
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
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";

import { ChoiceGroup } from "./choice-group";
import { formatMobileInput } from "./form";
import type { LeadFormValues } from "./form";

/** Choice options from an option object, in declaration order. */
const options = <T extends string>(
  values: Record<string, T>,
  labels: Record<T, string>
) => Object.values(values).map((value) => ({ value, label: labels[value] }));

type Country = (typeof COUNTRIES)[number];

export const AboutStep = () => {
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<LeadFormValues>();
  const e = errors.proposer;
  const mobileField = register("proposer.mobile");

  return (
    <FieldGroup>
      <div className="grid gap-5 md:grid-cols-2 md:items-start md:gap-x-4">
        <Field data-invalid={!!e?.fullName || undefined}>
          <FieldLabel htmlFor="fullName">Full name</FieldLabel>
          <Input
            id="fullName"
            autoComplete="name"
            className="h-10"
            aria-invalid={!!e?.fullName || undefined}
            {...register("proposer.fullName")}
          />
          <FieldError errors={[e?.fullName]} />
        </Field>

        <Field data-invalid={!!e?.mobile || undefined}>
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
              aria-invalid={!!e?.mobile || undefined}
              {...mobileField}
              onChange={(event) => {
                event.target.value = formatMobileInput(event.target.value);
                return mobileField.onChange(event);
              }}
            />
          </InputGroup>
          {e?.mobile ? (
            <FieldError errors={[e.mobile]} />
          ) : (
            <FieldDescription>
              UAE mobile starting with 5. We&apos;ll call or WhatsApp you with
              quotes.
            </FieldDescription>
          )}
        </Field>
      </div>

      <div className="grid gap-5 md:grid-cols-2 md:items-start md:gap-x-4">
        <Field data-invalid={!!e?.email || undefined}>
          <FieldLabel htmlFor="email">
            Email{" "}
            <span className="text-muted-foreground font-normal">
              (optional)
            </span>
          </FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            className="h-10"
            aria-invalid={!!e?.email || undefined}
            {...register("proposer.email")}
          />
          <FieldError errors={[e?.email]} />
        </Field>

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

      <Controller
        control={control}
        name="proposer.emirate"
        render={({ field, fieldState }) => (
          <FieldSet data-invalid={fieldState.invalid || undefined}>
            <FieldLegend id="emirate-legend" variant="label">
              Emirate that issued your visa
            </FieldLegend>
            <ChoiceGroup
              aria-labelledby="emirate-legend"
              options={options(Emirate, EMIRATE_LABELS)}
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
        name="proposer.salaryBand"
        render={({ field, fieldState }) => (
          <FieldSet data-invalid={fieldState.invalid || undefined}>
            <FieldLegend id="salary-legend" variant="label">
              Monthly salary
            </FieldLegend>
            <ChoiceGroup
              aria-labelledby="salary-legend"
              options={options(SalaryBand, SALARY_BAND_LABELS)}
              value={field.value}
              onChange={field.onChange}
              invalid={fieldState.invalid}
            />
            <FieldError errors={[fieldState.error]} />
          </FieldSet>
        )}
      />

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
                options={options(Gender, GENDER_LABELS)}
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
                options={options(MaritalStatus, MARITAL_STATUS_LABELS)}
                value={field.value}
                onChange={field.onChange}
                invalid={fieldState.invalid}
              />
              <FieldError errors={[fieldState.error]} />
            </FieldSet>
          )}
        />
      </div>
    </FieldGroup>
  );
};
