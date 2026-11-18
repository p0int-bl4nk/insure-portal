import { describe, expect, it } from "vitest";

import { leadSchema, listMembers, normalizeUaeMobile } from "./lead.ts";
import type { LeadInput } from "./lead.ts";
import {
  Condition,
  Emirate,
  Gender,
  MaritalStatus,
  Relation,
  SalaryBand,
} from "./options.ts";

const validLead = (): LeadInput => ({
  proposer: {
    fullName: "Rahul Menon",
    mobile: "50 123 4567",
    email: "",
    nationality: "IN",
    emirate: Emirate.Dubai,
    salaryBand: SalaryBand.Above4000,
    gender: Gender.Male,
    maritalStatus: MaritalStatus.Married,
  },
  members: {
    self: { age: 34, conditions: [Condition.Diabetes], smoker: false },
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
    expect(lead.members.children[0]?.age).toBe(4);
  });

  it("enforces per-relation age limits from the shape", () => {
    const input = validLead();
    input.members.children = [{ age: 30, gender: Gender.Male }];
    expect(issuePaths(input)).toContain("members.children.0.age");
  });

  it("treats an empty age as missing, not zero", () => {
    const input = validLead();
    input.members.children = [{ age: "", gender: Gender.Male }];
    expect(issuePaths(input)).toContain("members.children.0.age");
  });

  it("caps children at four", () => {
    const input = validLead();
    input.members.children = Array.from({ length: 5 }, () => ({
      age: 4,
      gender: Gender.Female,
    }));
    expect(issuePaths(input)).toContain("members.children");
  });

  it("rejects a spouse or children when the proposer is single", () => {
    const withSpouse = validLead();
    withSpouse.proposer.maritalStatus = MaritalStatus.Single;
    withSpouse.members.children = [];
    expect(issuePaths(withSpouse)).toContain("members");

    const withChild = validLead();
    withChild.proposer.maritalStatus = MaritalStatus.Single;
    delete withChild.members.spouse;
    expect(issuePaths(withChild)).toContain("members");
  });

  it("requires smoker for adult relations through the shape", () => {
    const input = validLead();
    input.members.self = { age: 34, conditions: [Condition.Diabetes] };
    expect(issuePaths(input)).toContain("members.self.smoker");
  });

  it("requires smoker for children aged 18 and over", () => {
    const input = validLead();
    input.members.children = [{ age: 20, gender: Gender.Male }];
    expect(issuePaths(input)).toStrictEqual(["members.children.0.smoker"]);
  });

  it("asks pregnancy of a female spouse but not a male proposer", () => {
    const input = validLead();
    if (input.members.spouse) {
      delete input.members.spouse.pregnant;
    }
    expect(issuePaths(input)).toStrictEqual(["members.spouse.pregnant"]);
  });

  it("ties conditions to the PED gate", () => {
    const yesWithoutConditions = validLead();
    yesWithoutConditions.members.self.conditions = [];
    expect(issuePaths(yesWithoutConditions)).toContain("hasPed");

    const noWithConditions = validLead();
    noWithConditions.hasPed = false;
    expect(issuePaths(noWithConditions)).toContain("members.self.conditions");
  });

  it("requires consent", () => {
    expect(issuePaths({ ...validLead(), consent: false })).toContain("consent");
  });

  it("accepts blank health answers in the input type but reports them", () => {
    const input = validLead();
    input.members.father = { age: 66 };
    expect(issuePaths(input)).toStrictEqual(["members.father.smoker"]);
  });
});

describe(listMembers, () => {
  it("lists members in order with resolved genders", () => {
    const { members } = leadSchema.parse(validLead());
    const entries = listMembers(members, Gender.Male);
    expect(
      entries.map(({ relation, gender, childNo }) => [
        relation,
        gender,
        childNo,
      ])
    ).toStrictEqual([
      [Relation.Self, Gender.Male, undefined],
      [Relation.Spouse, Gender.Female, undefined],
      [Relation.Child, Gender.Male, 1],
    ]);
  });
});
