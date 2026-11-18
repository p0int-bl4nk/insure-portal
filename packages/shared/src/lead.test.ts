import { describe, expect, it } from "vitest";

import { leadSchema, normalizeUaeMobile } from "./lead.ts";
import type { LeadInput } from "./lead.ts";

const validLead = (): LeadInput => ({
  proposer: {
    fullName: "Rahul Menon",
    mobile: "50 123 4567",
    email: "",
    nationality: "IN",
    emirate: "dubai",
    salaryBand: "above_4000",
    gender: "male",
    maritalStatus: "married",
  },
  members: [
    {
      relation: "self",
      age: 34,
      gender: "male",
      conditions: ["diabetes"],
      smoker: false,
    },
    {
      relation: "spouse",
      age: 31,
      gender: "female",
      conditions: [],
      smoker: false,
      pregnant: false,
    },
    { relation: "child", age: 4, gender: "male", conditions: [] },
  ],
  hasPed: true,
  consent: true,
});

type MemberInput = LeadInput["members"][number];

/** Returns a copy of the lead with one member patched and optional fields removed. */
const patchMember = (
  input: LeadInput,
  index: number,
  patch: Partial<MemberInput>,
  drop: ("smoker" | "pregnant")[] = []
): LeadInput => ({
  ...input,
  members: input.members.map((member, i) => {
    if (i !== index) {
      return member;
    }
    const { smoker, pregnant, ...rest } = { ...member, ...patch };
    return {
      ...rest,
      ...(drop.includes("smoker") ? {} : { smoker }),
      ...(drop.includes("pregnant") ? {} : { pregnant }),
    };
  }),
});

const issuePaths = (input: LeadInput) => {
  const result = leadSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.path.join("."));
};

describe(normalizeUaeMobile, () => {
  it.each([
    ["50 123 4567", "+971501234567"],
    ["0501234567", "+971501234567"],
    ["+971 55 123 4567", "+971551234567"],
    ["00971581234567", "+971581234567"],
  ])("normalises %s", (raw, expected) => {
    expect(normalizeUaeMobile(raw)).toBe(expected);
  });

  it.each(["41 234 567", "0511234567", "50123456", "+44 7700 900123"])(
    "rejects %s",
    (raw) => {
      expect(normalizeUaeMobile(raw)).toBeNull();
    }
  );
});

describe("lead schema", () => {
  it("accepts a valid lead and normalises fields", () => {
    const lead = leadSchema.parse(validLead());
    expect(lead.proposer.mobile).toBe("+971501234567");
    expect(lead.proposer.email).toBeUndefined();
  });

  it("requires exactly one self", () => {
    const input = validLead();
    input.members = input.members.filter((m) => m.relation !== "self");
    expect(issuePaths(input)).toContain("members");
  });

  it("rejects a spouse when the proposer is single", () => {
    const input = validLead();
    input.proposer.maritalStatus = "single";
    expect(issuePaths(input)).toContain("proposer.maritalStatus");
  });

  it("enforces per-relation age limits", () => {
    const input = patchMember(validLead(), 2, { age: 30 });
    expect(issuePaths(input)).toContain("members.2.age");
  });

  it("requires the smoker answer for adults only", () => {
    const input = patchMember(patchMember(validLead(), 0, {}, ["smoker"]), 2, {
      smoker: false,
    });
    expect(issuePaths(input)).toStrictEqual(
      expect.arrayContaining(["members.0.smoker", "members.2.smoker"])
    );
  });

  it("asks pregnancy only for eligible members", () => {
    const input = patchMember(
      patchMember(validLead(), 1, {}, ["pregnant"]),
      0,
      { pregnant: false }
    );
    expect(issuePaths(input)).toStrictEqual(
      expect.arrayContaining(["members.1.pregnant", "members.0.pregnant"])
    );
  });

  it("ties conditions to the PED gate", () => {
    const yesWithoutConditions = patchMember(validLead(), 0, {
      conditions: [],
    });
    expect(issuePaths(yesWithoutConditions)).toContain("hasPed");

    const noWithConditions = validLead();
    noWithConditions.hasPed = false;
    expect(issuePaths(noWithConditions)).toContain("members.0.conditions");
  });

  it("treats an empty age as missing, not zero", () => {
    const input = patchMember(validLead(), 2, { age: "" });
    expect(issuePaths(input)).toContain("members.2.age");
  });

  it("requires consent", () => {
    const input = validLead() as Record<string, unknown>;
    input.consent = false;
    expect(issuePaths(input as LeadInput)).toContain("consent");
  });
});
