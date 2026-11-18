// Fixed option sets used by the form, the API validation and the Sheet columns.
// Values are stored in the Sheet as their labels, so changing a label changes the Sheet output.

export const EMIRATES = ["dubai", "abu_dhabi", "other"] as const;
export type Emirate = (typeof EMIRATES)[number];
export const EMIRATE_LABELS: Record<Emirate, string> = {
  dubai: "Dubai",
  abu_dhabi: "Abu Dhabi",
  other: "Other",
};

export const SALARY_BANDS = ["upto_4000", "above_4000"] as const;
export type SalaryBand = (typeof SALARY_BANDS)[number];
export const SALARY_BAND_LABELS: Record<SalaryBand, string> = {
  upto_4000: "Up to AED 4,000",
  above_4000: "Above AED 4,000",
};

export const GENDERS = ["male", "female"] as const;
export type Gender = (typeof GENDERS)[number];
export const GENDER_LABELS: Record<Gender, string> = {
  male: "Male",
  female: "Female",
};

export const MARITAL_STATUSES = ["single", "married"] as const;
export type MaritalStatus = (typeof MARITAL_STATUSES)[number];
export const MARITAL_STATUS_LABELS: Record<MaritalStatus, string> = {
  single: "Single",
  married: "Married",
};

export const RELATIONS = [
  "self",
  "spouse",
  "child",
  "father",
  "mother",
] as const;
export type Relation = (typeof RELATIONS)[number];
export const RELATION_LABELS: Record<Relation, string> = {
  self: "Self",
  spouse: "Spouse",
  child: "Child",
  father: "Father",
  mother: "Mother",
};

export const CONDITIONS = [
  "diabetes",
  "hypertension",
  "heart",
  "respiratory",
  "thyroid",
  "cancer",
  "kidney",
  "other",
] as const;
export type Condition = (typeof CONDITIONS)[number];
export const CONDITION_LABELS: Record<Condition, string> = {
  diabetes: "Diabetes",
  hypertension: "High blood pressure",
  heart: "Heart condition",
  respiratory: "Asthma / respiratory",
  thyroid: "Thyroid",
  cancer: "Cancer (current/past)",
  kidney: "Kidney condition",
  other: "Other",
};

export const MAX_CHILDREN = 4;

/** Relations that can only be covered when the proposer is married. */
export const MARRIED_ONLY_RELATIONS: readonly Relation[] = ["spouse", "child"];

export const AGE_LIMITS: Record<Relation, { min: number; max: number }> = {
  self: { min: 18, max: 99 },
  spouse: { min: 18, max: 99 },
  child: { min: 0, max: 25 },
  father: { min: 18, max: 99 },
  mother: { min: 18, max: 99 },
};

/** Bump when the consent wording shown to users changes. Stored with every lead. */
export const CONSENT_VERSION = "2026-11-draft";
