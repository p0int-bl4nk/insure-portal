import {
  asksPregnancy,
  asksSmoker,
  CONDITION_LABELS,
  listMembers,
  Relation,
  RELATION_LABELS,
} from "@insure/shared";
import type {
  Condition,
  LeadInput,
  SponsorInput,
  MemberEntry,
  MemberPath,
} from "@insure/shared";
import type { DefaultValues } from "react-hook-form";

export type LeadFormValues = LeadInput;
export type MembersFormValues = LeadFormValues["members"];
export type FormMemberEntry = MemberEntry<MembersFormValues>;

type ChildValues = NonNullable<MembersFormValues["children"]>[number];

export const STEP_TITLES = [
  "Who's covered",
  "About you",
  "Member details",
  "Health details",
  "Policy",
] as const;

export const STEP_COUNT = STEP_TITLES.length;

/**
 * A blank member for a newly added relation. Every relation is asked the same
 * details, and the extra gender and marital status fields start blank too.
 */
export const newMember = (): ChildValues => ({
  firstName: "",
  middleName: "",
  lastName: "",
  dateOfBirth: undefined,
  documents: { eVisaOnly: false, emiratesId: "", emiratesIdExpiry: undefined },
  visaFileNumber: "",
  passportNumber: "",
  heightCm: "",
  weightKg: "",
  conditions: [],
});

export const newSponsor = (): SponsorInput => ({
  firstName: "",
  middleName: "",
  lastName: "",
  emiratesId: "",
});

export const defaultValues: DefaultValues<LeadFormValues> = {
  contact: { mobile: "", email: "" },
  // Asked only under Family without Self; the schema drops it otherwise.
  sponsor: newSponsor(),
  members: { children: [] },
  consent: false,
};

/** Members in display order, from the current form values. */
export const formMembers = (
  members: MembersFormValues | undefined
): FormMemberEntry[] => (members ? listMembers(members) : []);

/** "Self", "Spouse", "Child 2"… */
export const memberLabel = ({
  relation,
  childNo,
}: Pick<FormMemberEntry, "relation" | "childNo">) =>
  relation === Relation.Child ? `Child ${childNo}` : RELATION_LABELS[relation];

// Typed form paths, so react-hook-form hands back typed values.

/** Fields every member has. */
type CommonField = keyof NonNullable<MembersFormValues["self"]> &
  keyof NonNullable<MembersFormValues["spouse"]> &
  keyof NonNullable<MembersFormValues["father"]> &
  keyof ChildValues;

type DocumentsField =
  | "eVisaOnly"
  | "emiratesId"
  | "emiratesIdExpiry"
  | "uidNumber";

/** Form path of a member, e.g. "members.children.1". */
export const memberBase = (path: MemberPath) =>
  path[0] === "children"
    ? (`members.children.${path[1]}` as const)
    : (`members.${path[0]}` as const);

/** Form path of a field every member has, e.g. "members.children.1.smoker". */
export const memberField = <F extends CommonField>(
  path: MemberPath,
  field: F
) => `${memberBase(path)}.${field}` as const;

/** Form path of a member's ID document field, e.g. "members.self.documents.uidNumber". */
export const documentsField = <F extends DocumentsField>(
  path: MemberPath,
  field: F
) => `${memberBase(path)}.documents.${field}` as const;

/** Gender path for the members who are asked it (self, spouse, children). */
export const genderField = (path: MemberPath) => {
  if (path[0] === "children") {
    return `members.children.${path[1]}.gender` as const;
  }

  return path[0] === "self" || path[0] === "spouse"
    ? (`members.${path[0]}.gender` as const)
    : undefined;
};

/** Marital status path for the members who are asked it (self, father, mother). */
export const maritalStatusField = (path: MemberPath) =>
  path[0] === "self" || path[0] === "father" || path[0] === "mother"
    ? (`members.${path[0]}.maritalStatus` as const)
    : undefined;

const DETAIL_FIELDS = [
  "firstName",
  "middleName",
  "lastName",
  "dateOfBirth",
  "nationality",
  "visaEmirate",
  "documents",
  "visaFileNumber",
  "passportNumber",
  "heightCm",
  "weightKg",
] as const satisfies readonly CommonField[];

/** Everything asked on a member's tab, so it can be checked on its own. */
export const detailFields = ({ path }: Pick<FormMemberEntry, "path">) =>
  [
    ...DETAIL_FIELDS.map((field) => memberField(path, field)),
    genderField(path),
    maritalStatusField(path),
  ].filter((field) => field !== undefined);

// Health follow-ups

/** Which health follow-ups apply to a member, given the answers so far. */
export const memberEligibility = (
  entry: FormMemberEntry
): { asksSmoker: boolean; asksPregnancy: boolean } => {
  const { age } = entry;

  if (age === undefined) {
    return { asksSmoker: false, asksPregnancy: false };
  }

  return {
    asksSmoker: asksSmoker(age),
    asksPregnancy: asksPregnancy({ ...entry, age }),
  };
};

/** "None", "Diabetes, Thyroid" or "Diabetes, Thyroid and 3 more". */
export const summarizeConditions = (
  conditions: readonly Condition[],
  shown = 2
): string => {
  if (conditions.length === 0) {
    return "None";
  }

  const names = conditions.slice(0, shown).map((c) => CONDITION_LABELS[c]);
  const rest = conditions.length - shown;

  return rest > 0 ? `${names.join(", ")} and ${rest} more` : names.join(", ");
};

/** Id of a field's error message, so its control can point at it. */
export const errorId = (name: string) => `${name}-error`;

/** aria-describedby for a control: its error while it has one, else its hint. */
export const describedBy = (
  name: string,
  invalid: boolean,
  hintId?: string
): string | undefined => (invalid ? errorId(name) : hintId);
