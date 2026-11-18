import { Condition, Gender, MaritalStatus } from "@insure/shared";
import { describe, expect, it } from "vitest";

import {
  formatMobileInput,
  formMembers,
  memberEligibility,
  memberField,
  memberLabel,
  newMember,
  pruneHealthAnswers,
  summarizeConditions,
} from "./form";
import type { MembersFormValues } from "./form";

const members = (
  patch: Partial<MembersFormValues> = {}
): MembersFormValues => ({
  self: { age: 34, conditions: [], smoker: false },
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
  it("lists members in order with labels and form paths", () => {
    const entries = formMembers(
      members({
        mother: { age: 60, conditions: [], smoker: false },
        children: [
          { age: 4, gender: Gender.Male },
          { age: 2, gender: Gender.Female },
        ],
      }),
      Gender.Male
    );
    expect(entries.map((entry) => memberLabel(entry))).toStrictEqual([
      "Self",
      "Child 1",
      "Child 2",
      "Mother",
    ]);
    expect(
      entries.map((entry) => memberField(entry.path, "age"))
    ).toStrictEqual([
      "members.self.age",
      "members.children.0.age",
      "members.children.1.age",
      "members.mother.age",
    ]);
    expect(entries.at(-1)?.gender).toBe(Gender.Female);
  });
});

describe(memberEligibility, () => {
  it("asks pregnancy of a married female proposer only", () => {
    const [self] = formMembers(
      members({ self: { age: "30", conditions: [], smoker: false } }),
      Gender.Female
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
      Gender.Male
    );
    expect(
      young && memberEligibility(young, MaritalStatus.Married)
    ).toStrictEqual({
      asksSmoker: false,
      asksPregnancy: false,
    });
    expect(
      adult && memberEligibility(adult, MaritalStatus.Married)
    ).toStrictEqual({
      asksSmoker: true,
      asksPregnancy: false,
    });
  });
});

describe(pruneHealthAnswers, () => {
  it("drops answers to questions that no longer apply", () => {
    const pruned = pruneHealthAnswers(
      members({
        self: { age: 34, conditions: [], smoker: false, pregnant: false },
        children: [{ age: 4, gender: Gender.Male, smoker: false }],
      }),
      Gender.Male,
      MaritalStatus.Married
    );
    expect(pruned.self).not.toHaveProperty("pregnant");
    expect(pruned.children?.[0]).not.toHaveProperty("smoker");
    expect(pruned.self).toHaveProperty("smoker", false);
  });
});

describe(summarizeConditions, () => {
  it("shows two names, then a count of the rest", () => {
    expect(summarizeConditions([])).toBe("None");
    expect(summarizeConditions([Condition.Diabetes, Condition.Thyroid])).toBe(
      "Diabetes, Thyroid"
    );
    expect(
      summarizeConditions([
        Condition.Diabetes,
        Condition.Respiratory,
        Condition.Kidney,
        Condition.Thyroid,
        Condition.Other,
      ])
    ).toBe("Diabetes, Asthma / respiratory and 3 more");
  });
});

describe(formatMobileInput, () => {
  it.each([
    ["5", "5"],
    ["501", "50 1"],
    ["501234567", "50 123 4567"],
    ["50123456789", "50 123 4567"],
    ["0501234567", "50 123 4567"],
    ["+971 50 123 4567", "50 123 4567"],
    ["00971501234567", "50 123 4567"],
    ["50-abc-123", "50 123"],
  ])("formats %s as %s", (raw, expected) => {
    expect(formatMobileInput(raw)).toBe(expected);
  });
});
