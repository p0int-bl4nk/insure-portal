import { describe, expect, it } from "vitest";

import {
  addDays,
  addYears,
  ageFromDob,
  formatDmy,
  toDate,
  todayInDubai,
} from "./dates.ts";
import {
  leadSchema,
  listMembers,
  normalizeEmiratesId,
  normalizeUaeMobile,
} from "./lead.ts";
import type { LeadInput } from "./lead.ts";
import {
  Condition,
  Emirate,
  Gender,
  IncomeRange,
  MaritalStatus,
  Occupation,
  Relation,
} from "./options.ts";

const today = todayInDubai();
const dobAged = (years: number) => addYears(today, -years);

const validLead = (): LeadInput => ({
  proposer: {
    firstName: "Rahul",
    middleName: "",
    lastName: "Menon",
    dateOfBirth: dobAged(34),
    gender: Gender.Male,
    maritalStatus: MaritalStatus.Married,
    nationality: "IN",
    email: "rahul@example.com",
    mobile: "50 123 4567",
  },
  members: {
    self: { conditions: [Condition.Diabetes], smoker: false },
    spouse: {
      age: 31,
      gender: Gender.Female,
      conditions: [],
      smoker: false,
      pregnant: false,
    },
    children: [{ age: 4, gender: Gender.Male, conditions: [] }],
  },
  hasPed: true,
  measurements: { heightCm: "175", weightKg: "72" },
  policy: {
    startDate: addDays(today, 7),
    incomeRange: IncomeRange.From10001To20000,
    occupation: Occupation.Salaried,
    hasPreviousPolicy: false,
  },
  residency: {
    emirate: Emirate.Dubai,
    visaFileNumber: "201/2020/1234567",
    passportNumber: "p1234567",
    sponsorFirstName: "Acme",
    sponsorLastName: "Trading LLC",
    eVisaOnly: false,
    emiratesId: "784-1990-1234567-1",
    emiratesIdExpiry: addYears(today, 2),
  },
  consent: true,
});

const issuePaths = (input: unknown) => {
  const result = leadSchema.safeParse(input);

  return result.success ? [] : result.error.issues.map((i) => i.path.join("."));
};

describe(normalizeUaeMobile, () => {
  it.each([
    ["50 123 4567", "+971501234567"],
    ["0501234567", "+971501234567"],
    ["+971 55 123 4567", "+971551234567"],
  ])("normalises %s", (raw, expected) => {
    expect(normalizeUaeMobile(raw)).toBe(expected);
  });

  it.each(["41 234 567", "0511234567", "+44 7700 900123"])(
    "rejects %s",
    (raw) => {
      expect(normalizeUaeMobile(raw)).toBeNull();
    }
  );
});

describe(normalizeEmiratesId, () => {
  it("accepts 15 digits starting with 784, with any separators", () => {
    expect(normalizeEmiratesId("784-1990-1234567-1")).toBe("784199012345671");
    expect(normalizeEmiratesId("123-1990-1234567-1")).toBeNull();
    expect(normalizeEmiratesId("784-1990-123")).toBeNull();
  });
});

describe("dates", () => {
  it("reads dates from Date objects and JSON strings", () => {
    const date = new Date("1990-12-31T00:00:00Z");

    expect(toDate(date)).toStrictEqual(date);
    expect(toDate(date.toISOString())).toStrictEqual(date);
    expect(toDate("not a date")).toBeUndefined();
    expect(formatDmy(date)).toBe("31/12/1990");
  });

  it("computes age from a date of birth", () => {
    expect(ageFromDob(dobAged(34))).toBe(34);
    expect(ageFromDob(addDays(addYears(today, -34), 1))).toBe(33);
  });
});

describe("lead schema", () => {
  it("accepts a valid lead and normalises fields", () => {
    const lead = leadSchema.parse(validLead());

    expect(lead.proposer.mobile).toBe("+971501234567");
    expect(lead.proposer.middleName).toBeUndefined();
    expect(lead.residency.passportNumber).toBe("P1234567");
    expect(lead.measurements.heightCm).toBe(175);
  });

  it("accepts dates sent as JSON strings", () => {
    const input = validLead();
    const sent = {
      ...input,
      proposer: { ...input.proposer, dateOfBirth: dobAged(34).toISOString() },
    };

    expect(leadSchema.safeParse(sent).success).toBeTruthy();
  });

  it("asks for a date when one is missing", () => {
    const input = validLead();
    input.proposer.dateOfBirth = undefined;

    expect(issuePaths(input)).toContain("proposer.dateOfBirth");
  });

  it("requires the proposer to be an adult", () => {
    const input = validLead();
    input.proposer.dateOfBirth = dobAged(17);

    expect(issuePaths(input)).toContain("proposer.dateOfBirth");
  });

  it("limits the policy start date to the next 30 days", () => {
    const input = validLead();
    input.policy.startDate = addDays(today, 31);

    expect(issuePaths(input)).toContain("policy.startDate");
  });

  it("asks for the previous policy's expiry only when there was one", () => {
    const input = validLead();

    expect(
      issuePaths({
        ...input,
        policy: { ...input.policy, hasPreviousPolicy: true },
      })
    ).toContain("policy.previousPolicyExpiry");
  });

  it("switches between Emirates ID and UID with the e-visa answer", () => {
    const input = validLead();
    const withResidency = (patch: object) => ({
      ...input,
      residency: { ...input.residency, ...patch },
    });

    expect(issuePaths(withResidency({ eVisaOnly: true }))).toContain(
      "residency.uidNumber"
    );
    expect(issuePaths(withResidency({ emiratesId: "123" }))).toContain(
      "residency.emiratesId"
    );
  });

  it("validates visa file numbers", () => {
    const input = validLead();
    input.residency = { ...input.residency, visaFileNumber: "2012020" };

    expect(issuePaths(input)).toContain("residency.visaFileNumber");
  });

  it("enforces per-relation age limits from the shape", () => {
    const input = validLead();
    input.members.children = [{ age: 30, gender: Gender.Male }];

    expect(issuePaths(input)).toContain("members.children.0.age");
  });

  it("rejects a spouse or children when the proposer is single", () => {
    const input = validLead();
    input.proposer.maritalStatus = MaritalStatus.Single;

    expect(issuePaths(input)).toContain("members");
  });

  it("runs health checks even while later steps are incomplete", () => {
    const input = validLead();
    input.members.children = [{ age: 20, gender: Gender.Male }];
    input.residency = { ...input.residency, visaFileNumber: "" };

    expect(issuePaths(input)).toStrictEqual(
      expect.arrayContaining([
        "members.children.0.smoker",
        "residency.visaFileNumber",
      ])
    );
  });

  it("asks pregnancy of a female spouse", () => {
    const input = validLead();
    if (input.members.spouse) {
      delete input.members.spouse.pregnant;
    }

    expect(issuePaths(input)).toStrictEqual(["members.spouse.pregnant"]);
  });

  it("ties conditions to the PED gate", () => {
    const input = validLead();
    input.members.self.conditions = [];

    expect(issuePaths(input)).toContain("hasPed");
  });
});

describe(listMembers, () => {
  it("lists members in order, with self's age from the date of birth", () => {
    const { members, proposer } = leadSchema.parse(validLead());

    expect(
      listMembers(members, proposer).map(({ relation, gender, age }) => [
        relation,
        gender,
        age,
      ])
    ).toStrictEqual([
      [Relation.Self, Gender.Male, 34],
      [Relation.Spouse, Gender.Female, 31],
      [Relation.Child, Gender.Male, 4],
    ]);
  });
});
