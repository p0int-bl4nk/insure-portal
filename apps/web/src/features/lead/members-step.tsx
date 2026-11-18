import { GENDER_LABELS, GENDERS, MAX_CHILDREN } from "@insure/shared";
import type { Relation } from "@insure/shared";
import { CheckIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import {
  Controller,
  useFieldArray,
  useFormContext,
  useWatch,
} from "react-hook-form";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Toggle } from "@/components/ui/toggle";

import { ChoiceGroup } from "./choice-group";
import { insertIndex, memberLabel, newMember } from "./form";
import type { LeadFormValues } from "./form";

const TILES: { relation: Relation; label: string }[] = [
  { relation: "self", label: "Self" },
  { relation: "spouse", label: "Spouse" },
  { relation: "child", label: "Children" },
  { relation: "father", label: "Father" },
  { relation: "mother", label: "Mother" },
  { relation: "domestic_worker", label: "Domestic worker" },
];

const GENDER_SHORT = GENDERS.map((value) => ({
  value,
  label: GENDER_LABELS[value].charAt(0),
}));

export const MembersStep = () => {
  const {
    control,
    register,
    getValues,
    formState: { errors },
  } = useFormContext<LeadFormValues>();
  const { fields, insert, remove } = useFieldArray({
    control,
    name: "members",
  });
  const members = useWatch({ control, name: "members" }) ?? [];
  const proposerGender = useWatch({ control, name: "proposer.gender" });

  const countOf = (relation: Relation) =>
    members.filter((m) => m.relation === relation).length;
  const childCount = countOf("child");

  const add = (relation: Relation) =>
    insert(
      insertIndex(getValues("members"), relation),
      newMember(relation, proposerGender)
    );

  const toggle = (relation: Relation, on: boolean) => {
    if (on) {
      add(relation);
      return;
    }
    const indexes = getValues("members").flatMap((m, i) =>
      m.relation === relation ? [i] : []
    );
    remove(indexes);
  };

  const rootError =
    errors.members?.root ??
    (errors.members?.message ? errors.members : undefined);

  return (
    <FieldGroup>
      <FieldSet data-invalid={!!rootError || undefined}>
        <FieldLegend variant="label">Members</FieldLegend>
        <div className="grid grid-cols-2 gap-2">
          {TILES.map(({ relation, label }) => {
            const pressed = countOf(relation) > 0;
            return (
              <Toggle
                key={relation}
                variant="choice"
                size="touch"
                pressed={pressed}
                disabled={relation === "self"}
                onPressedChange={(on) => toggle(relation, on)}
                className="h-11 justify-start gap-2 disabled:opacity-100"
              >
                {pressed ? (
                  <CheckIcon data-icon="inline-start" />
                ) : (
                  <PlusIcon data-icon="inline-start" />
                )}
                <span className="flex-1 text-left">{label}</span>
                {relation === "child" && childCount > 0 && (
                  <span className="text-[11px] opacity-70">×{childCount}</span>
                )}
              </Toggle>
            );
          })}
        </div>
        <FieldError errors={[rootError]} />
      </FieldSet>

      <Separator />

      <section className="flex flex-col gap-3" aria-labelledby="member-details">
        <h2 id="member-details" className="text-xs font-medium">
          Member details
        </h2>

        {fields.map((field, index) => {
          const member = members[index];
          const memberErrors = errors.members?.[index];
          const label = memberLabel(members, index);
          const isSelf = member?.relation === "self";
          const ageId = `member-${field.id}-age`;
          return (
            <FieldSet
              key={field.id}
              className="border-border gap-3 border p-3.5"
            >
              <div className="flex min-h-8 items-center justify-between">
                <FieldLegend variant="label" className="mb-0 font-semibold">
                  {label}
                </FieldLegend>
                {isSelf && <Badge variant="secondary">FROM STEP 1</Badge>}
                {member?.relation === "child" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${label.toLowerCase()}`}
                    onClick={() => remove(index)}
                  >
                    <XIcon />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field
                  data-invalid={!!memberErrors?.age || undefined}
                  className="min-w-0"
                >
                  <FieldLabel htmlFor={ageId} className="text-muted-foreground">
                    Age
                  </FieldLabel>
                  <Input
                    id={ageId}
                    inputMode="numeric"
                    maxLength={2}
                    className="h-10"
                    aria-invalid={!!memberErrors?.age || undefined}
                    {...register(`members.${index}.age`)}
                  />
                  <FieldError errors={[memberErrors?.age]} />
                </Field>
                {isSelf ? (
                  <Field className="min-w-0">
                    <FieldLabel className="text-muted-foreground">
                      Gender
                    </FieldLabel>
                    <div className="border-input bg-muted/50 text-muted-foreground flex h-10 items-center border px-2.5 text-xs">
                      {proposerGender ? GENDER_LABELS[proposerGender] : "—"}
                    </div>
                  </Field>
                ) : (
                  <Controller
                    control={control}
                    name={`members.${index}.gender`}
                    render={({ field: gender, fieldState }) => (
                      <Field
                        data-invalid={fieldState.invalid || undefined}
                        className="min-w-0"
                      >
                        <FieldLabel
                          id={`${ageId}-gender`}
                          className="text-muted-foreground"
                        >
                          Gender
                        </FieldLabel>
                        <ChoiceGroup
                          aria-labelledby={`${ageId}-gender`}
                          options={GENDER_SHORT}
                          value={gender.value}
                          onChange={gender.onChange}
                          invalid={fieldState.invalid}
                        />
                        <FieldError errors={[fieldState.error]} />
                      </Field>
                    )}
                  />
                )}
              </div>
            </FieldSet>
          );
        })}

        {childCount > 0 && childCount < MAX_CHILDREN && (
          <Button
            type="button"
            variant="outline"
            size="touch"
            className="border-dashed"
            onClick={() => add("child")}
          >
            <PlusIcon data-icon="inline-start" />
            Add another child
          </Button>
        )}
      </section>
    </FieldGroup>
  );
};
