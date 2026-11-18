import { z } from "zod";

import { COUNTRY_CODES } from "./countries.ts";
import {
  AGE_LIMITS,
  Condition,
  Emirate,
  Gender,
  MaritalStatus,
  MAX_CHILDREN,
  Relation,
  SalaryBand,
} from "./options.ts";

/** UAE mobile: optional +971 / 00971 / 971 / 0 prefix, then 5[024568] and 7 digits. */
const UAE_MOBILE = /^(?:\+?971|00971|0)?(?<local>5[024568]\d{7})$/u;
const NAME = /^[\p{L}\p{M}][\p{L}\p{M}' .-]*$/u;
const ADULT_AGE = 18;
const PREGNANCY_MAX_AGE = 55;

export const normalizeUaeMobile = (raw: string): string | null => {
  const local = raw.replaceAll(/[\s()-]/gu, "").match(UAE_MOBILE)
    ?.groups?.local;
  return local ? `+971${local}` : null;
};

// Proposer (step 1)

export const proposerSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Enter your full name.")
    .max(80, "Use 80 characters or fewer.")
    .regex(NAME, "Use letters, spaces, apostrophes, dots or hyphens only."),
  mobile: z.string().transform((value, ctx) => {
    const normalized = normalizeUaeMobile(value);
    if (!normalized) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a UAE mobile number starting with 5, e.g. 50 123 4567.",
      });
      return z.NEVER;
    }
    return normalized;
  }),
  email: z
    .union([
      z.literal(""),
      z.email("Check the email address, or leave it blank.").max(254),
    ])
    .optional()
    .transform((value) => value || undefined),
  nationality: z.enum(COUNTRY_CODES, "Choose your nationality."),
  emirate: z.enum(Emirate, "Choose the emirate that issued your visa."),
  salaryBand: z.enum(SalaryBand, "Choose your monthly salary."),
  gender: z.enum(Gender, "Choose your gender."),
  maritalStatus: z.enum(MaritalStatus, "Choose your marital status."),
});

export type Proposer = z.output<typeof proposerSchema>;

// Members: the shape itself enforces one self, at most one spouse/father/mother and up to 4 children.

/** Per-relation age. Form inputs give strings; "" fails as missing rather than 0. */
const ageFor = (relation: Relation) => {
  const { min, max } = AGE_LIMITS[relation];
  const range = `Enter an age from ${min} to ${max}.`;
  return z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z.coerce
      .number<unknown>("Enter an age.")
      .int("Enter a whole number.")
      .min(min, range)
      .max(max, range)
  );
};

// `.optional().pipe(required)`: optional in the input type, so the form can hold a
// blank member, but required in the parsed output, with the message shown when missing.
const genderChoice = z
  .enum(Gender)
  .optional()
  .pipe(z.enum(Gender, "Choose a gender."));
const answer = z.boolean().optional().pipe(z.boolean("Answer this question."));
const conditions = z
  .array(z.enum(Condition))
  .default([])
  .transform((list) => [...new Set(list)]);

// Self's gender comes from the proposer, and father/mother have a fixed gender,
// so only spouse and child carry one. Every relation except child is always an
// adult, so smoker is required by the shape; pregnancy depends on gender and age
// (checked below).
export const membersSchema = z.object({
  self: z.object({
    age: ageFor(Relation.Self),
    conditions,
    smoker: answer,
    pregnant: z.boolean().optional(),
  }),
  spouse: z
    .object({
      age: ageFor(Relation.Spouse),
      gender: genderChoice,
      conditions,
      smoker: answer,
      pregnant: z.boolean().optional(),
    })
    .optional(),
  children: z
    .array(
      z.object({
        age: ageFor(Relation.Child),
        gender: genderChoice,
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
  member: MemberValue<T>;
}

/** Members in display order: self, spouse, children, father, mother. */
export const listMembers = <T extends AnyMembers>(
  members: T,
  proposerGender: Gender | undefined
): MemberEntry<T>[] => {
  const entries: MemberEntry<T>[] = [
    {
      relation: Relation.Self,
      path: ["self"],
      gender: proposerGender,
      member: members.self,
    },
  ];
  if (members.spouse) {
    entries.push({
      relation: Relation.Spouse,
      path: ["spouse"],
      gender: members.spouse.gender,
      member: members.spouse,
    });
  }
  for (const [i, child] of (members.children ?? []).entries()) {
    entries.push({
      relation: Relation.Child,
      path: ["children", i],
      childNo: i + 1,
      gender: child.gender,
      member: child,
    });
  }
  if (members.father) {
    entries.push({
      relation: Relation.Father,
      path: ["father"],
      gender: Gender.Male,
      member: members.father,
    });
  }
  if (members.mother) {
    entries.push({
      relation: Relation.Mother,
      path: ["mother"],
      gender: Gender.Female,
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

// Cross-field rules the shape can't express.

type Ctx = z.RefinementCtx;

/** Spouse and children need marital status Married. */
const checkMarriedOnly = (proposer: Proposer, members: Members, ctx: Ctx) => {
  if (
    proposer.maritalStatus !== MaritalStatus.Married &&
    (members.spouse !== undefined || members.children.length > 0)
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["members"],
      message:
        "Spouse and children can only be added when marital status is Married.",
    });
  }
};

/** PED gate vs conditions, smoker for adult children, pregnancy when eligible. */
const checkHealth = (
  proposer: Proposer,
  members: Members,
  hasPed: boolean,
  ctx: Ctx
) => {
  const entries = listMembers(members, proposer.gender);
  for (const { relation, path, gender, member } of entries) {
    const at = (field: string) => ["members", ...path, field];
    if (!hasPed && member.conditions.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: at("conditions"),
        message: "Remove conditions, or answer Yes above.",
      });
    }
    if (asksSmoker(relation, member.age) && member.smoker === undefined) {
      ctx.addIssue({
        code: "custom",
        path: at("smoker"),
        message: "Answer this question.",
      });
    }
    const pregnant = "pregnant" in member ? member.pregnant : undefined;
    if (
      asksPregnancy(relation, gender, member.age, proposer.maritalStatus) &&
      pregnant === undefined
    ) {
      ctx.addIssue({
        code: "custom",
        path: at("pregnant"),
        message: "Answer this question.",
      });
    }
  }
  if (hasPed && entries.every(({ member }) => member.conditions.length === 0)) {
    ctx.addIssue({
      code: "custom",
      path: ["hasPed"],
      message: "Select at least one condition, or answer No.",
    });
  }
};

// Lead and submission

/** The complete lead, as submitted from step 3 and re-validated by the API. */
export const leadSchema = z
  .object({
    proposer: proposerSchema,
    members: membersSchema,
    hasPed: z.boolean("Answer this question."),
    consent: z.literal(true, "You need to agree to continue."),
  })
  .superRefine(({ proposer, members, hasPed }, ctx) => {
    checkMarriedOnly(proposer, members, ctx);
    checkHealth(proposer, members, hasPed, ctx);
  });

/** What the browser POSTs to /api/lead: the lead plus anti-abuse fields. */
export const submissionSchema = z.object({
  lead: leadSchema,
  turnstileToken: z.string().min(1).max(2048),
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
