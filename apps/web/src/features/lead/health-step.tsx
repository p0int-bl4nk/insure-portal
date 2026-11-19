import { Condition, CONDITION_LABELS } from "@insure/shared";
import { CaretDownIcon } from "@phosphor-icons/react";
import { useState } from "react";
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
import {
  formMembers,
  memberEligibility,
  memberField,
  memberLabel,
  pregnancyField,
  summarizeConditions,
} from "./form";
import type { LeadFormValues } from "./form";
import { SectionHeading } from "./section-heading";
import { TextField } from "./text-field";

interface LifestyleQuestion {
  who: string;
  text: string;
  name:
    | ReturnType<typeof memberField<"smoker">>
    | NonNullable<ReturnType<typeof pregnancyField>>;
}

export const HealthStep = () => {
  const {
    control,
    setValue,
    getValues,
    formState: { errors },
  } = useFormContext<LeadFormValues>();

  const members = useWatch({ control, name: "members" });
  const hasPed = useWatch({ control, name: "hasPed" });
  const proposer = useWatch({ control, name: "proposer" });

  const [open, setOpen] = useState(0);

  const entries = formMembers(members, proposer);

  // Yes/No follow-ups, only for the members they apply to.
  const lifestyle = entries.flatMap<LifestyleQuestion>((entry) => {
    const asks = memberEligibility(entry, proposer.maritalStatus);
    const who = memberLabel(entry);
    const pregnant = pregnancyField(entry.path);

    return [
      ...(asks.asksSmoker
        ? [
            {
              who,
              text: "smokes or uses tobacco",
              name: memberField(entry.path, "smoker"),
            },
          ]
        : []),
      ...(asks.asksPregnancy && pregnant
        ? [{ who, text: "is currently pregnant", name: pregnant }]
        : []),
    ];
  });

  const clearConditions = () => {
    for (const { path } of formMembers(getValues("members"), proposer)) {
      setValue(memberField(path, "conditions"), [], { shouldDirty: true });
    }
  };

  return (
    <FieldGroup>
      <Controller
        control={control}
        name="hasPed"
        render={({ field, fieldState }) => (
          <FieldSet data-invalid={fieldState.invalid || undefined}>
            <FieldLegend
              id="ped-legend"
              variant="label"
              className="leading-normal"
            >
              Does anyone to be insured have a pre-existing medical condition?
            </FieldLegend>

            <YesNoChoice
              aria-labelledby="ped-legend"
              value={field.value}
              onChange={(yes) => {
                field.onChange(yes);
                if (!yes) {
                  clearConditions();
                }
              }}
              invalid={fieldState.invalid}
            />

            <FieldError errors={[fieldState.error]} />
          </FieldSet>
        )}
      />

      {hasPed && (
        <section className="flex flex-col gap-2.5" aria-labelledby="who-has">
          <SectionHeading id="who-has">Who has a condition?</SectionHeading>

          {entries.map((entry, index) => {
            const label = `${memberLabel(entry)} · ${entry.age ?? "–"}`;
            const summary = summarizeConditions(entry.member.conditions ?? []);
            const panelId = `conditions-${entry.path.join("-")}`;
            const expanded = open === index;

            return (
              <div
                key={panelId}
                className={
                  expanded ? "border-primary border" : "border-border border"
                }
              >
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() => setOpen(expanded ? -1 : index)}
                  className="focus-visible:ring-ring flex h-11 w-full items-center justify-between gap-3 px-3.5 text-left text-xs font-medium outline-none focus-visible:ring-1"
                >
                  <span className="shrink-0">{label}</span>
                  <span className="text-muted-foreground flex min-w-0 items-center gap-1.5 font-normal">
                    <span className="truncate">{summary}</span>
                    <CaretDownIcon
                      className={expanded ? "rotate-180" : undefined}
                    />
                  </span>
                </button>

                {expanded && (
                  <Controller
                    control={control}
                    name={memberField(entry.path, "conditions")}
                    render={({ field }) => {
                      const value = field.value ?? [];

                      return (
                        <div
                          id={panelId}
                          className="grid grid-cols-2 gap-x-3 gap-y-2.5 px-3.5 pb-3.5 md:grid-cols-3"
                        >
                          {Object.values(Condition).map((condition) => {
                            const id = `${panelId}-${condition}`;

                            return (
                              <Field
                                key={condition}
                                orientation="horizontal"
                                className="min-h-7"
                              >
                                <Checkbox
                                  id={id}
                                  checked={value.includes(condition)}
                                  onCheckedChange={(checked) =>
                                    field.onChange(
                                      checked
                                        ? [...value, condition]
                                        : value.filter((c) => c !== condition)
                                    )
                                  }
                                />
                                <FieldLabel
                                  htmlFor={id}
                                  className="font-normal"
                                >
                                  {CONDITION_LABELS[condition]}
                                </FieldLabel>
                              </Field>
                            );
                          })}
                        </div>
                      );
                    }}
                  />
                )}
              </div>
            );
          })}
        </section>
      )}

      {lifestyle.length > 0 && (
        <>
          <Separator />

          <section
            className="flex flex-col gap-3.5"
            aria-labelledby="lifestyle"
          >
            <SectionHeading id="lifestyle">Lifestyle</SectionHeading>

            {lifestyle.map((question) => (
              <Controller
                key={question.name}
                control={control}
                name={question.name}
                render={({ field, fieldState }) => (
                  <Field
                    data-invalid={fieldState.invalid || undefined}
                    className="gap-1.5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <FieldLabel
                        id={`${question.name}-label`}
                        className="font-normal"
                      >
                        <span className="text-primary font-semibold">
                          {question.who}
                        </span>{" "}
                        {question.text}
                      </FieldLabel>

                      <YesNoChoice
                        aria-labelledby={`${question.name}-label`}
                        value={field.value}
                        onChange={field.onChange}
                        invalid={fieldState.invalid}
                        className="w-28 shrink-0"
                      />
                    </div>

                    <FieldError errors={[fieldState.error]} />
                  </Field>
                )}
              />
            ))}
          </section>
        </>
      )}

      <Separator />

      <section className="flex flex-col gap-5" aria-labelledby="measurements">
        <SectionHeading id="measurements">
          Your height and weight
        </SectionHeading>

        <div className="grid grid-cols-2 gap-3">
          <TextField
            name="measurements.heightCm"
            label="Height (cm)"
            inputMode="numeric"
            maxLength={3}
          />
          <TextField
            name="measurements.weightKg"
            label="Weight (kg)"
            inputMode="numeric"
            maxLength={3}
          />
        </div>
      </section>

      {errors.members?.message && (
        <FieldError>{errors.members.message}</FieldError>
      )}
    </FieldGroup>
  );
};
