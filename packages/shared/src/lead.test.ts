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
  pruneHealthAnswers,
} from "./lead.ts";
import type { LeadInput } from "./lead.ts";
import {
  Category,
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

const person = (firstName: string, age: number) => ({
  firstName,
  middleName: "",
  lastName: "Menon",
  dateOfBirth: dobAged(age),
  nationality: "IN" as const,
  visaEmirate: Emirate.Dubai,
  documents: {
    eVisaOnly: false as const,
    emiratesId: "784-1990-1234567-1",
    emiratesIdExpiry: addYears(today, 2),
  },
  visaFileNumber: "201/2020/1234567",
  passportNumber: "p1234567",
  heightCm: "175",
  weightKg: "72",
  conditions: [],
});

const validLead = (): LeadInput => ({
  category: Category.SelfAndFamily,
  contact: { email: "rahul@example.com", mobile: "50 123 4567" },
  members: {
    self: {
      ...person("Rahul", 34),
      gender: Gender.Male,
      maritalStatus: MaritalStatus.Married,
      conditions: [Condition.Diabetes],
      smoker: false,
    },
    spouse: {
      ...person("Priya", 31),
      gender: Gender.Female,
      smoker: false,
      pregnant: false,
    },
    children: [{ ...person("Aarav", 4), gender: Gender.Male }],
  },
  hasPed: true,
  policy: {
    startDate: addDays(today, 7),
    incomeRange: IncomeRange.From10001To20000,
    occupation: Occupation.Salaried,
    hasPreviousPolicy: false,
  },
  consent: true,
});

type FamilyOnlyInput = Extract<
  LeadInput,
  { category: typeof Category.FamilyOnly }
>;

/** Parents only, bought by a sponsor who isn't covered. */
const familyOnlyLead = (): FamilyOnlyInput => ({
  ...validLead(),
  category: Category.FamilyOnly,
  sponsor: {
    firstName: "Rahul",
    lastName: "Menon",
    nationality: "IN",
    emiratesId: "784-1990-1234567-1",
  },
  members: {
    children: [],
    mother: {
      ...person("Lata", 60),
      maritalStatus: MaritalStatus.Widowed,
      conditions: [Condition.Thyroid],
      smoker: false,
    },
  },
});

const issuePaths = (input: unknown) => {
  const result = leadSchema.safeParse(input);

  return result.success ? [] : result.error.issues.map((i) => i.path.join("."));
};

/** Name-field issue paths for a lead whose holder has these names. */
const nameIssues = (firstName: string, lastName: string, middleName = "") => {
  const input = validLead();
  if (input.members.self) {
    Object.assign(input.members.self, { firstName, middleName, lastName });
  }
  return issuePaths(input).filter((path) => path.endsWith("Name"));
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

    expect(lead.contact.mobile).toBe("+971501234567");
    expect(lead.members.self?.middleName).toBeUndefined();
    expect(lead.members.self?.passportNumber).toBe("P1234567");
    expect(lead.members.self?.heightCm).toBe(175);
  });

  it.each([
    ["175", "72.5", []],
    ["40", "1", []],
    ["250", "300", []],
    ["175.5", "72", ["members.self.heightCm"]],
    ["175", "72.55", ["members.self.weightKg"]],
    ["39", "0.9", ["members.self.heightCm", "members.self.weightKg"]],
    ["251", "300.1", ["members.self.heightCm", "members.self.weightKg"]],
  ])(
    "height %s cm and weight %s kg → issues %j",
    (heightCm, weightKg, paths) => {
      const input = validLead();
      if (input.members.self) {
        Object.assign(input.members.self, { heightCm, weightKg });
      }

      expect(
        issuePaths(input).filter((path) => /heightCm|weightKg/u.test(path))
      ).toStrictEqual(paths);
    }
  );

  it("accepts Family without Self with a sponsor", () => {
    expect(issuePaths(familyOnlyLead())).toStrictEqual([]);
  });

  it("accepts dates sent as JSON strings", () => {
    const input = validLead();
    const sent = {
      ...input,
      policy: { ...input.policy, startDate: addDays(today, 7).toISOString() },
    };

    expect(leadSchema.safeParse(sent).success).toBeTruthy();
  });

  it("asks for a date when one is missing", () => {
    const input = validLead();
    if (input.members.self) {
      input.members.self.dateOfBirth = undefined;
    }

    expect(issuePaths(input)).toContain("members.self.dateOfBirth");
  });

  it("checks dates of birth against each relation's age limits", () => {
    const input = validLead();
    if (input.members.self) {
      input.members.self.dateOfBirth = dobAged(17);
    }
    input.members.children = [{ ...person("Aarav", 18), gender: Gender.Male }];

    expect(issuePaths(input)).toStrictEqual(
      expect.arrayContaining([
        "members.self.dateOfBirth",
        "members.children.0.dateOfBirth",
      ])
    );
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
    const withDocuments = (documents: object) => ({
      ...input,
      members: {
        ...input.members,
        spouse: { ...input.members.spouse, documents },
      },
    });

    expect(issuePaths(withDocuments({ eVisaOnly: true }))).toContain(
      "members.spouse.documents.uidNumber"
    );
    expect(
      issuePaths(withDocuments({ eVisaOnly: false, emiratesId: "123" }))
    ).toContain("members.spouse.documents.emiratesId");
  });

  it("validates visa file numbers", () => {
    const input = validLead();
    if (input.members.self) {
      input.members.self.visaFileNumber = "2012020";
    }

    expect(issuePaths(input)).toContain("members.self.visaFileNumber");
  });

  it("accepts hyphens and apostrophes inside names", () => {
    expect(
      nameIssues("Mary-Jane", "Al-Mansoori", "Abdul Al-Haj")
    ).toStrictEqual([]);
    expect(nameIssues("D'Souza", "O’Brien")).toStrictEqual([]);
    expect(nameIssues("-Ann", "Smith-")).toStrictEqual([
      "members.self.firstName",
      "members.self.lastName",
    ]);
    expect(nameIssues("Ann", "Al--Haj", "Al '")).toStrictEqual([
      "members.self.middleName",
      "members.self.lastName",
    ]);
  });

  describe("category", () => {
    it("needs at least one family member unless Self Only", () => {
      const input = familyOnlyLead();
      input.members = { children: [] };

      expect(issuePaths(input)).toContain("category");
    });

    it("rejects family members under Self Only", () => {
      expect(
        issuePaths({ ...validLead(), category: Category.SelfOnly })
      ).toContain("category");
    });

    it("needs a sponsor under Family without Self", () => {
      const input: Partial<FamilyOnlyInput> = familyOnlyLead();
      delete input.sponsor;

      expect(issuePaths(input)).toContain("sponsor");
    });

    it("runs while member details are still blank", () => {
      const input = familyOnlyLead();
      input.members = { children: [] };
      input.contact.email = "";

      expect(issuePaths(input)).toContain("category");
    });
  });

  describe("marital status", () => {
    it("needs self to be Married when a spouse is covered", () => {
      const input = validLead();
      if (input.members.self) {
        input.members.self.maritalStatus = MaritalStatus.Divorced;
      }

      expect(issuePaths(input)).toStrictEqual(["members.self.maritalStatus"]);
    });

    it("lets a divorced or widowed self cover children without a spouse", () => {
      const input = validLead();
      delete input.members.spouse;
      if (input.members.self) {
        input.members.self.maritalStatus = MaritalStatus.Widowed;
      }

      expect(issuePaths(input)).toStrictEqual([]);

      if (input.members.self) {
        input.members.self.maritalStatus = MaritalStatus.Single;
      }

      expect(issuePaths(input)).toStrictEqual(["members.self.maritalStatus"]);
    });
  });

  describe("health", () => {
    it("asks pregnancy of married women 18–55 only", () => {
      const input = validLead();
      if (input.members.spouse) {
        delete input.members.spouse.pregnant;
      }

      expect(issuePaths(input)).toStrictEqual(["members.spouse.pregnant"]);
      // A widowed mother isn't asked.
      expect(issuePaths(familyOnlyLead())).toStrictEqual([]);
    });

    it("asks adults whether they smoke", () => {
      const input = validLead();
      if (input.members.self) {
        delete input.members.self.smoker;
      }

      expect(issuePaths(input)).toStrictEqual(["members.self.smoker"]);
    });

    it("ties conditions to the PED gate", () => {
      const input = validLead();
      if (input.members.self) {
        input.members.self.conditions = [];
      }

      expect(issuePaths(input)).toContain("hasPed");
    });
  });
});

// The form never sends these, but the API is public: whatever wasn't asked
// mustn't reach the Sheet.
describe("unasked answers", () => {
  it("drops the sponsor unless the category is Family without Self", () => {
    const { sponsor } = familyOnlyLead();

    for (const category of [Category.SelfOnly, Category.SelfAndFamily]) {
      const input = validLead();
      const members =
        category === Category.SelfOnly
          ? { self: input.members.self, children: [] }
          : input.members;
      const lead = leadSchema.parse({ ...input, category, members, sponsor });

      expect(lead).not.toHaveProperty("sponsor");
    }
  });

  it("drops the previous policy's expiry when there wasn't one", () => {
    const input = validLead();
    const lead = leadSchema.parse({
      ...input,
      policy: { ...input.policy, previousPolicyExpiry: addDays(today, 10) },
    });

    expect(lead.policy).not.toHaveProperty("previousPolicyExpiry");
  });

  it("keeps only the ID asked by the e-visa answer", () => {
    const input = validLead();
    const { documents } = person("Priya", 31);
    const lead = leadSchema.parse({
      ...input,
      members: {
        ...input.members,
        self: {
          ...input.members.self,
          documents: { ...documents, uidNumber: "123456" },
        },
        spouse: {
          ...input.members.spouse,
          documents: { ...documents, eVisaOnly: true, uidNumber: "123456" },
        },
      },
    });

    expect(lead.members.self?.documents).not.toHaveProperty("uidNumber");
    expect(lead.members.spouse?.documents).toStrictEqual({
      eVisaOnly: true,
      uidNumber: "123456",
    });
  });

  it("drops details a relation fixes rather than asks", () => {
    const input = familyOnlyLead();
    const lead = leadSchema.parse({
      ...input,
      members: {
        children: [
          {
            ...person("Aarav", 4),
            gender: Gender.Male,
            maritalStatus: MaritalStatus.Married,
          },
        ],
        mother: { ...input.members.mother, gender: Gender.Male },
      },
    });

    expect(lead.members.children[0]).not.toHaveProperty("maritalStatus");
    expect(lead.members.mother).not.toHaveProperty("gender");
  });

  it("drops pregnancy answers from adults who weren't asked", () => {
    const input = validLead();
    const lead = leadSchema.parse({
      ...input,
      members: {
        ...input.members,
        // A man isn't asked about pregnancy, nor is a woman over 55.
        self: { ...input.members.self, pregnant: true },
        spouse: { ...input.members.spouse, dateOfBirth: dobAged(56) },
      },
    });

    expect(lead.members.self).not.toHaveProperty("pregnant");
    expect(lead.members.spouse).not.toHaveProperty("pregnant");
    // Adults are still asked whether they smoke.
    expect(lead.members.self).toHaveProperty("smoker", false);
    expect(lead.members.spouse).toHaveProperty("smoker", false);
  });

  it("drops both health answers from children", () => {
    const input = validLead();
    const lead = leadSchema.parse({
      ...input,
      members: {
        ...input.members,
        children: [
          {
            ...person("Aarav", 4),
            gender: Gender.Female,
            smoker: true,
            pregnant: true,
          },
        ],
      },
    });

    expect(lead.members.children[0]).not.toHaveProperty("smoker");
    expect(lead.members.children[0]).not.toHaveProperty("pregnant");
  });

  it("keeps health answers to questions that were asked", () => {
    const lead = leadSchema.parse({
      ...validLead(),
      members: {
        ...validLead().members,
        spouse: { ...validLead().members.spouse, pregnant: true },
      },
    });

    expect(lead.members.spouse).toHaveProperty("pregnant", true);
  });
});

describe(pruneHealthAnswers, () => {
  it("drops answers to questions that no longer apply", () => {
    const pruned = pruneHealthAnswers({
      self: {
        ...person("Rahul", 34),
        gender: Gender.Male,
        maritalStatus: MaritalStatus.Married,
        smoker: false,
        pregnant: false,
      },
      children: [{ ...person("Aarav", 4), gender: Gender.Male, smoker: false }],
    });

    expect(pruned.self).not.toHaveProperty("pregnant");
    expect(pruned.self).toHaveProperty("smoker", false);
    expect(pruned.children?.[0]).not.toHaveProperty("smoker");
  });

  it("works on form values, where a date of birth may be blank", () => {
    const pruned = pruneHealthAnswers({
      self: {
        ...person("Rahul", 34),
        dateOfBirth: undefined,
        smoker: false,
        pregnant: false,
      },
      children: [],
    });

    expect(pruned.self).not.toHaveProperty("smoker");
    expect(pruned.self).not.toHaveProperty("pregnant");
  });
});

describe(listMembers, () => {
  it("lists members in order, with ages from dates of birth", () => {
    const { members } = leadSchema.parse(validLead());

    expect(
      listMembers(members).map(({ relation, gender, maritalStatus, age }) => [
        relation,
        gender,
        maritalStatus,
        age,
      ])
    ).toStrictEqual([
      [Relation.Self, Gender.Male, MaritalStatus.Married, 34],
      [Relation.Spouse, Gender.Female, MaritalStatus.Married, 31],
      [Relation.Child, Gender.Male, MaritalStatus.Single, 4],
    ]);
  });
});
