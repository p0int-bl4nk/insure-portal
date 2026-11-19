import {
  asksPregnancy,
  asksSmoker,
  CONDITION_LABELS,
  Gender,
  listMembers,
  Relation,
  RELATION_LABELS,
} from "@insure/shared";
import type {
  Condition,
  LeadInput,
  MaritalStatus,
  MemberEntry,
  MemberPath,
} from "@insure/shared";
import type { DefaultValues } from "react-hook-form";

export type LeadFormValues = LeadInput;
export type MembersFormValues = LeadFormValues["members"];
export type FormMemberEntry = MemberEntry<MembersFormValues>;

/** What the member list needs from the proposer: self's gender and date of birth. */
export type ProposerBasics = Pick<
  Partial<LeadFormValues["proposer"]>,
  "gender" | "dateOfBirth"
>;

type ChildValues = NonNullable<MembersFormValues["children"]>[number];

export const STEP_TITLES = [
  "About you",
  "Who's covered",
  "Health details",
  "Policy & residency",
] as const;

export const STEP_COUNT = STEP_TITLES.length;

export const defaultValues: DefaultValues<LeadFormValues> = {
  proposer: {
    firstName: "",
    middleName: "",
    lastName: "",
    email: "",
    mobile: "",
  },
  members: { self: { conditions: [] }, children: [] },
  measurements: { heightCm: "", weightKg: "" },
  residency: {
    eVisaOnly: false,
    visaFileNumber: "",
    passportNumber: "",
    sponsorFirstName: "",
    sponsorLastName: "",
  },
  consent: undefined,
};

/** Blank members for newly ticked relations. Spouse defaults to the opposite gender. */
export const newMember = {
  spouse: (
    proposerGender?: Gender
  ): NonNullable<MembersFormValues["spouse"]> => ({
    age: "",
    conditions: [],
    gender:
      proposerGender &&
      (proposerGender === Gender.Male ? Gender.Female : Gender.Male),
  }),

  child: (): ChildValues => ({ age: "", conditions: [] }),

  father: (): NonNullable<MembersFormValues["father"]> => ({
    age: "",
    conditions: [],
  }),

  mother: (): NonNullable<MembersFormValues["mother"]> => ({
    age: "",
    conditions: [],
  }),
};

/** Members in display order, from the current form values. */
export const formMembers = (
  members: MembersFormValues | undefined,
  proposer: ProposerBasics
): FormMemberEntry[] => (members ? listMembers(members, proposer) : []);

/** "Self", "Spouse", "Child 2"… */
export const memberLabel = ({
  relation,
  childNo,
}: Pick<FormMemberEntry, "relation" | "childNo">) =>
  relation === Relation.Child ? `Child ${childNo}` : RELATION_LABELS[relation];

// Typed form paths, so react-hook-form hands back typed values.

/** Fields every member has. */
type CommonField = keyof MembersFormValues["self"] &
  keyof NonNullable<MembersFormValues["father"]> &
  keyof ChildValues;

/** Form path of a field every member has, e.g. "members.children.1.smoker". */
export const memberField = <F extends CommonField>(
  path: MemberPath,
  field: F
) =>
  path[0] === "children"
    ? (`members.children.${path[1]}.${field}` as const)
    : (`members.${path[0]}.${field}` as const);

/** Age path for the members whose age is asked (everyone except self). */
export const ageField = (path: MemberPath) => {
  if (path[0] === "children") {
    return `members.children.${path[1]}.age` as const;
  }

  return path[0] === "self" ? undefined : (`members.${path[0]}.age` as const);
};

/** Gender path for the members who are asked it (spouse, child). */
export const genderField = (path: MemberPath) => {
  if (path[0] === "children") {
    return `members.children.${path[1]}.gender` as const;
  }

  return path[0] === "spouse" ? ("members.spouse.gender" as const) : undefined;
};

/** Pregnancy path for the members who can be asked it (self, spouse). */
export const pregnancyField = (path: MemberPath) => {
  if (path[0] === "self") {
    return "members.self.pregnant" as const;
  }

  return path[0] === "spouse"
    ? ("members.spouse.pregnant" as const)
    : undefined;
};

// Health follow-ups

/** Which health follow-ups apply to a member, given the answers so far. */
export const memberEligibility = (
  { relation, gender, age }: FormMemberEntry,
  maritalStatus: MaritalStatus | undefined
): { asksSmoker: boolean; asksPregnancy: boolean } => {
  if (age === undefined) {
    return { asksSmoker: false, asksPregnancy: false };
  }

  return {
    asksSmoker: asksSmoker(relation, age),
    asksPregnancy: asksPregnancy(relation, gender, age, maritalStatus),
  };
};

/** Drops answers to questions that no longer apply (e.g. after an age change). */
export const pruneHealthAnswers = (
  members: MembersFormValues,
  proposer: ProposerBasics,
  maritalStatus: MaritalStatus | undefined
): MembersFormValues => {
  const next = structuredClone(members);

  for (const entry of formMembers(next, proposer)) {
    const { member } = entry;
    const eligibility = memberEligibility(entry, maritalStatus);

    if (!eligibility.asksSmoker) {
      delete member.smoker;
    }

    if (!eligibility.asksPregnancy && "pregnant" in member) {
      delete member.pregnant;
    }
  }

  return next;
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

// Input formatting

/**
 * Mobile input after the fixed +971 prefix: at most 9 digits, shown as "50 123 4567".
 * Accepts pasted "+971 50…", "00971 50…" or "050…" by dropping the prefix.
 */
export const formatMobileInput = (raw: string): string => {
  let digits = raw.replaceAll(/\D/gu, "");

  if (digits.startsWith("00971")) {
    digits = digits.slice(5);
  } else if (digits.startsWith("971") && digits.length > 9) {
    digits = digits.slice(3);
  } else if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  digits = digits.slice(0, 9);

  return [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5)]
    .filter(Boolean)
    .join(" ");
};

/** Emirates ID shown as 784-YYYY-NNNNNNN-N. */
export const formatEmiratesIdInput = (raw: string): string => {
  const digits = raw.replaceAll(/\D/gu, "").slice(0, 15);

  return [
    digits.slice(0, 3),
    digits.slice(3, 7),
    digits.slice(7, 14),
    digits.slice(14),
  ]
    .filter(Boolean)
    .join("-");
};
