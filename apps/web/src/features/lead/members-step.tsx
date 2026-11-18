import {
  Gender,
  GENDER_LABELS,
  MaritalStatus,
  MARRIED_ONLY_RELATIONS,
  MAX_CHILDREN,
  Relation,
} from "@insure/shared";
import { CheckIcon, PlusIcon, XIcon } from "@phosphor-icons/react";
import { cn } from "cn";
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
  FieldDescription,
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
import {
  formMembers,
  genderField,
  memberField,
  memberLabel,
  newMember,
} from "./form";
import type { LeadFormValues } from "./form";

const TILES = [
  { relation: Relation.Self, label: "Self" },
  { relation: Relation.Spouse, label: "Spouse" },
  { relation: Relation.Child, label: "Children" },
  { relation: Relation.Father, label: "Father" },
  { relation: Relation.Mother, label: "Mother" },
] as const;

const GENDER_SHORT = Object.values(Gender).map((value) => ({
  value,
  label: GENDER_LABELS[value].charAt(0),
}));

export const MembersStep = () => {
  const {
    control,
    setValue,
    formState: { errors },
  } = useFormContext<LeadFormValues>();

  const children = useFieldArray({ control, name: "members.children" });

  const members = useWatch({ control, name: "members" });
  const proposerGender = useWatch({ control, name: "proposer.gender" });
  const maritalStatus = useWatch({ control, name: "proposer.maritalStatus" });
  const isMarried = maritalStatus === MaritalStatus.Married;

  const entries = formMembers(members, proposerGender);
  const childCount = members?.children?.length ?? 0;

  const isIncluded = (relation: Relation) =>
    relation === Relation.Child
      ? childCount > 0
      : entries.some((entry) => entry.relation === relation);

  const addChild = () => children.append(newMember.child());

  const toggle = (relation: Relation, on: boolean) => {
    switch (relation) {
      case Relation.Child: {
        if (on) {
          addChild();
        } else {
          children.remove();
        }
        return;
      }

      case Relation.Spouse: {
        setValue(
          "members.spouse",
          on ? newMember.spouse(proposerGender) : undefined
        );
        return;
      }

      case Relation.Father: {
        setValue("members.father", on ? newMember.father() : undefined);
        return;
      }

      case Relation.Mother: {
        setValue("members.mother", on ? newMember.mother() : undefined);
        break;
      }

      // Self is always included and can't be toggled.
      default:
    }
  };

  const membersError =
    errors.members?.message ?? errors.members?.children?.message;

  return (
    <FieldGroup>
      <FieldSet data-invalid={!!membersError || undefined}>
        <FieldLegend variant="label">Members</FieldLegend>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
          {TILES.map(({ relation, label }) => {
            const pressed = isIncluded(relation);

            return (
              <Toggle
                key={relation}
                variant="choice"
                size="touch"
                pressed={pressed}
                disabled={
                  relation === Relation.Self ||
                  (!isMarried && MARRIED_ONLY_RELATIONS.includes(relation))
                }
                onPressedChange={(on) => toggle(relation, on)}
                className={cn(
                  "h-11 justify-start gap-2",
                  // Self is always included: keep it looking selected, not disabled.
                  relation === Relation.Self && "disabled:opacity-100"
                )}
              >
                {pressed ? (
                  <CheckIcon data-icon="inline-start" />
                ) : (
                  <PlusIcon data-icon="inline-start" />
                )}

                <span className="flex-1 text-left">{label}</span>

                {relation === Relation.Child && childCount > 0 && (
                  <span className="text-[11px] opacity-70">×{childCount}</span>
                )}
              </Toggle>
            );
          })}
        </div>

        {!isMarried && (
          <FieldDescription>
            Spouse and children can be added when your marital status is
            Married.
          </FieldDescription>
        )}

        {membersError && <FieldError>{membersError}</FieldError>}
      </FieldSet>

      <Separator />

      <section className="flex flex-col gap-3" aria-labelledby="member-details">
        <h2 id="member-details" className="text-xs font-medium">
          Member details
        </h2>

        <div className="grid gap-3 md:grid-cols-2">
          {entries.map((entry) => {
            const label = memberLabel(entry);
            const childIndex =
              entry.path[0] === "children" ? entry.path[1] : undefined;
            const key =
              childIndex === undefined
                ? entry.relation
                : (children.fields[childIndex]?.id ?? label);
            const idBase = `member-${key}`;
            const gender = genderField(entry.path);

            return (
              <FieldSet key={key} className="border-border gap-3 border p-3.5">
                <div className="flex min-h-8 items-center justify-between">
                  <FieldLegend variant="label" className="mb-0 font-semibold">
                    {label}
                  </FieldLegend>

                  {entry.relation === Relation.Self && (
                    <Badge variant="secondary">FROM STEP 1</Badge>
                  )}

                  {childIndex !== undefined && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${label.toLowerCase()}`}
                      onClick={() => children.remove(childIndex)}
                    >
                      <XIcon />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Controller
                    control={control}
                    name={memberField(entry.path, "age")}
                    render={({ field, fieldState }) => (
                      <Field
                        data-invalid={fieldState.invalid || undefined}
                        className="min-w-0"
                      >
                        <FieldLabel
                          htmlFor={`${idBase}-age`}
                          className="text-muted-foreground"
                        >
                          Age
                        </FieldLabel>

                        <Input
                          id={`${idBase}-age`}
                          inputMode="numeric"
                          maxLength={2}
                          className="h-10"
                          aria-invalid={fieldState.invalid || undefined}
                          name={field.name}
                          ref={field.ref}
                          value={String(field.value ?? "")}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                        />

                        <FieldError errors={[fieldState.error]} />
                      </Field>
                    )}
                  />

                  {gender ? (
                    <Controller
                      control={control}
                      name={gender}
                      render={({ field, fieldState }) => (
                        <Field
                          data-invalid={fieldState.invalid || undefined}
                          className="min-w-0"
                        >
                          <FieldLabel
                            id={`${idBase}-gender`}
                            className="text-muted-foreground"
                          >
                            Gender
                          </FieldLabel>

                          <ChoiceGroup
                            aria-labelledby={`${idBase}-gender`}
                            options={GENDER_SHORT}
                            value={field.value}
                            onChange={field.onChange}
                            invalid={fieldState.invalid}
                          />

                          <FieldError errors={[fieldState.error]} />
                        </Field>
                      )}
                    />
                  ) : (
                    // Not asked: self (from step 1), father and mother.
                    <Field className="min-w-0">
                      <FieldLabel className="text-muted-foreground">
                        Gender
                      </FieldLabel>

                      <div className="border-input bg-muted/50 text-muted-foreground flex h-10 items-center border px-2.5 text-xs">
                        {entry.gender ? GENDER_LABELS[entry.gender] : "—"}
                      </div>
                    </Field>
                  )}
                </div>
              </FieldSet>
            );
          })}
        </div>

        {childCount > 0 && childCount < MAX_CHILDREN && (
          <Button
            type="button"
            variant="outline"
            size="touch"
            className="border-dashed md:self-start"
            onClick={addChild}
          >
            <PlusIcon data-icon="inline-start" />
            Add another child
          </Button>
        )}
      </section>
    </FieldGroup>
  );
};
