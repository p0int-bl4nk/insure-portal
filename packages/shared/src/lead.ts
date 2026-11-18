import { z } from "zod";

import { COUNTRY_CODES } from "./countries.ts";
import {
  AGE_LIMITS,
  CONDITIONS,
  EMIRATES,
  GENDERS,
  MARITAL_STATUSES,
  MAX_CHILDREN,
  RELATION_LABELS,
  RELATIONS,
  SALARY_BANDS,
} from "./options.ts";
import type { MaritalStatus, Relation } from "./options.ts";

/** UAE mobile: optional +971 / 00971 / 971 / 0 prefix, then 5[024568] and 7 digits. */
const UAE_MOBILE = /^(?:\+?971|00971|0)?(?<local>5[024568]\d{7})$/u;
const NAME = /^[\p{L}\p{M}][\p{L}\p{M}' .-]*$/u;

export const normalizeUaeMobile = (raw: string): string | null => {
  const local = raw.replaceAll(/[\s()-]/gu, "").match(UAE_MOBILE)
    ?.groups?.local;
  return local ? `+971${local}` : null;
};

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
  emirate: z.enum(EMIRATES, "Choose the emirate that issued your visa."),
  salaryBand: z.enum(SALARY_BANDS, "Choose your monthly salary."),
  gender: z.enum(GENDERS, "Choose your gender."),
  maritalStatus: z.enum(MARITAL_STATUSES, "Choose your marital status."),
});

export const memberSchema = z.object({
  relation: z.enum(RELATIONS),
  // Form inputs give strings; "" must fail as missing rather than coerce to 0.
  age: z.preprocess(
    (value) => {
      if (typeof value !== "string") {
        return value;
      }
      return value.trim() === "" ? undefined : Number(value);
    },
    z
      .number("Enter an age.")
      .int("Enter a whole number.")
      .min(0, "Enter an age.")
      .max(99, "Enter an age under 100.")
  ),
  gender: z.enum(GENDERS, "Choose a gender."),
  conditions: z.array(z.enum(CONDITIONS)).default([]),
  smoker: z.boolean().optional(),
  pregnant: z.boolean().optional(),
});

interface MemberLike {
  relation: Relation;
  age: number;
  gender: string;
}

export const isAdult = (member: Pick<MemberLike, "age">): boolean =>
  member.age >= 18;

/** Pregnancy is asked for married female members of child-bearing age. */
export const isPregnancyEligible = (
  member: MemberLike,
  proposerMaritalStatus: MaritalStatus | undefined
): boolean =>
  member.gender === "female" &&
  member.age >= 18 &&
  member.age <= 55 &&
  (member.relation === "spouse" ||
    (member.relation === "self" && proposerMaritalStatus === "married"));

const SINGLE_RELATIONS: Relation[] = [
  "self",
  "spouse",
  "father",
  "mother",
  "domestic_worker",
];

type RefineCtx = z.RefinementCtx;
type ProposerOut = z.output<typeof proposerSchema>;
type MemberOut = z.output<typeof memberSchema>;

const issue = (ctx: RefineCtx, path: (string | number)[], message: string) =>
  ctx.addIssue({ code: "custom", path, message });

/** Who is covered: counts, ages, self gender, spouse needs Married. Checked from step 2. */
const checkComposition = (
  proposer: ProposerOut,
  members: MemberOut[],
  ctx: RefineCtx
) => {
  const count = (relation: Relation) =>
    members.filter((m) => m.relation === relation).length;

  if (count("self") !== 1) {
    issue(ctx, ["members"], "Include yourself.");
  }
  for (const relation of SINGLE_RELATIONS) {
    if (count(relation) > 1) {
      issue(
        ctx,
        ["members"],
        `Add ${RELATION_LABELS[relation].toLowerCase()} only once.`
      );
    }
  }
  if (count("child") > MAX_CHILDREN) {
    issue(ctx, ["members"], `Add up to ${MAX_CHILDREN} children.`);
  }
  if (count("spouse") > 0 && proposer.maritalStatus !== "married") {
    issue(
      ctx,
      ["proposer", "maritalStatus"],
      "Choose Married to cover a spouse."
    );
  }
  for (const [i, member] of members.entries()) {
    const limits = AGE_LIMITS[member.relation];
    if (member.age < limits.min || member.age > limits.max) {
      issue(
        ctx,
        ["members", i, "age"],
        `Enter an age from ${limits.min} to ${limits.max}.`
      );
    }
    if (member.relation === "self" && member.gender !== proposer.gender) {
      issue(
        ctx,
        ["members", i, "gender"],
        "Must match the gender you chose in step 1."
      );
    }
  }
};

/** Health answers: PED gate vs conditions, smoker for adults, pregnancy when eligible. */
const checkHealth = (
  proposer: ProposerOut,
  members: MemberOut[],
  hasPed: boolean,
  ctx: RefineCtx
) => {
  for (const [i, member] of members.entries()) {
    const at = (field: string) => ["members", i, field];
    if (new Set(member.conditions).size !== member.conditions.length) {
      issue(ctx, at("conditions"), "Duplicate condition.");
    }
    if (!hasPed && member.conditions.length > 0) {
      issue(ctx, at("conditions"), "Remove conditions, or answer Yes above.");
    }
    if (isAdult(member) !== (member.smoker !== undefined)) {
      issue(
        ctx,
        at("smoker"),
        isAdult(member) ? "Answer this question." : "Not asked for under-18s."
      );
    }
    const pregnancyAsked = isPregnancyEligible(member, proposer.maritalStatus);
    if (pregnancyAsked !== (member.pregnant !== undefined)) {
      issue(
        ctx,
        at("pregnant"),
        pregnancyAsked ? "Answer this question." : "Not asked for this member."
      );
    }
  }
  if (hasPed && members.every((m) => m.conditions.length === 0)) {
    issue(ctx, ["hasPed"], "Select at least one condition, or answer No.");
  }
};

const membersArray = z
  .array(memberSchema)
  .min(1)
  .max(5 + MAX_CHILDREN);

/** Wizard step 1: about you. */
export const aboutStepSchema = z.object({ proposer: proposerSchema });

/** Wizard step 2: who to insure (health answers not checked yet). */
export const membersStepSchema = z
  .object({ proposer: proposerSchema, members: membersArray })
  .superRefine(({ proposer, members }, ctx) =>
    checkComposition(proposer, members, ctx)
  );

/** The complete lead, as submitted from step 3 and re-validated by the API. */
export const leadSchema = z
  .object({
    proposer: proposerSchema,
    members: membersArray,
    hasPed: z.boolean("Answer this question."),
    consent: z.literal(true, "You need to agree to continue."),
  })
  .superRefine(({ proposer, members, hasPed }, ctx) => {
    checkComposition(proposer, members, ctx);
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
export type Member = z.output<typeof memberSchema>;
export type Submission = z.input<typeof submissionSchema>;

export type SubmitResponse =
  | { ok: true; reference: string }
  | { ok: false; error: "invalid" | "verification_failed" | "unavailable" };
