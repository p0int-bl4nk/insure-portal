import {
  DATE_WINDOWS,
  DECLARATION,
  Emirate,
  EMIRATE_LABELS,
  INCOME_RANGE_LABELS,
  IncomeRange,
  Occupation,
  OCCUPATION_LABELS,
} from "@insure/shared";
import { Controller, useFormContext, useWatch } from "react-hook-form";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";

import { ChoiceGroup, optionsFrom, YesNoChoice } from "./choice-group";
import { DateField } from "./date-field";
import { formatEmiratesIdInput } from "./form";
import type { LeadFormValues } from "./form";
import { SectionHeading } from "./section-heading";
import { TextField } from "./text-field";

export const PolicyStep = () => {
  const { control } = useFormContext<LeadFormValues>();

  const hasPreviousPolicy = useWatch({
    control,
    name: "policy.hasPreviousPolicy",
  });
  const eVisaOnly = useWatch({ control, name: "residency.eVisaOnly" });

  return (
    <FieldGroup>
      <section className="flex flex-col gap-5" aria-labelledby="policy-heading">
        <SectionHeading id="policy-heading">Your policy</SectionHeading>

        <DateField
          name="policy.startDate"
          label="When do you want the policy to start?"
          description="Any day from today up to 30 days ahead."
          window={DATE_WINDOWS.policyStart}
        />

        <Controller
          control={control}
          name="policy.hasPreviousPolicy"
          render={({ field, fieldState }) => (
            <FieldSet data-invalid={fieldState.invalid || undefined}>
              <FieldLegend id="previous-policy-legend" variant="label">
                Do you have a current or recent health policy?
              </FieldLegend>
              <YesNoChoice
                aria-labelledby="previous-policy-legend"
                value={field.value}
                onChange={field.onChange}
                invalid={fieldState.invalid}
              />
              <FieldError errors={[fieldState.error]} />
            </FieldSet>
          )}
        />

        {hasPreviousPolicy && (
          <DateField
            name="policy.previousPolicyExpiry"
            label="Policy expiry date"
            window={DATE_WINDOWS.previousPolicyExpiry}
          />
        )}

        <Controller
          control={control}
          name="policy.incomeRange"
          render={({ field, fieldState }) => (
            <FieldSet data-invalid={fieldState.invalid || undefined}>
              <FieldLegend id="income-legend" variant="label">
                Monthly income
              </FieldLegend>
              <ChoiceGroup
                aria-labelledby="income-legend"
                options={optionsFrom(IncomeRange, INCOME_RANGE_LABELS)}
                columns={2}
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
          name="policy.occupation"
          render={({ field, fieldState }) => (
            <FieldSet data-invalid={fieldState.invalid || undefined}>
              <FieldLegend id="occupation-legend" variant="label">
                Occupation
              </FieldLegend>
              <ChoiceGroup
                aria-labelledby="occupation-legend"
                options={optionsFrom(Occupation, OCCUPATION_LABELS)}
                columns={2}
                value={field.value}
                onChange={field.onChange}
                invalid={fieldState.invalid}
              />
              <FieldError errors={[fieldState.error]} />
            </FieldSet>
          )}
        />
      </section>

      <Separator />

      <section
        className="flex flex-col gap-5"
        aria-labelledby="residency-heading"
      >
        <SectionHeading id="residency-heading">Residency and ID</SectionHeading>

        <Controller
          control={control}
          name="residency.emirate"
          render={({ field, fieldState }) => (
            <FieldSet data-invalid={fieldState.invalid || undefined}>
              <FieldLegend id="emirate-legend" variant="label">
                Emirate that issued your visa
              </FieldLegend>
              <ChoiceGroup
                aria-labelledby="emirate-legend"
                options={optionsFrom(Emirate, EMIRATE_LABELS)}
                columns={2}
                value={field.value}
                onChange={field.onChange}
                invalid={fieldState.invalid}
              />
              <FieldError errors={[fieldState.error]} />
            </FieldSet>
          )}
        />

        <div className="grid gap-5 md:grid-cols-2 md:items-start md:gap-x-4">
          <TextField
            name="residency.sponsorFirstName"
            label="Sponsor's first name"
          />
          <TextField
            name="residency.sponsorLastName"
            label="Sponsor's last name"
          />
        </div>

        <Controller
          control={control}
          name="residency.eVisaOnly"
          render={({ field }) => (
            <Field orientation="horizontal">
              <Checkbox
                id="e-visa-only"
                checked={field.value === true}
                onCheckedChange={(checked) => field.onChange(checked)}
              />
              <FieldLabel htmlFor="e-visa-only" className="font-normal">
                I don&apos;t have an Emirates ID, only an e-visa.
              </FieldLabel>
            </Field>
          )}
        />

        {eVisaOnly ? (
          <TextField
            name="residency.uidNumber"
            label="UID number"
            inputMode="numeric"
            maxLength={18}
          />
        ) : (
          <div className="grid gap-5 md:grid-cols-2 md:items-start md:gap-x-4">
            <TextField
              name="residency.emiratesId"
              label="Emirates ID"
              placeholder="784-1990-1234567-1"
              inputMode="numeric"
              format={formatEmiratesIdInput}
            />
            <DateField
              name="residency.emiratesIdExpiry"
              label="Emirates ID expiry date"
              window={DATE_WINDOWS.emiratesIdExpiry}
            />
          </div>
        )}

        <div className="grid gap-5 md:grid-cols-2 md:items-start md:gap-x-4">
          <TextField
            name="residency.visaFileNumber"
            label="Visa file number"
            placeholder="201/2020/1234567"
          />
          <TextField
            name="residency.passportNumber"
            label="Passport number"
            autoCapitalize="characters"
          />
        </div>
      </section>

      <Separator />

      <Controller
        control={control}
        name="consent"
        render={({ field, fieldState }) => (
          <Field
            orientation="horizontal"
            data-invalid={fieldState.invalid || undefined}
            className="items-start"
          >
            <Checkbox
              id="consent"
              checked={field.value === true}
              onCheckedChange={(checked) =>
                field.onChange(checked ? true : undefined)
              }
              aria-invalid={fieldState.invalid || undefined}
              className="mt-0.5"
            />

            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <FieldLabel htmlFor="consent" className="font-normal">
                I have read and agree to the following declaration:
              </FieldLabel>
              <ol className="text-muted-foreground flex list-decimal flex-col gap-2 pl-4 text-[11px] leading-relaxed">
                {DECLARATION.map((clause) => (
                  <li key={clause}>{clause}</li>
                ))}
              </ol>
              <FieldError errors={[fieldState.error]} />
            </div>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
