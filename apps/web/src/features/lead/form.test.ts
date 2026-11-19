import {
  addYears,
  Condition,
  Gender,
  MaritalStatus,
  todayInDubai,
} from "@insure/shared";
import { describe, expect, it } from "vitest";

import { formatEmiratesIdInput, formatMobileInput } from "@/lib/utils";

import {
  detailFields,
  formMembers,
  genderField,
  maritalStatusField,
  memberEligibility,
  memberLabel,
  newMember,
  pruneHealthAnswers,
  summarizeConditions,
} from "./form";
import type { MembersFormValues } from "./form";

const bornAged = (years: number) => ({
  ...newMember(),
  dateOfBirth: addYears(todayInDubai(), -years),
});

const members = (
  patch: Partial<MembersFormValues> = {}
): MembersFormValues => ({
  self: {
    ...bornAged(34),
    gender: Gender.Male,
    maritalStatus: MaritalStatus.Married,
  },
  children: [],
  ...patch,
});

describe(formMembers, () => {
  it("lists members with labels, ages and typed form paths", () => {
    const entries = formMembers(
      members({
        mother: { ...bornAged(60), maritalStatus: MaritalStatus.Widowed },
        children: [
          { ...bornAged(4), gender: Gender.Male },
          { ...bornAged(2), gender: Gender.Female },
        ],
      })
    );

    expect(entries.map((entry) => memberLabel(entry))).toStrictEqual([
      "Self",
      "Child 1",
      "Child 2",
      "Mother",
    ]);
    expect(entries.map(({ age }) => age)).toStrictEqual([34, 4, 2, 60]);
    expect(entries.map(({ path }) => genderField(path))).toStrictEqual([
      "members.self.gender",
      "members.children.0.gender",
      "members.children.1.gender",
      undefined,
    ]);
    expect(entries.map(({ path }) => maritalStatusField(path))).toStrictEqual([
      "members.self.maritalStatus",
      undefined,
      undefined,
      "members.mother.maritalStatus",
    ]);
  });

  it("starts without self under Family without Self", () => {
    expect(formMembers({ father: newMember() })).toHaveLength(1);
  });
});

describe(detailFields, () => {
  it("checks a tab's details but not its health answers", () => {
    const [self] = formMembers(members());
    const fields = self ? detailFields(self) : [];

    expect(fields).toContain("members.self.documents");
    expect(fields).toContain("members.self.maritalStatus");
    expect(fields).not.toContain("members.self.smoker");
  });
});

const woman = (maritalStatus: MaritalStatus, age = 30) =>
  formMembers({
    self: { ...bornAged(age), gender: Gender.Female, maritalStatus },
  })[0];

const ask = (entry: ReturnType<typeof woman>) =>
  entry && memberEligibility(entry).asksPregnancy;

describe(memberEligibility, () => {
  it("asks pregnancy of married women 18–55 only", () => {
    expect(ask(woman(MaritalStatus.Married))).toBeTruthy();
    expect(ask(woman(MaritalStatus.Single))).toBeFalsy();
    expect(ask(woman(MaritalStatus.Married, 60))).toBeFalsy();
  });

  it("asks a spouse about pregnancy without a marital status question", () => {
    const [, spouse] = formMembers(
      members({ spouse: { ...bornAged(31), gender: Gender.Female } })
    );

    expect(spouse && memberEligibility(spouse)).toStrictEqual({
      asksSmoker: true,
      asksPregnancy: true,
    });
  });

  it("never asks children, who are all under 18", () => {
    const [, child] = formMembers(
      members({ children: [{ ...bornAged(17), gender: Gender.Female }] })
    );

    expect(child && memberEligibility(child)).toStrictEqual({
      asksSmoker: false,
      asksPregnancy: false,
    });
  });
});

describe(pruneHealthAnswers, () => {
  it("drops answers to questions that no longer apply", () => {
    const pruned = pruneHealthAnswers(
      members({
        self: {
          ...bornAged(34),
          gender: Gender.Male,
          maritalStatus: MaritalStatus.Married,
          smoker: false,
          pregnant: false,
        },
        children: [{ ...bornAged(4), gender: Gender.Male, smoker: false }],
      })
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
