// Fixed option sets used by the form, the API validation and the Sheet columns.
// Reference values through these objects (e.g. `Relation.Self`), never as string literals.
// Values are stored in the Sheet as their labels, so changing a label changes the Sheet output.

type ValueOf<T> = T[keyof T];

export const Emirate = {
  AbuDhabi: "abu_dhabi",
  Dubai: "dubai",
  Sharjah: "sharjah",
  Ajman: "ajman",
  UmmAlQuwain: "umm_al_quwain",
  RasAlKhaimah: "ras_al_khaimah",
  Fujairah: "fujairah",
} as const;
export type Emirate = ValueOf<typeof Emirate>;
export const EMIRATE_LABELS: Record<Emirate, string> = {
  [Emirate.AbuDhabi]: "Abu Dhabi",
  [Emirate.Dubai]: "Dubai",
  [Emirate.Sharjah]: "Sharjah",
  [Emirate.Ajman]: "Ajman",
  [Emirate.UmmAlQuwain]: "Umm Al Quwain",
  [Emirate.RasAlKhaimah]: "Ras Al Khaimah",
  [Emirate.Fujairah]: "Fujairah",
};

// Placeholder bands until the business confirms them. The first band is the Essential
// Benefits Plan threshold, so it must stay at AED 4,000.
export const IncomeRange = {
  UpTo4000: "upto_4000",
  From4001To10000: "4001_10000",
  From10001To20000: "10001_20000",
  Above20000: "above_20000",
} as const;
export type IncomeRange = ValueOf<typeof IncomeRange>;
export const INCOME_RANGE_LABELS: Record<IncomeRange, string> = {
  [IncomeRange.UpTo4000]: "Up to AED 4,000",
  [IncomeRange.From4001To10000]: "AED 4,001 – 10,000",
  [IncomeRange.From10001To20000]: "AED 10,001 – 20,000",
  [IncomeRange.Above20000]: "Above AED 20,000",
};

// Placeholder list until the business confirms it.
export const Occupation = {
  Salaried: "salaried",
  SelfEmployed: "self_employed",
  BusinessOwner: "business_owner",
  Student: "student",
  Homemaker: "homemaker",
  Retired: "retired",
  Unemployed: "unemployed",
  Other: "other",
} as const;
export type Occupation = ValueOf<typeof Occupation>;
export const OCCUPATION_LABELS: Record<Occupation, string> = {
  [Occupation.Salaried]: "Salaried",
  [Occupation.SelfEmployed]: "Self-employed",
  [Occupation.BusinessOwner]: "Business owner",
  [Occupation.Student]: "Student",
  [Occupation.Homemaker]: "Homemaker",
  [Occupation.Retired]: "Retired",
  [Occupation.Unemployed]: "Unemployed",
  [Occupation.Other]: "Other",
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
  Divorced: "divorced",
  Widowed: "widowed",
} as const;
export type MaritalStatus = ValueOf<typeof MaritalStatus>;
export const MARITAL_STATUS_LABELS: Record<MaritalStatus, string> = {
  [MaritalStatus.Single]: "Single",
  [MaritalStatus.Married]: "Married",
  [MaritalStatus.Divorced]: "Divorced",
  [MaritalStatus.Widowed]: "Widowed",
};

/** Who the policy is for: the first question of the form. */
export const Category = {
  SelfOnly: "self_only",
  SelfAndFamily: "self_and_family",
  FamilyOnly: "family_only",
} as const;
export type Category = ValueOf<typeof Category>;
export const CATEGORY_LABELS: Record<Category, string> = {
  [Category.SelfOnly]: "Self Only",
  [Category.SelfAndFamily]: "Both Self and Family",
  [Category.FamilyOnly]: "Family without Self",
};

/** Categories where the person filling in the form is also insured. */
export const SELF_CATEGORIES: readonly Category[] = [
  Category.SelfOnly,
  Category.SelfAndFamily,
];

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

export const AGE_LIMITS: Record<Relation, { min: number; max: number }> = {
  [Relation.Self]: { min: 18, max: 99 },
  [Relation.Spouse]: { min: 18, max: 99 },
  [Relation.Child]: { min: 0, max: 17 },
  [Relation.Father]: { min: 18, max: 99 },
  [Relation.Mother]: { min: 18, max: 99 },
};

/** Bump when DECLARATION changes. Stored with every lead to record what was agreed. */
export const CONSENT_VERSION = "2026-11-declaration-1";

/** The declaration agreed to on the last step. */
export const DECLARATION = [
  "I hereby declare that what has been stated above is true and complete to the best of my knowledge and belief and I have not withheld any material information. It is understood and agreed that this declaration which is contained in the application form constitutes the basis of my/our contractual relationship with Insurance Co through our Third-Party Administrator (TPA) and that any non-disclosure or misrepresentation of facts will make my / our insurance coverage void from inception.",
  "I hereby authorize any hospital, physician, surgeon or any other organization to furnish to the Insurance Co through our TPA any or all information that may be required concerning my/our medical history. I understand and acknowledge any pregnancy not declared at the time of this application's coverage will be at the sole discretion of the insurer. The insurer has the right to not cover any maternity claims to any undeclared pregnancy. I also acknowledge and understand any pregnancy, which arises within forty calendar days from the date of this application; coverage will also be at the discretion of the insurer.",
] as const;
