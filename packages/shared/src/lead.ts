import { z } from "zod";

import { COUNTRY_CODES } from "./countries.ts";
import { addDays, addYears, ageFromDob, todayInDubai } from "./dates.ts";
import {
  AGE_LIMITS,
  Condition,
  Emirate,
  Gender,
  IncomeRange,
  MaritalStatus,
  MAX_CHILDREN,
  Occupation,
  Relation,
} from "./options.ts";

const UAE_MOBILE = /^(?:\+?971|00971|0)?(?<local>5[024568]\d{7})$/u;
const EMIRATES_ID = /^784\d{12}$/u;
const VISA_FILE_NUMBER = /^\d{3}\/\d{4}(?:\/\d)?\/\d{2,7}$/u;
const PASSPORT_NUMBER = /^[A-Z0-9]{5,20}$/u;

// Name rules as the insurer forms define them.
const SINGLE_NAME = /^(?=.{2,40}$)[a-zA-Z]+\.?$/u;
const MIDDLE_NAME = /^(?=.{1,100}$)[a-zA-Z]*(?:[a-zA-Z-]+\.? )*?[a-zA-Z]+\.?$/u;

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

/** Allowed date ranges, relative to today in Dubai. The form's calendars use these too. */
export const DATE_WINDOWS = {
  dateOfBirth: (today) => ({
    from: addDays(addYears(today, -(AGE_LIMITS.self.max + 1)), 1),
    to: addYears(today, -AGE_LIMITS.self.min),
  }),
  policyStart: (today) => ({ from: today, to: addDays(today, 30) }),
  previousPolicyExpiry: (today) => ({
    from: addYears(today, -10),
    to: addYears(today, 2),
  }),
  emiratesIdExpiry: (today) => ({ from: today, to: addDays(today, 3650) }),
} satisfies Record<string, DateWindow>;

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
const wholeNumber = (min: number, max: number, label: string) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.coerce
      .number<unknown>(`Enter ${label}.`)
      .int("Enter a whole number.")
      .min(min, `Enter ${label} from ${min} to ${max}.`)
      .max(max, `Enter ${label} from ${min} to ${max}.`)
  );

// `.optional().pipe(required)`: optional in the input type so the form can start blank,
// required in the parsed output with the message shown when it's missing.
const choice = <T extends Record<string, string>>(values: T, message: string) =>
  z.enum(values).optional().pipe(z.enum(values, message));

const answer = z.boolean().optional().pipe(z.boolean(answerThis));

// Step 1: about you.
export const proposerSchema = z.object({
  firstName: text(SINGLE_NAME, "Enter your first name.", "Use letters only."),
  middleName: z
    .string()
    .trim()
    .regex(MIDDLE_NAME, "Use letters, spaces or hyphens only.")
    .or(z.literal(""))
    .optional()
    .transform((value) => value || undefined),
  lastName: text(SINGLE_NAME, "Enter your last name.", "Use letters only."),
  dateOfBirth: dateWithin(
    DATE_WINDOWS.dateOfBirth,
    `You need to be ${AGE_LIMITS.self.min} to ${AGE_LIMITS.self.max} years old.`
  ),
  gender: choice(Gender, "Choose your gender."),
  maritalStatus: choice(MaritalStatus, "Choose your marital status."),
  nationality: z.enum(COUNTRY_CODES, "Choose your nationality."),
  email: z
    .email("Enter a valid email address, e.g. name@example.com.")
    .max(254),
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
});

export type Proposer = z.output<typeof proposerSchema>;

// Step 2: who's covered. The shape enforces one self, at most one spouse/father/mother
// and up to 4 children. Self's age and gender come from the proposer.
const ageFor = (relation: Exclude<Relation, typeof Relation.Self>) =>
  wholeNumber(AGE_LIMITS[relation].min, AGE_LIMITS[relation].max, "an age");

const conditions = z
  .array(z.enum(Condition))
  .default([])
  .transform((list) => [...new Set(list)]);

export const membersSchema = z.object({
  self: z.object({
    conditions,
    smoker: answer,
    pregnant: z.boolean().optional(),
  }),
  spouse: z
    .object({
      age: ageFor(Relation.Spouse),
      gender: choice(Gender, "Choose a gender."),
      conditions,
      smoker: answer,
      pregnant: z.boolean().optional(),
    })
    .optional(),
  children: z
    .array(
      z.object({
        age: ageFor(Relation.Child),
        gender: choice(Gender, "Choose a gender."),
        conditions,
        smoker: z.boolean().optional(),
      })
    )
    .max(MAX_CHILDREN, `Add up to ${MAX_CHILDREN} children.`)
    .default([]),
  father: z
    .object({ age: ageFor(Relation.Father), conditions, smoker: answer })
    .optional(),
  mother: z
    .object({ age: ageFor(Relation.Mother), conditions, smoker: answer })
    .optional(),
});

export type Members = z.output<typeof membersSchema>;
export type MembersInput = z.input<typeof membersSchema>;

// Step 3: the proposer's height and weight (health questions live on the members).
export const measurementsSchema = z.object({
  heightCm: wholeNumber(50, 250, "your height in cm"),
  weightKg: wholeNumber(10, 300, "your weight in kg"),
});

// Step 4: the policy wanted, then residency and identity documents.
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
  .and(previousPolicySchema);

// "I don't have an Emirates ID, only an e-visa" decides which ID is asked.
const identitySchema = z.discriminatedUnion(
  "eVisaOnly",
  [
    z.object({
      eVisaOnly: z.literal(false),
      emiratesId: z.string().transform((value, ctx) => {
        const normalized = normalizeEmiratesId(value);
        if (normalized) {
          return normalized;
        }

        ctx.addIssue({
          code: "custom",
          message: "Enter the 15-digit Emirates ID starting with 784.",
        });

        return z.NEVER;
      }),
      emiratesIdExpiry: dateWithin(
        DATE_WINDOWS.emiratesIdExpiry,
        "Enter an expiry date that hasn't passed."
      ),
    }),
    z.object({
      eVisaOnly: z.literal(true),
      uidNumber: text(
        /^\d{1,18}$/u,
        "Enter your UID number.",
        "Use digits only, up to 18."
      ),
    }),
  ],
  answerThis
);

export const residencySchema = z
  .object({
    emirate: choice(Emirate, "Choose the emirate that issued your visa."),
    visaFileNumber: text(
      VISA_FILE_NUMBER,
      "Enter your visa file number.",
      "Use the format 201/2020/1234567."
    ),
    passportNumber: z
      .string("Enter your passport number.")
      .trim()
      .toUpperCase()
      .regex(PASSPORT_NUMBER, "Use 5–20 letters and digits."),
    sponsorFirstName: text(
      SINGLE_NAME,
      "Enter your sponsor's first name.",
      "Use letters only."
    ),
    sponsorLastName: z
      .string("Enter your sponsor's last name.")
      .trim()
      .min(1, "Enter your sponsor's last name.")
      .max(40),
  })
  .and(identitySchema);

// Ordered member list shared by the form, the rules below and the Sheet rows.
type AnyMembers = Members | MembersInput;

/** Any one member's value within a members object. */
export type MemberValue<T extends AnyMembers> =
  | T["self"]
  | NonNullable<T["spouse"] | T["father"] | T["mother"]>
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
  gender: Gender | undefined;
  /** Self's age comes from the date of birth; undefined while not yet valid. */
  age: number | undefined;
  member: MemberValue<T>;
}

const toAge = (age: unknown): number | undefined => {
  const n = typeof age === "string" && age.trim() !== "" ? Number(age) : age;

  return typeof n === "number" && Number.isInteger(n) ? n : undefined;
};

/** Members in display order: self, spouse, children, father, mother. */
export const listMembers = <T extends AnyMembers>(
  members: T,
  proposer: { gender?: Gender; dateOfBirth?: Date | string }
): MemberEntry<T>[] => {
  const entries: MemberEntry<T>[] = [
    {
      relation: Relation.Self,
      path: ["self"],
      gender: proposer.gender,
      age: ageFromDob(proposer.dateOfBirth),
      member: members.self,
    },
  ];

  if (members.spouse) {
    entries.push({
      relation: Relation.Spouse,
      path: ["spouse"],
      gender: members.spouse.gender,
      age: toAge(members.spouse.age),
      member: members.spouse,
    });
  }

  for (const [i, child] of (members.children ?? []).entries()) {
    entries.push({
      relation: Relation.Child,
      path: ["children", i],
      childNo: i + 1,
      gender: child.gender,
      age: toAge(child.age),
      member: child,
    });
  }

  if (members.father) {
    entries.push({
      relation: Relation.Father,
      path: ["father"],
      gender: Gender.Male,
      age: toAge(members.father.age),
      member: members.father,
    });
  }

  if (members.mother) {
    entries.push({
      relation: Relation.Mother,
      path: ["mother"],
      gender: Gender.Female,
      age: toAge(members.mother.age),
      member: members.mother,
    });
  }

  return entries;
};

/** Smoker is asked for adults; only children can be under 18. */
export const asksSmoker = (relation: Relation, age: number): boolean =>
  relation !== Relation.Child || age >= ADULT_AGE;

/** Pregnancy is asked for a married female proposer or a female spouse, 18–55. */
export const asksPregnancy = (
  relation: Relation,
  gender: Gender | undefined,
  age: number,
  maritalStatus: MaritalStatus | undefined
): boolean =>
  gender === Gender.Female &&
  age >= ADULT_AGE &&
  age <= PREGNANCY_MAX_AGE &&
  (relation === Relation.Spouse ||
    (relation === Relation.Self && maritalStatus === MaritalStatus.Married));

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

const leadShape = z.object({
  proposer: proposerSchema,
  members: membersSchema,
  hasPed: z.boolean(answerThis),
  measurements: measurementsSchema,
  policy: policySchema,
  residency: residencySchema,
  consent: z.literal(true, "You need to agree to continue."),
});

export const leadSchema = leadShape
  .superRefine(
    ({ proposer, members }, ctx) => {
      const hasMarriedOnly =
        members.spouse !== undefined || members.children.length > 0;

      if (proposer.maritalStatus !== MaritalStatus.Married && hasMarriedOnly) {
        ctx.addIssue({
          code: "custom",
          path: ["members"],
          message:
            "Spouse and children can only be added when marital status is Married.",
        });
      }
    },
    { when: sectionsValid("proposer", "members") }
  )
  .superRefine(
    ({ proposer, members, hasPed }, ctx) => {
      const entries = listMembers(members, proposer);

      for (const { relation, path, gender, age, member } of entries) {
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

        if (asksSmoker(relation, age) && member.smoker === undefined) {
          ctx.addIssue({
            code: "custom",
            path: at("smoker"),
            message: answerThis,
          });
        }

        const pregnant = "pregnant" in member ? member.pregnant : undefined;
        const asked = asksPregnancy(
          relation,
          gender,
          age,
          proposer.maritalStatus
        );

        if (asked && pregnant === undefined) {
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
    { when: sectionsValid("proposer", "members", "hasPed") }
  );

/** What the browser POSTs to /api/lead: the lead plus anti-abuse fields. */
export const submissionSchema = z.object({
  lead: leadSchema,
  /** Absent when Turnstile is switched off in the web app; the API decides if it's required. */
  turnstileToken: z.string().min(1).max(2048).optional(),
  /** Honeypot: hidden from people, so it must be empty. */
  website: z.string().max(0),
  /** Epoch ms when the form was first shown. */
  startedAt: z.number().int().positive(),
});

export type LeadInput = z.input<typeof leadSchema>;
export type Lead = z.output<typeof leadSchema>;
export type Submission = z.input<typeof submissionSchema>;

/** What /api/lead answers. Parsed by the browser, so the shape is checked both ways. */
export const submitResponseSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), reference: z.string() }),
  z.object({
    ok: z.literal(false),
    error: z.enum(["invalid", "verification_failed", "unavailable"]),
  }),
]);

export type SubmitResponse = z.infer<typeof submitResponseSchema>;
export type SubmitError = Extract<SubmitResponse, { ok: false }>["error"];
