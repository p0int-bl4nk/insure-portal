import { CONDITION_LABELS, CONDITIONS } from "@insure/shared";
import type { Condition } from "@insure/shared";
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
import { memberEligibility, memberLabel, summarizeConditions } from "./form";
import type { LeadFormValues } from "./form";

export const HealthStep = () => {
  const {
    control,
    setValue,
    getValues,
    formState: { errors },
  } = useFormContext<LeadFormValues>();
  const members = useWatch({ control, name: "members" }) ?? [];
  const hasPed = useWatch({ control, name: "hasPed" });
  const maritalStatus = useWatch({ control, name: "proposer.maritalStatus" });
  const [open, setOpen] = useState(0);

  const lifestyle = members.flatMap((member, index) => {
    const { asksSmoker, asksPregnancy } = memberEligibility(
      member,
      maritalStatus
    );
    const label = memberLabel(members, index);
    return [
      ...(asksSmoker
        ? [
            {
              key: `${index}-smoker`,
              name: `members.${index}.smoker` as const,
              who: label,
              text: "smokes or uses tobacco",
            },
          ]
        : []),
      ...(asksPregnancy
        ? [
            {
              key: `${index}-pregnant`,
              name: `members.${index}.pregnant` as const,
              who: label,
              text: "is currently pregnant",
            },
          ]
        : []),
    ];
  });

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
                  for (const i of getValues("members").keys()) {
                    setValue(`members.${i}.conditions`, [], {
                      shouldDirty: true,
                    });
                  }
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
          <h2 id="who-has" className="text-xs font-medium">
            Who has a condition?
          </h2>
          {members.map((member, index) => {
            const label = `${memberLabel(members, index)} · ${member.age}`;
            const selected = member.conditions ?? [];
            const summary = summarizeConditions(selected);
            const panelId = `conditions-${index}`;
            const expanded = open === index;
            return (
              <div
                key={index}
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
                    name={`members.${index}.conditions`}
                    render={({ field }) => {
                      const value = (field.value ?? []) as Condition[];
                      return (
                        <div
                          id={panelId}
                          className="grid grid-cols-2 gap-x-3 gap-y-2.5 px-3.5 pb-3.5 md:grid-cols-3"
                        >
                          {CONDITIONS.map((condition) => {
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
            <h2 id="lifestyle" className="text-xs font-medium">
              Lifestyle
            </h2>
            {lifestyle.map((q) => (
              <Controller
                key={q.key}
                control={control}
                name={q.name}
                render={({ field, fieldState }) => (
                  <Field
                    data-invalid={fieldState.invalid || undefined}
                    className="gap-1.5"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <FieldLabel id={`${q.key}-label`} className="font-normal">
                        <span className="text-primary font-semibold">
                          {q.who}
                        </span>{" "}
                        {q.text}
                      </FieldLabel>
                      <YesNoChoice
                        aria-labelledby={`${q.key}-label`}
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
            <div className="flex flex-col gap-1.5">
              <FieldLabel
                htmlFor="consent"
                className="text-[11px] leading-relaxed font-normal"
              >
                {/* Placeholder wording pending legal review. Bump CONSENT_VERSION when it changes. */}
                I agree to the processing of my and my family&apos;s health
                information to get insurance quotes, and to be contacted by
                phone, WhatsApp or email.
              </FieldLabel>
              <a
                href="#privacy"
                className="text-[11px] underline underline-offset-2"
              >
                Privacy notice
              </a>
              <FieldError errors={[fieldState.error]} />
            </div>
          </Field>
        )}
      />
      {errors.members?.root && <FieldError errors={[errors.members.root]} />}
    </FieldGroup>
  );
};
