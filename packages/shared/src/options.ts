// Fixed option sets used by the form, the API validation and the Sheet columns.
// Reference values through these objects (e.g. `Relation.Self`), never as string literals.
// Values are stored in the Sheet as their labels, so changing a label changes the Sheet output.

type ValueOf<T> = T[keyof T];

export const Emirate = {
  Dubai: "dubai",
  AbuDhabi: "abu_dhabi",
  Other: "other",
} as const;
export type Emirate = ValueOf<typeof Emirate>;
export const EMIRATE_LABELS: Record<Emirate, string> = {
  [Emirate.Dubai]: "Dubai",
  [Emirate.AbuDhabi]: "Abu Dhabi",
  [Emirate.Other]: "Other",
};

export const SalaryBand = {
  UpTo4000: "upto_4000",
  Above4000: "above_4000",
} as const;
export type SalaryBand = ValueOf<typeof SalaryBand>;
export const SALARY_BAND_LABELS: Record<SalaryBand, string> = {
  [SalaryBand.UpTo4000]: "Up to AED 4,000",
  [SalaryBand.Above4000]: "Above AED 4,000",
};

export const Gender = {
  Male: "male",
  Female: "female",
} as const;
export type Gender = ValueOf<typeof Gender>;
export const GENDER_LABELS: Record<Gender, string> = {
  [Gender.Male]: "Male",
  [Gender.Female]: "Female",
};

export const MaritalStatus = {
  Single: "single",
  Married: "married",
} as const;
export type MaritalStatus = ValueOf<typeof MaritalStatus>;
export const MARITAL_STATUS_LABELS: Record<MaritalStatus, string> = {
  [MaritalStatus.Single]: "Single",
  [MaritalStatus.Married]: "Married",
};

/** Declaration order is the order members are listed in the form and the Sheet. */
export const Relation = {
  Self: "self",
  Spouse: "spouse",
  Child: "child",
  Father: "father",
  Mother: "mother",
} as const;
export type Relation = ValueOf<typeof Relation>;
export const RELATION_ORDER: readonly Relation[] = Object.values(Relation);
export const RELATION_LABELS: Record<Relation, string> = {
  [Relation.Self]: "Self",
  [Relation.Spouse]: "Spouse",
  [Relation.Child]: "Child",
  [Relation.Father]: "Father",
  [Relation.Mother]: "Mother",
};

/** Declaration order is the order conditions are listed in the form. */
export const Condition = {
  Diabetes: "diabetes",
  Hypertension: "hypertension",
  Heart: "heart",
  Respiratory: "respiratory",
  Thyroid: "thyroid",
  Cancer: "cancer",
  Kidney: "kidney",
  Other: "other",
} as const;
export type Condition = ValueOf<typeof Condition>;
export const CONDITION_LABELS: Record<Condition, string> = {
  [Condition.Diabetes]: "Diabetes",
  [Condition.Hypertension]: "High blood pressure",
  [Condition.Heart]: "Heart condition",
  [Condition.Respiratory]: "Asthma / respiratory",
  [Condition.Thyroid]: "Thyroid",
  [Condition.Cancer]: "Cancer (current/past)",
  [Condition.Kidney]: "Kidney condition",
  [Condition.Other]: "Other",
};

export const MAX_CHILDREN = 4;

/** Relations that can only be covered when the proposer is married. */
export const MARRIED_ONLY_RELATIONS: readonly Relation[] = [
  Relation.Spouse,
  Relation.Child,
];

export const AGE_LIMITS: Record<Relation, { min: number; max: number }> = {
  [Relation.Self]: { min: 18, max: 99 },
  [Relation.Spouse]: { min: 18, max: 99 },
  [Relation.Child]: { min: 0, max: 25 },
  [Relation.Father]: { min: 18, max: 99 },
  [Relation.Mother]: { min: 18, max: 99 },
};

/** Bump when the consent wording shown to users changes. Stored with every lead. */
export const CONSENT_VERSION = "2026-11-draft";
