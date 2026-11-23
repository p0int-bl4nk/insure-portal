import { DATE_WINDOWS, DECLARATION } from "@insure/shared";
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

import { YesNoChoice } from "./choice-group";
import { DateField } from "./date-field";
import { describedBy, errorId } from "./form";
import type { LeadFormValues } from "./form";

export const PolicyStep = () => {
  const { control } = useFormContext<LeadFormValues>();

  const hasPreviousPolicy = useWatch({
    control,
    name: "policy.hasPreviousPolicy",
  });

  return (
    <FieldGroup>
      <section className="flex flex-col gap-5">
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
                aria-describedby={describedBy(field.name, fieldState.invalid)}
              />
              <FieldError
                id={errorId(field.name)}
                errors={[fieldState.error]}
              />
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
              checked={field.value}
              onCheckedChange={field.onChange}
              aria-invalid={fieldState.invalid || undefined}
              aria-describedby={describedBy(field.name, fieldState.invalid)}
              className="mt-0.5"
            />

            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <FieldLabel htmlFor="consent" className="font-normal">
                I have read and agree to the following declaration:
              </FieldLabel>
              <ol className="text-muted-foreground flex list-decimal flex-col gap-2 pl-4 text-xs leading-relaxed">
                {DECLARATION.map((clause) => (
                  <li key={clause}>{clause}</li>
                ))}
              </ol>
              <FieldError
                id={errorId(field.name)}
                errors={[fieldState.error]}
              />
            </div>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
