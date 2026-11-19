import {
  addYears,
  Condition,
  Gender,
  MaritalStatus,
  todayInDubai,
} from "@insure/shared";
import { describe, expect, it } from "vitest";

import {
  ageField,
  formatEmiratesIdInput,
  formatMobileInput,
  formMembers,
  genderField,
  memberEligibility,
  memberLabel,
  newMember,
  pruneHealthAnswers,
  summarizeConditions,
} from "./form";
import type { MembersFormValues, ProposerBasics } from "./form";

const dobAged = (years: number) => addYears(todayInDubai(), -years);

const proposer = (patch: ProposerBasics = {}): ProposerBasics => ({
  gender: Gender.Male,
  dateOfBirth: dobAged(34),
  ...patch,
});

const members = (
  patch: Partial<MembersFormValues> = {}
): MembersFormValues => ({
  self: { conditions: [], smoker: false },
  children: [],
  ...patch,
});

describe("blank members", () => {
  it("defaults a spouse to the opposite gender", () => {
    expect(newMember.spouse(Gender.Male).gender).toBe(Gender.Female);
    expect(newMember.spouse(Gender.Female).gender).toBe(Gender.Male);
    expect(newMember.child()).toStrictEqual({ age: "", conditions: [] });
  });
});

describe(formMembers, () => {
  it("lists members with labels, ages and typed form paths", () => {
    const entries = formMembers(
      members({
        mother: { age: "60", conditions: [], smoker: false },
        children: [
          { age: 4, gender: Gender.Male },
          { age: 2, gender: Gender.Female },
        ],
      }),
      proposer()
    );

    expect(entries.map((entry) => memberLabel(entry))).toStrictEqual([
      "Self",
      "Child 1",
      "Child 2",
      "Mother",
    ]);
    expect(entries.map(({ age }) => age)).toStrictEqual([34, 4, 2, 60]);
    expect(entries.map(({ path }) => ageField(path))).toStrictEqual([
      undefined,
      "members.children.0.age",
      "members.children.1.age",
      "members.mother.age",
    ]);
    expect(entries.map(({ path }) => genderField(path))).toStrictEqual([
      undefined,
      "members.children.0.gender",
      "members.children.1.gender",
      undefined,
    ]);
  });
});

describe(memberEligibility, () => {
  it("asks pregnancy of a married female proposer only", () => {
    const [self] = formMembers(
      members(),
      proposer({ gender: Gender.Female, dateOfBirth: dobAged(30) })
    );

    expect(
      self && memberEligibility(self, MaritalStatus.Married)
    ).toStrictEqual({ asksSmoker: true, asksPregnancy: true });
    expect(self && memberEligibility(self, MaritalStatus.Single)).toStrictEqual(
      { asksSmoker: true, asksPregnancy: false }
    );
  });

  it("asks smoker of children only from 18", () => {
    const [, young, adult] = formMembers(
      members({
        children: [
          { age: 4, gender: Gender.Male },
          { age: 19, gender: Gender.Male },
        ],
      }),
      proposer()
    );

    expect(
      young && memberEligibility(young, MaritalStatus.Married)
    ).toStrictEqual({ asksSmoker: false, asksPregnancy: false });
    expect(
      adult && memberEligibility(adult, MaritalStatus.Married)
    ).toStrictEqual({ asksSmoker: true, asksPregnancy: false });
  });
});

describe(pruneHealthAnswers, () => {
  it("drops answers to questions that no longer apply", () => {
    const pruned = pruneHealthAnswers(
      members({
        self: { conditions: [], smoker: false, pregnant: false },
        children: [{ age: 4, gender: Gender.Male, smoker: false }],
      }),
      proposer(),
      MaritalStatus.Married
    );

    expect(pruned.self).not.toHaveProperty("pregnant");
    expect(pruned.self).toHaveProperty("smoker", false);
    expect(pruned.children?.[0]).not.toHaveProperty("smoker");
  });
});

describe(summarizeConditions, () => {
  it("shows two names, then a count of the rest", () => {
    expect(summarizeConditions([])).toBe("None");
    expect(
      summarizeConditions([
        Condition.Diabetes,
        Condition.Respiratory,
        Condition.Kidney,
        Condition.Thyroid,
      ])
    ).toBe("Diabetes, Asthma / respiratory and 2 more");
  });
});

describe("input formatting", () => {
  it.each([
    ["501234567", "50 123 4567"],
    ["0501234567", "50 123 4567"],
    ["+971 50 123 4567", "50 123 4567"],
  ])("formats mobile %s as %s", (raw, expected) => {
    expect(formatMobileInput(raw)).toBe(expected);
  });

  it.each([
    ["7841990", "784-1990"],
    ["784199012345671", "784-1990-1234567-1"],
    ["784-1990-1234567-1999", "784-1990-1234567-1"],
  ])("formats Emirates ID %s as %s", (raw, expected) => {
    expect(formatEmiratesIdInput(raw)).toBe(expected);
  });
});
