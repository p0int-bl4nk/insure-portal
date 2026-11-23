import {
  Category,
  INCOME_RANGE_LABELS,
  IncomeRange,
  Occupation,
  OCCUPATION_LABELS,
} from "@insure/shared";
import { Controller, useFormContext, useWatch } from "react-hook-form";

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
import { Separator } from "@/components/ui/separator";
import { formatEmiratesIdInput, formatMobileInput } from "@/lib/utils";

import { ChoiceGroup, optionsFrom } from "./choice-group";
import { NationalityField } from "./combo-field";
import { describedBy, errorId } from "./form";
import type { LeadFormValues } from "./form";
import { SectionHeading } from "./section-heading";
import { TextField } from "./text-field";

const NAME_HINT = "As it appears on your passport or Emirates ID.";

/** Under Family without Self, the person filling in the form sponsors the members. */
const SponsorFields = () => (
  <section className="flex flex-col gap-5" aria-labelledby="sponsor-heading">
    <div className="flex flex-col gap-1">
      <SectionHeading id="sponsor-heading">Sponsor details</SectionHeading>
      <p className="text-muted-foreground text-sm">
        You, as the visa sponsor of the people you&apos;re covering.
      </p>
    </div>

    <div className="grid gap-5 md:grid-cols-3 md:items-start md:gap-x-4">
      <TextField
        name="sponsor.firstName"
        label="First name"
        autoComplete="given-name"
        description={NAME_HINT}
      />
      <TextField
        name="sponsor.middleName"
        label="Middle name"
        optional
        autoComplete="additional-name"
      />
      <TextField
        name="sponsor.lastName"
        label="Last name"
        autoComplete="family-name"
      />
    </div>

    <div className="grid gap-5 md:grid-cols-2 md:items-start md:gap-x-4">
      <NationalityField name="sponsor.nationality" />
      <TextField
        name="sponsor.emiratesId"
        label="Emirates ID"
        placeholder="784-1990-1234567-1"
        inputMode="numeric"
        format={formatEmiratesIdInput}
      />
    </div>
  </section>
);

export const ContactStep = () => {
  const { control } = useFormContext<LeadFormValues>();
  const category = useWatch({ control, name: "category" });

  return (
    <FieldGroup>
      <div className="grid gap-5 md:grid-cols-2 md:items-start md:gap-x-4">
        <Controller
          control={control}
          name="contact.mobile"
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
                  aria-describedby={describedBy(
                    field.name,
                    fieldState.invalid,
                    "mobile-hint"
                  )}
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
                <FieldError
                  id={errorId(field.name)}
                  errors={[fieldState.error]}
                />
              ) : (
                <FieldDescription id="mobile-hint">
                  We&apos;ll call or WhatsApp you with quotes.
                </FieldDescription>
              )}
            </Field>
          )}
        />

        <TextField
          name="contact.email"
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
        />
      </div>

      {category === Category.FamilyOnly && (
        <>
          <Separator />
          <SponsorFields />
        </>
      )}

      <Separator />

      <Controller
        control={control}
        name="contact.incomeRange"
        render={({ field, fieldState }) => (
          <FieldSet data-invalid={fieldState.invalid || undefined}>
            <FieldLegend id="income-legend" variant="label">
              Your monthly income
            </FieldLegend>
            <FieldDescription id="income-hint">
              As the policyholder. This helps us show plans you qualify for.
            </FieldDescription>
            <ChoiceGroup
              aria-labelledby="income-legend"
              options={optionsFrom(IncomeRange, INCOME_RANGE_LABELS)}
              columns={2}
              value={field.value}
              onChange={field.onChange}
              invalid={fieldState.invalid}
              aria-describedby={describedBy(
                field.name,
                fieldState.invalid,
                "income-hint"
              )}
            />
            <FieldError id={errorId(field.name)} errors={[fieldState.error]} />
          </FieldSet>
        )}
      />

      <Controller
        control={control}
        name="contact.occupation"
        render={({ field, fieldState }) => (
          <FieldSet data-invalid={fieldState.invalid || undefined}>
            <FieldLegend id="occupation-legend" variant="label">
              Your occupation
            </FieldLegend>
            <ChoiceGroup
              aria-labelledby="occupation-legend"
              options={optionsFrom(Occupation, OCCUPATION_LABELS)}
              columns={2}
              value={field.value}
              onChange={field.onChange}
              invalid={fieldState.invalid}
              aria-describedby={describedBy(field.name, fieldState.invalid)}
            />
            <FieldError id={errorId(field.name)} errors={[fieldState.error]} />
          </FieldSet>
        )}
      />
    </FieldGroup>
  );
};
