import { z } from "zod";

import { COUNTRY_CODES } from "./countries.ts";
import { addDays, addYears, ageFromDob, todayInDubai } from "./dates.ts";
import {
  AGE_LIMITS,
  Category,
  Condition,
  Emirate,
  Gender,
  IncomeRange,
  MaritalStatus,
  MAX_CHILDREN,
  MEASUREMENTS,
  Occupation,
  Relation,
  SELF_CATEGORIES,
} from "./options.ts";

const UAE_MOBILE = /^(?:\+?971|00971|0)?(?<local>5[024568]\d{7})$/u;
const EMIRATES_ID = /^784\d{12}$/u;
const VISA_FILE_NUMBER = /^\d{3}\/\d{4}(?:\/\d)?\/\d{2,7}$/u;
const PASSPORT_NUMBER = /^[A-Z0-9]{5,20}$/u;

// Name rules as the insurer forms define them, plus hyphens and apostrophes
// inside a name ("Al-Mansoori", "O'Brien").
const NAME_WORD = String.raw`[a-zA-Z]+(?:['’-][a-zA-Z]+)*\.?`;
const SINGLE_NAME = new RegExp(`^(?=.{2,40}$)${NAME_WORD}$`, "u");
const MIDDLE_NAME = new RegExp(
  `^(?=.{1,100}$)${NAME_WORD}(?: ${NAME_WORD})*$`,
  "u"
);

const NAME_FORMAT = "Use letters, hyphens or apostrophes only.";

const ADULT_AGE = 18;
const PREGNANCY_MAX_AGE = 55;

const answerThis = "Answer this question.";

export const normalizeUaeMobile = (raw: string): string | null => {
  const local = raw.replaceAll(/[\s()-]/gu, "").match(UAE_MOBILE)
    ?.groups?.local;

  return local ? `+971${local}` : null;
};

/** "784-1990-1234567-1" (any separators) → 15 digits, or null. */
export const normalizeEmiratesId = (raw: string): string | null => {
  const digits = raw.replaceAll(/\D/gu, "");

  return EMIRATES_ID.test(digits) ? digits : null;
};

/** Required-text field: trimmed, with one message for blank and one for a bad format. */
const text = (pattern: RegExp, required: string, invalid: string) =>
  z.string(required).trim().min(1, required).regex(pattern, invalid);

export type DateWindow = (today: Date) => { from: Date; to: Date };

/** Dates of birth that give an age within the relation's limits. */
const dateOfBirthWindow =
  (relation: Relation): DateWindow =>
  (today) => ({
    from: addDays(addYears(today, -(AGE_LIMITS[relation].max + 1)), 1),
    to: addYears(today, -AGE_LIMITS[relation].min),
  });

/** Allowed date ranges, relative to today in Dubai. The form's calendars use these too. */
export const DATE_WINDOWS = {
  dateOfBirth: {
    [Relation.Self]: dateOfBirthWindow(Relation.Self),
    [Relation.Spouse]: dateOfBirthWindow(Relation.Spouse),
    [Relation.Child]: dateOfBirthWindow(Relation.Child),
    [Relation.Father]: dateOfBirthWindow(Relation.Father),
    [Relation.Mother]: dateOfBirthWindow(Relation.Mother),
  } satisfies Record<Relation, DateWindow>,
  policyStart: ((today) => ({
    from: today,
    to: addDays(today, 30),
  })) satisfies DateWindow,
  previousPolicyExpiry: ((today) => ({
    from: addYears(today, -10),
    to: addYears(today, 2),
  })) satisfies DateWindow,
  emiratesIdExpiry: ((today) => ({
    from: today,
    to: addDays(today, 3650),
  })) satisfies DateWindow,
};

/**
 * A date within a window relative to today (Dubai). Accepts a Date from the form or
 * the ISO string it becomes in JSON; a blank field gives "Enter a date."
 */
const dateWithin = (window: DateWindow, message: string) =>
  z.coerce.date<Date | string | undefined>("Enter a date.").refine((date) => {
    const { from, to } = window(todayInDubai());

    return date >= from && date <= to;
  }, message);

/** Whole number from a text input; "" fails as missing rather than 0. */
/** A number typed into a text box, within limits and to `step` precision (1 or 0.1). */
const measurement = (
  { min, max, step }: { min: number; max: number; step: number },
  label: string
) => {
  const decimals = step < 1 ? 1 : 0;

  return z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.coerce
      .number<unknown>(`Enter ${label}.`)
      .refine(
        // Compare at the step's precision: 72.5 / 0.1 isn't exactly 725 in floats.
        (value) => Number(value.toFixed(decimals)) === value,
        decimals ? "Use at most 1 decimal place." : "Enter a whole number."
      )
      .min(min, `Enter ${label} from ${min} to ${max}.`)
      .max(max, `Enter ${label} from ${min} to ${max}.`)
  );
};

// `.optional().pipe(required)`: optional in the input type so the form can start blank,
// required in the parsed output with the message shown when it's missing.
const choice = <T extends Record<string, string>>(values: T, message: string) =>
  z.enum(values).optional().pipe(z.enum(values, message));

const nationality = z
  .enum(COUNTRY_CODES)
  .optional()
  .pipe(z.enum(COUNTRY_CODES, "Choose a nationality."));

const middleName = z
  .string()
  .trim()
  .regex(MIDDLE_NAME, "Use letters, spaces, hyphens or apostrophes only.")
  .or(z.literal(""))
  .optional()
  .transform((value) => value || undefined);

const emiratesId = z.string().transform((value, ctx) => {
  const normalized = normalizeEmiratesId(value);
  if (normalized) {
    return normalized;
  }

  ctx.addIssue({
    code: "custom",
    message: "Enter the 15-digit Emirates ID starting with 784.",
  });

  return z.NEVER;
});

const nameFields = {
  firstName: text(SINGLE_NAME, "Enter the first name.", NAME_FORMAT),
  middleName,
  lastName: text(SINGLE_NAME, "Enter the last name.", NAME_FORMAT),
};

export const contactSchema = z
  .object({
    mobile: z.string().transform((value, ctx) => {
      const normalized = normalizeUaeMobile(value);
      if (normalized) {
        return normalized;
      }

      ctx.addIssue({
        code: "custom",
        message: "Enter a UAE mobile number starting with 5, e.g. 50 123 4567.",
      });

      return z.NEVER;
    }),
    email: z
      .email("Enter a valid email address, e.g. name@example.com.")
      .max(254),
  })
  .describe("Step 2: how to reach whoever filled in the form.");

export const sponsorSchema = z
  .object(
    { ...nameFields, nationality, emiratesId },
    "Enter the sponsor's details."
  )
  .describe(
    "Step 2, Family without Self only: the person filling in the form, who sponsors the members' visas."
  );

export type Sponsor = z.output<typeof sponsorSchema>;
export type SponsorInput = z.input<typeof sponsorSchema>;

const documentsSchema = z
  .discriminatedUnion(
    "eVisaOnly",
    [
      z.object({
        eVisaOnly: z.literal(false),
        emiratesId,
        emiratesIdExpiry: dateWithin(
          DATE_WINDOWS.emiratesIdExpiry,
          "Enter an expiry date that hasn't passed."
        ),
      }),
      z.object({
        eVisaOnly: z.literal(true),
        uidNumber: text(
          /^\d{1,18}$/u,
          "Enter the UID number.",
          "Use digits only, up to 18."
        ),
      }),
    ],
    answerThis
  )
  .describe(
    '"I have only an e-visa" decides whether Emirates ID or UID is asked.'
  );

const conditions = z
  .array(z.enum(Condition))
  .default([])
  .transform((list) => [...new Set(list)]);

const ageRangeMessage = (relation: Relation) =>
  relation === Relation.Child
    ? `Children must be under ${AGE_LIMITS[Relation.Child].max + 1}.`
    : `Must be ${AGE_LIMITS[relation].min} to ${AGE_LIMITS[relation].max} years old.`;

/** What every member is asked on their tab, plus their health answers (step 4). */
const personFields = (relation: Relation) => ({
  ...nameFields,
  dateOfBirth: dateWithin(
    DATE_WINDOWS.dateOfBirth[relation],
    ageRangeMessage(relation)
  ),
  nationality,
  visaEmirate: choice(Emirate, "Choose the emirate that issued the visa."),
  documents: documentsSchema,
  visaFileNumber: text(
    VISA_FILE_NUMBER,
    "Enter the visa file number.",
    "Use the format 201/2020/1234567."
  ),
  passportNumber: z
    .string("Enter the passport number.")
    .trim()
    .toUpperCase()
    .regex(PASSPORT_NUMBER, "Use 5–20 letters and digits."),
  heightCm: measurement(MEASUREMENTS.heightCm, "the height in cm"),
  weightKg: measurement(MEASUREMENTS.weightKg, "the weight in kg"),
  conditions,
  // Asked on the health step when they apply, and required there by the rules below.
  smoker: z.boolean().optional(),
  pregnant: z.boolean().optional(),
});

const genderChoice = choice(Gender, "Choose a gender.");
const maritalStatusChoice = choice(MaritalStatus, "Choose a marital status.");

export const membersSchema = z
  .object({
    self: z
      .object({
        ...personFields(Relation.Self),
        gender: genderChoice,
        maritalStatus: maritalStatusChoice,
      })
      .optional(),
    spouse: z
      .object({ ...personFields(Relation.Spouse), gender: genderChoice })
      .optional(),
    children: z
      .array(
        z.object({ ...personFields(Relation.Child), gender: genderChoice })
      )
      .max(MAX_CHILDREN, `Add up to ${MAX_CHILDREN} children.`)
      .default([]),
    father: z
      .object({
        ...personFields(Relation.Father),
        maritalStatus: maritalStatusChoice,
      })
      .optional(),
    mother: z
      .object({
        ...personFields(Relation.Mother),
        maritalStatus: maritalStatusChoice,
      })
      .optional(),
  })
  .describe(
    "Step 3: one tab per member. Spouses are always Married and children Single, so neither is asked; fathers and mothers aren't asked their gender."
  );

export type Members = z.output<typeof membersSchema>;
export type MembersInput = z.input<typeof membersSchema>;

const previousPolicySchema = z.discriminatedUnion(
  "hasPreviousPolicy",
  [
    z.object({
      hasPreviousPolicy: z.literal(true),
      previousPolicyExpiry: dateWithin(
        DATE_WINDOWS.previousPolicyExpiry,
        "Enter the expiry date of your current or last policy."
      ),
    }),
    z.object({ hasPreviousPolicy: z.literal(false) }),
  ],
  answerThis
);

export const policySchema = z
  .object({
    startDate: dateWithin(
      DATE_WINDOWS.policyStart,
      "Choose a date from today up to 30 days ahead."
    ),
    incomeRange: choice(IncomeRange, "Choose your income range."),
    occupation: choice(Occupation, "Choose your occupation."),
  })
  .and(previousPolicySchema)
  .describe("Step 5: the policy wanted.");

// Ordered member list shared by the form, the rules below and the Sheet rows.
type AnyMembers = Members | MembersInput;

/** Any one member's value within a members object. */
export type MemberValue<T extends AnyMembers> =
  | NonNullable<T["self"] | T["spouse"] | T["father"] | T["mother"]>
  | NonNullable<T["children"]>[number];

/** Where a member lives below `members`, e.g. ["children", 1]. */
export type MemberPath =
  | readonly [Exclude<keyof Members, "children">]
  | readonly ["children", number];

export interface MemberEntry<T extends AnyMembers> {
  relation: Relation;
  path: MemberPath;
  /** 1-based position among children; undefined for other relations. */
  childNo?: number;
  /** Asked of self, spouse and children; fixed for father and mother. */
  gender: Gender | undefined;
  /** Asked of self, father and mother; spouses are Married, children Single. */
  maritalStatus: MaritalStatus | undefined;
  /** From the date of birth; undefined while that isn't a valid date. */
  age: number | undefined;
  member: MemberValue<T>;
}

/** Members in display order: self, spouse, children, father, mother. */
export const listMembers = <T extends AnyMembers>(
  members: T
): MemberEntry<T>[] => {
  const entries: MemberEntry<T>[] = [];
  const add = (entry: Omit<MemberEntry<T>, "age">) => {
    entries.push({ ...entry, age: ageFromDob(entry.member.dateOfBirth) });
  };

  if (members.self) {
    add({
      relation: Relation.Self,
      path: ["self"],
      gender: members.self.gender,
      maritalStatus: members.self.maritalStatus,
      member: members.self,
    });
  }

  if (members.spouse) {
    add({
      relation: Relation.Spouse,
      path: ["spouse"],
      gender: members.spouse.gender,
      maritalStatus: MaritalStatus.Married,
      member: members.spouse,
    });
  }

  for (const [i, child] of (members.children ?? []).entries()) {
    add({
      relation: Relation.Child,
      path: ["children", i],
      childNo: i + 1,
      gender: child.gender,
      maritalStatus: MaritalStatus.Single,
      member: child,
    });
  }

  if (members.father) {
    add({
      relation: Relation.Father,
      path: ["father"],
      gender: Gender.Male,
      maritalStatus: members.father.maritalStatus,
      member: members.father,
    });
  }

  if (members.mother) {
    add({
      relation: Relation.Mother,
      path: ["mother"],
      gender: Gender.Female,
      maritalStatus: members.mother.maritalStatus,
      member: members.mother,
    });
  }

  return entries;
};

/** Smoker is asked of adults; only children are under 18. */
export const asksSmoker = (age: number): boolean => age >= ADULT_AGE;

/** Pregnancy is asked of married women aged 18–55. */
export const asksPregnancy = ({
  gender,
  maritalStatus,
  age,
}: Pick<MemberEntry<AnyMembers>, "gender" | "maritalStatus"> & {
  age: number;
}): boolean =>
  gender === Gender.Female &&
  maritalStatus === MaritalStatus.Married &&
  age >= ADULT_AGE &&
  age <= PREGNANCY_MAX_AGE;

/**
 * Members without answers to health questions they aren't asked, e.g. after a date
 * of birth change, or sent by hand to the API. Eligibility hangs on age, so this
 * can't be a schema branch.
 */
export const pruneHealthAnswers = <T extends AnyMembers>(members: T): T => {
  const next = structuredClone(members);

  for (const entry of listMembers(next)) {
    const { age, member } = entry;

    if (age === undefined || !asksSmoker(age)) {
      delete member.smoker;
    }

    if (age === undefined || !asksPregnancy({ ...entry, age })) {
      delete member.pregnant;
    }
  }

  return next;
};

/** Whether self is insured under this category. */
export const coversSelf = (category: Category | undefined): boolean =>
  category !== undefined && SELF_CATEGORIES.includes(category);

/** Whether anyone other than self is covered. */
export const hasFamily = (members: AnyMembers): boolean =>
  members.spouse !== undefined ||
  (members.children ?? []).length > 0 ||
  members.father !== undefined ||
  members.mother !== undefined;

// Cross-field rules the shape can't express. Each runs as soon as the sections it
// reads are valid, so errors show on the step that caused them.
type Section = keyof z.input<typeof leadShape>;

const sectionsValid =
  (...sections: Section[]) =>
  ({ issues }: { issues: readonly { path?: PropertyKey[] }[] }) =>
    issues.every((issue) => {
      const [section] = issue.path ?? [];

      return !sections.some((name) => name === section);
    });

const leadFields = z.object({
  contact: contactSchema,
  members: membersSchema,
  hasPed: z.boolean(answerThis),
  policy: policySchema,
  consent: z
    .boolean()
    .optional()
    .pipe(z.literal(true, "You need to agree to continue.")),
});

// One branch per category, so a sponsor only exists where one is asked for and
// is dropped everywhere else.
const leadShape = z.discriminatedUnion(
  "category",
  [
    leadFields.extend({
      category: z.literal(Category.FamilyOnly),
      sponsor: sponsorSchema,
    }),
    leadFields.extend({
      category: z.enum([Category.SelfOnly, Category.SelfAndFamily]),
    }),
  ],
  "Choose who you're buying for."
);

export const leadSchema = leadShape
  .superRefine(
    // Reads only which members are present, so it runs on step 1 while their
    // details are still blank. Its errors show under the category cards.
    ({ category, members }, ctx) => {
      const issue = (path: PropertyKey[], message: string) =>
        ctx.addIssue({ code: "custom", path, message });

      if (category === Category.SelfOnly && hasFamily(members)) {
        issue(["category"], "Self Only covers just you.");
      }

      if (category !== Category.SelfOnly && !hasFamily(members)) {
        issue(["category"], "Choose at least one family member.");
      }

      if (coversSelf(category) !== (members.self !== undefined)) {
        issue(["category"], "Choose who you're buying for again.");
      }
    },
    { when: sectionsValid("category") }
  )
  .superRefine(
    ({ members: { self, spouse, children } }, ctx) => {
      const path = ["members", "self", "maritalStatus"];

      if (self && spouse && self.maritalStatus !== MaritalStatus.Married) {
        ctx.addIssue({
          code: "custom",
          path,
          message: "You're covering a spouse, so choose Married.",
        });
      }

      if (
        self &&
        children.length > 0 &&
        self.maritalStatus === MaritalStatus.Single
      ) {
        ctx.addIssue({
          code: "custom",
          path,
          message: "Children can't be covered when you're single.",
        });
      }
    },
    { when: sectionsValid("category", "members") }
  )
  .superRefine(
    ({ members, hasPed }, ctx) => {
      const entries = listMembers(members);

      for (const entry of entries) {
        const { path, age, member } = entry;
        const at = (field: string) => ["members", ...path, field];

        if (!hasPed && member.conditions.length > 0) {
          ctx.addIssue({
            code: "custom",
            path: at("conditions"),
            message: "Remove conditions, or answer Yes above.",
          });
        }

        if (age === undefined) {
          continue;
        }

        if (asksSmoker(age) && member.smoker === undefined) {
          ctx.addIssue({
            code: "custom",
            path: at("smoker"),
            message: answerThis,
          });
        }

        if (asksPregnancy({ ...entry, age }) && member.pregnant === undefined) {
          ctx.addIssue({
            code: "custom",
            path: at("pregnant"),
            message: answerThis,
          });
        }
      }

      const noneTicked = entries.every(
        ({ member }) => member.conditions.length === 0
      );

      if (hasPed && noneTicked) {
        ctx.addIssue({
          code: "custom",
          path: ["hasPed"],
          message: "Select at least one condition, or answer No.",
        });
      }
    },
    { when: sectionsValid("category", "members", "hasPed") }
  )
  .transform((lead) => ({
    ...lead,
    members: pruneHealthAnswers(lead.members),
  }));

export const submissionSchema = z
  .object({
    lead: leadSchema,
    turnstileToken: z
      .string()
      .min(1)
      .max(2048)
      .optional()
      .describe(
        "Absent when Turnstile is switched off in the web app; the API decides if it's required."
      ),
    website: z
      .string()
      .max(0)
      .describe("Honeypot: hidden from people, so it must be empty."),
    startedAt: z
      .number()
      .int()
      .positive()
      .describe("Epoch ms when the form was first shown."),
  })
  .describe(
    "What the browser POSTs to /api/lead: the lead plus anti-abuse fields."
  );

export type LeadInput = z.input<typeof leadSchema>;
export type Lead = z.output<typeof leadSchema>;
export type Submission = z.input<typeof submissionSchema>;

/** The person the lead belongs to: self, or the sponsor under Family without Self. */
export const leadHolder = (
  lead: Lead
): Pick<Sponsor, "firstName" | "middleName" | "lastName"> | undefined =>
  lead.category === Category.FamilyOnly ? lead.sponsor : lead.members.self;

/** The sponsor, who only exists under Family without Self. */
export const leadSponsor = (lead: Lead): Sponsor | undefined =>
  lead.category === Category.FamilyOnly ? lead.sponsor : undefined;

export const submitResponseSchema = z
  .discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), reference: z.string() }),
    z.object({
      ok: z.literal(false),
      error: z.enum(["invalid", "verification_failed", "unavailable"]),
    }),
  ])
  .describe(
    "What /api/lead answers. Parsed by the browser, so the shape is checked both ways."
  );

export type SubmitResponse = z.infer<typeof submitResponseSchema>;
export type SubmitError = Extract<SubmitResponse, { ok: false }>["error"];
