import {
  DATE_WINDOWS,
  Gender,
  GENDER_LABELS,
  MaritalStatus,
  MARITAL_STATUS_LABELS,
  MEASUREMENTS,
  Relation,
} from "@insure/shared";
import { CheckIcon } from "@phosphor-icons/react";
import { cn } from "cn";
import { Controller, useFormContext, useWatch } from "react-hook-form";

import {
  Field,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { formatEmiratesIdInput, formatVisaFileInput } from "@/lib/utils";

import { ChoiceGroup, optionsFrom, YesNoChoice } from "./choice-group";
import { EmirateField, NationalityField } from "./combo-field";
import { DateField } from "./date-field";
import {
  describedBy,
  detailFields,
  documentsField,
  errorId,
  formMembers,
  genderField,
  maritalStatusField,
  memberBase,
  memberField,
  memberLabel,
} from "./form";
import type { FormMemberEntry, LeadFormValues } from "./form";
import { TextField } from "./text-field";

const GENDER_OPTIONS = optionsFrom(Gender, GENDER_LABELS);
const MARITAL_OPTIONS = optionsFrom(MaritalStatus, MARITAL_STATUS_LABELS);
/** Self can cover children without a spouse when divorced or widowed, not single. */
const PARENT_MARITAL_OPTIONS = MARITAL_OPTIONS.filter(
  ({ value }) => value !== MaritalStatus.Single
);

/** A value that's set by the member's relation rather than asked. */
const FixedValue = ({ label, value }: { label: string; value: string }) => (
  <Field className="min-w-0">
    <FieldLabel className="text-muted-foreground">{label}</FieldLabel>
    <div className="border-input bg-muted/50 text-muted-foreground flex h-10 items-center border px-2.5 text-base md:text-sm">
      {value}
    </div>
  </Field>
);

const MemberDetails = ({
  entry,
  hasSpouse,
  hasChildren,
}: {
  entry: FormMemberEntry;
  hasSpouse: boolean;
  hasChildren: boolean;
}) => {
  const { control } = useFormContext<LeadFormValues>();
  const { path, relation } = entry;
  const base = memberBase(path);

  const eVisaOnly = useWatch({
    control,
    name: documentsField(path, "eVisaOnly"),
  });
  const gender = genderField(path);
  const maritalStatus = maritalStatusField(path);
  const selfMarried = relation === Relation.Self && hasSpouse;

  return (
    <div className="flex flex-col gap-5">
      <Controller
        control={control}
        name={documentsField(path, "eVisaOnly")}
        render={({ field, fieldState }) => (
          <FieldSet data-invalid={fieldState.invalid || undefined}>
            <FieldLegend id={`${base}-evisa`} variant="label">
              I have only an e-visa.
            </FieldLegend>
            <YesNoChoice
              aria-labelledby={`${base}-evisa`}
              value={field.value}
              onChange={field.onChange}
              invalid={fieldState.invalid}
              aria-describedby={describedBy(field.name, fieldState.invalid)}
              className="w-40"
            />
            <FieldError id={errorId(field.name)} errors={[fieldState.error]} />
          </FieldSet>
        )}
      />

      <div className="grid gap-5 md:grid-cols-3 md:items-start md:gap-x-4">
        <TextField
          name={memberField(path, "firstName")}
          label="First name"
          description="As on the passport."
        />
        <TextField
          name={memberField(path, "middleName")}
          label="Middle name"
          optional
        />
        <TextField name={memberField(path, "lastName")} label="Last name" />
      </div>

      <div className="grid gap-5 md:grid-cols-2 md:items-start md:gap-x-4">
        {gender ? (
          <Controller
            control={control}
            name={gender}
            render={({ field, fieldState }) => (
              <FieldSet
                data-invalid={fieldState.invalid || undefined}
                className="min-w-0"
              >
                <FieldLegend id={`${base}-gender`} variant="label">
                  Gender
                </FieldLegend>
                <ChoiceGroup
                  aria-labelledby={`${base}-gender`}
                  options={GENDER_OPTIONS}
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
        ) : (
          <FixedValue
            label="Gender"
            value={entry.gender ? GENDER_LABELS[entry.gender] : "—"}
          />
        )}

        {maritalStatus && !selfMarried ? (
          <Controller
            control={control}
            name={maritalStatus}
            render={({ field, fieldState }) => (
              <FieldSet
                data-invalid={fieldState.invalid || undefined}
                className="min-w-0"
              >
                <FieldLegend id={`${base}-marital`} variant="label">
                  Marital status
                </FieldLegend>
                <ChoiceGroup
                  aria-labelledby={`${base}-marital`}
                  options={
                    relation === Relation.Self && hasChildren
                      ? PARENT_MARITAL_OPTIONS
                      : MARITAL_OPTIONS
                  }
                  columns={2}
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
        ) : (
          <FixedValue
            label="Marital status"
            value={
              entry.maritalStatus
                ? MARITAL_STATUS_LABELS[entry.maritalStatus]
                : "—"
            }
          />
        )}
      </div>

      <div className="grid gap-5 md:grid-cols-2 md:items-start md:gap-x-4">
        <DateField
          name={memberField(path, "dateOfBirth")}
          label="Date of birth"
          window={DATE_WINDOWS.dateOfBirth[relation]}
        />
        <NationalityField name={memberField(path, "nationality")} />
      </div>

      <div className="grid gap-5 md:grid-cols-2 md:items-start md:gap-x-4">
        <EmirateField name={memberField(path, "visaEmirate")} />
        <TextField
          name={memberField(path, "visaFileNumber")}
          label="Visa file number"
          description="e.g. 201/2020/1234567. For a 4-part number, type . after the single digit."
          // Decimal keypads have a "." for the optional one-digit part.
          inputMode="decimal"
          format={formatVisaFileInput}
        />
      </div>

      <div className="grid gap-5 md:grid-cols-2 md:items-start md:gap-x-4">
        {eVisaOnly ? (
          <TextField
            name={documentsField(path, "uidNumber")}
            label="UID number"
            inputMode="numeric"
            maxLength={18}
          />
        ) : (
          <>
            <TextField
              name={documentsField(path, "emiratesId")}
              label="Emirates ID"
              placeholder="784-1990-1234567-1"
              inputMode="numeric"
              format={formatEmiratesIdInput}
            />
            <DateField
              name={documentsField(path, "emiratesIdExpiry")}
              label="Emirates ID expiry date"
              window={DATE_WINDOWS.emiratesIdExpiry}
            />
          </>
        )}
        <TextField
          name={memberField(path, "passportNumber")}
          label="Passport number"
          autoCapitalize="characters"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 md:gap-x-4">
        <TextField
          name={memberField(path, "heightCm")}
          label="Height (cm)"
          type="number"
          inputMode="numeric"
          {...MEASUREMENTS.heightCm}
        />
        <TextField
          name={memberField(path, "weightKg")}
          label="Weight (kg)"
          type="number"
          inputMode="decimal"
          {...MEASUREMENTS.weightKg}
        />
      </div>
    </div>
  );
};

interface MembersStepProps {
  tab: number;
  onTabChange: (tab: number) => void;
  /** Tabs that passed their checks, by member path, e.g. "children.0". */
  checked: ReadonlySet<string>;
}

/** One tab per member; the wizard's Continue button moves to the next tab. */
export const MembersStep = ({
  tab,
  onTabChange,
  checked,
}: MembersStepProps) => {
  const { control, getFieldState, formState } =
    useFormContext<LeadFormValues>();
  const members = useWatch({ control, name: "members" });

  const entries = formMembers(members);
  const current = entries[tab] ?? entries[0];

  if (!current) {
    return null;
  }

  const hasErrors = (entry: FormMemberEntry) =>
    detailFields(entry).some((name) => getFieldState(name, formState).invalid);

  const isComplete = (entry: FormMemberEntry) =>
    checked.has(entry.path.join(".")) && !hasErrors(entry);

  const panelId = "member-panel";

  return (
    <div className="flex flex-col gap-5">
      <div
        role="tablist"
        aria-label="Members"
        className="border-border -mx-5 flex overflow-x-auto border-b px-5 md:-mx-8 md:px-8"
      >
        {entries.map((entry, index) => {
          const selected = entry === current;
          const label = memberLabel(entry);

          return (
            <button
              key={entry.path.join(".")}
              type="button"
              role="tab"
              id={`member-tab-${index}`}
              aria-selected={selected}
              aria-controls={panelId}
              onClick={() => onTabChange(index)}
              className={cn(
                "focus-visible:ring-ring -mb-px flex h-10 shrink-0 items-center gap-1.5 border-b-2 px-3 text-xs outline-none focus-visible:ring-1",
                selected
                  ? "border-primary text-primary font-semibold"
                  : "text-muted-foreground hover:text-foreground border-transparent"
              )}
            >
              {label}
              {hasErrors(entry) && (
                <span
                  className="bg-destructive size-1.5"
                  aria-label="has errors"
                />
              )}
              {isComplete(entry) && (
                <CheckIcon className="size-3" aria-label="complete" />
              )}
            </button>
          );
        })}
      </div>

      <div
        role="tabpanel"
        id={panelId}
        aria-labelledby={`member-tab-${entries.indexOf(current)}`}
      >
        <MemberDetails
          key={current.path.join(".")}
          entry={current}
          hasSpouse={members?.spouse !== undefined}
          hasChildren={(members?.children ?? []).length > 0}
        />
      </div>
    </div>
  );
};
