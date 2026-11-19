import {
  Category,
  CATEGORY_LABELS,
  MAX_CHILDREN,
  Relation,
} from "@insure/shared";
import {
  CheckIcon,
  MinusIcon,
  PlusIcon,
  UserIcon,
  UsersIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import type { Icon } from "@phosphor-icons/react";
import {
  Controller,
  useFieldArray,
  useFormContext,
  useWatch,
} from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { Toggle } from "@/components/ui/toggle";

import { ChoiceGroup } from "./choice-group";
import { describedBy, errorId, newMember } from "./form";
import type { LeadFormValues } from "./form";

const CATEGORY_ICONS: Record<Category, Icon> = {
  [Category.SelfOnly]: UserIcon,
  [Category.SelfAndFamily]: UsersThreeIcon,
  [Category.FamilyOnly]: UsersIcon,
};

const CATEGORY_OPTIONS = Object.values(Category).map((value) => {
  const CategoryIcon = CATEGORY_ICONS[value];

  return {
    value,
    label: (
      <span className="flex w-full items-center gap-2.5">
        <CategoryIcon className="size-5 shrink-0" />
        {CATEGORY_LABELS[value]}
      </span>
    ),
  };
});

const SINGLE_RELATIONS = [
  { relation: Relation.Spouse, label: "Spouse" },
  { relation: Relation.Father, label: "Father" },
  { relation: Relation.Mother, label: "Mother" },
] as const;

export const CoverStep = () => {
  const { control, setValue, clearErrors } = useFormContext<LeadFormValues>();

  const children = useFieldArray({ control, name: "members.children" });
  const category = useWatch({ control, name: "category" });
  const members = useWatch({ control, name: "members" });
  const childCount = members?.children?.length ?? 0;

  // Who's covered is checked as part of "category". Clear its error on any
  // change instead of re-checking: members only fit the category once
  // Continue applies it, so a re-check here could show a false error.
  const recheckCategory = () => clearErrors("category");

  const addChild = () => {
    children.append(newMember());
    recheckCategory();
  };

  const removeChildren = (index?: number) => {
    children.remove(index);
    recheckCategory();
  };

  return (
    <FieldGroup>
      <Controller
        control={control}
        name="category"
        render={({ field, fieldState }) => (
          <FieldSet data-invalid={fieldState.invalid || undefined}>
            <FieldLegend id="category-legend" variant="label">
              Selecting health insurance for
            </FieldLegend>
            <ChoiceGroup
              aria-labelledby="category-legend"
              options={CATEGORY_OPTIONS}
              columns={1}
              value={field.value}
              onChange={(picked) => {
                field.onChange(picked);
                recheckCategory();
              }}
              invalid={fieldState.invalid}
              aria-describedby={describedBy(field.name, fieldState.invalid)}
              className="md:grid-cols-3!"
            />
            <FieldError id={errorId(field.name)} errors={[fieldState.error]} />
          </FieldSet>
        )}
      />

      {category !== undefined && category !== Category.SelfOnly && (
        <FieldSet>
          <FieldLegend variant="label">
            {category === Category.FamilyOnly
              ? "Who is covered?"
              : "Who else is covered?"}
          </FieldLegend>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {SINGLE_RELATIONS.map(({ relation, label }) => {
              const pressed = members?.[relation] !== undefined;

              return (
                <Toggle
                  key={relation}
                  variant="choice"
                  size="touch"
                  pressed={pressed}
                  onPressedChange={(on) => {
                    setValue(
                      `members.${relation}`,
                      on ? newMember() : undefined
                    );
                    recheckCategory();
                  }}
                  className="h-11 justify-start gap-2"
                >
                  {pressed ? (
                    <CheckIcon data-icon="inline-start" />
                  ) : (
                    <PlusIcon data-icon="inline-start" />
                  )}
                  {label}
                </Toggle>
              );
            })}

            <Toggle
              variant="choice"
              size="touch"
              pressed={childCount > 0}
              onPressedChange={(on) => (on ? addChild() : removeChildren())}
              className="h-11 justify-start gap-2"
            >
              {childCount > 0 ? (
                <CheckIcon data-icon="inline-start" />
              ) : (
                <PlusIcon data-icon="inline-start" />
              )}
              <span className="flex-1 text-left">Children</span>
              {childCount > 0 && (
                <span className="text-[11px] opacity-70">×{childCount}</span>
              )}
            </Toggle>
          </div>

          {childCount > 0 && (
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-muted-foreground">
                Children under 18, up to {MAX_CHILDREN}
              </span>
              <div className="border-border flex items-center border">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove a child"
                  onClick={() => removeChildren(childCount - 1)}
                >
                  <MinusIcon />
                </Button>
                <span
                  className="w-8 text-center font-semibold"
                  aria-live="polite"
                >
                  {childCount}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Add a child"
                  disabled={childCount >= MAX_CHILDREN}
                  onClick={addChild}
                >
                  <PlusIcon />
                </Button>
              </div>
            </div>
          )}
        </FieldSet>
      )}
    </FieldGroup>
  );
};
