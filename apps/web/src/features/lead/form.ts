import {
  isAdult,
  isPregnancyEligible,
  RELATION_LABELS,
  RELATIONS,
} from "@insure/shared";
import type {
  Gender,
  LeadInput,
  MaritalStatus,
  Relation,
} from "@insure/shared";
import type { DefaultValues } from "react-hook-form";

export type LeadFormValues = LeadInput;
export type MemberFormValues = LeadFormValues["members"][number];

export const STEP_COUNT = 3;

export const defaultValues: DefaultValues<LeadFormValues> = {
  proposer: { fullName: "", mobile: "", email: "" },
  members: [{ relation: "self", age: "", conditions: [] }],
  consent: undefined,
};

/** Members stay ordered: self, spouse, children, father, mother, domestic worker. */
export const insertIndex = (
  members: MemberFormValues[],
  relation: Relation
): number => {
  const rank = RELATIONS.indexOf(relation);
  const after = members.findIndex((m) => RELATIONS.indexOf(m.relation) > rank);
  return after === -1 ? members.length : after;
};

/** Sensible starting gender; the user can change it (except for self). */
const defaultGender = (
  relation: Relation,
  proposerGender?: Gender
): Gender | undefined => {
  if (relation === "father") {
    return "male";
  }
  if (relation === "mother") {
    return "female";
  }
  if (relation === "spouse" && proposerGender) {
    return proposerGender === "male" ? "female" : "male";
  }
  return undefined;
};

export const newMember = (
  relation: Relation,
  proposerGender?: Gender
): MemberFormValues => ({
  relation,
  age: "",
  gender: defaultGender(relation, proposerGender) as Gender,
  conditions: [],
});

/** "Self", "Spouse", "Child 2"… */
export const memberLabel = (
  members: MemberFormValues[],
  index: number
): string => {
  const member = members[index];
  if (!member) {
    return "";
  }
  if (member.relation !== "child") {
    return RELATION_LABELS[member.relation];
  }
  const childNo = members
    .slice(0, index + 1)
    .filter((m) => m.relation === "child").length;
  return `Child ${childNo}`;
};

const toAge = (age: unknown): number | undefined => {
  const n = typeof age === "string" ? Number(age) : age;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
};

export const memberEligibility = (
  member: MemberFormValues,
  maritalStatus: MaritalStatus | undefined
): { asksSmoker: boolean; asksPregnancy: boolean } => {
  const age = toAge(member.age);
  if (age === undefined) {
    return { asksSmoker: false, asksPregnancy: false };
  }
  const shaped = {
    relation: member.relation,
    age,
    gender: member.gender ?? "",
  };
  return {
    asksSmoker: isAdult(shaped),
    asksPregnancy: isPregnancyEligible(shaped, maritalStatus),
  };
};

/** Drops answers to questions that no longer apply (e.g. after an age change). */
export const pruneHealthAnswers = (
  members: MemberFormValues[],
  maritalStatus: MaritalStatus | undefined
): MemberFormValues[] =>
  members.map((member) => {
    const { asksSmoker, asksPregnancy } = memberEligibility(
      member,
      maritalStatus
    );
    const next = { ...member };
    if (!asksSmoker) {
      delete next.smoker;
    }
    if (!asksPregnancy) {
      delete next.pregnant;
    }
    return next;
  });
