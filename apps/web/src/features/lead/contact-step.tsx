import { Category } from "@insure/shared";
import { Controller, useFormContext, useWatch } from "react-hook-form";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import { Separator } from "@/components/ui/separator";
import { formatEmiratesIdInput, formatMobileInput } from "@/lib/utils";

import { NationalityField } from "./combo-field";
import type { LeadFormValues } from "./form";
import { SectionHeading } from "./section-heading";
import { TextField } from "./text-field";

const NAME_HINT = "As it appears on your passport or Emirates ID.";

/** Under Family without Self, the person filling in the form sponsors the members. */
const SponsorFields = () => (
  <section className="flex flex-col gap-5" aria-labelledby="sponsor-heading">
    <div className="flex flex-col gap-1">
      <SectionHeading id="sponsor-heading">Sponsor details</SectionHeading>
      <p className="text-muted-foreground text-xs">
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
    </FieldGroup>
  );
};
