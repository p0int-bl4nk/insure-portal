import { describe, expect, it } from "vitest";

import {
  insertIndex,
  memberEligibility,
  memberLabel,
  newMember,
  pruneHealthAnswers,
} from "./form";
import type { MemberFormValues } from "./form";

const member = (patch: Partial<MemberFormValues>): MemberFormValues => ({
  relation: "self",
  age: 34,
  gender: "male",
  conditions: [],
  ...patch,
});

describe(insertIndex, () => {
  it("keeps members in relation order", () => {
    const members = [
      member({ relation: "self" }),
      member({ relation: "child" }),
      member({ relation: "mother" }),
    ];
    expect(insertIndex(members, "spouse")).toBe(1);
    expect(insertIndex(members, "child")).toBe(2);
    expect(insertIndex(members, "domestic_worker")).toBe(3);
  });
});

describe(newMember, () => {
  it("presets parent genders and the opposite gender for a spouse", () => {
    expect(newMember("father").gender).toBe("male");
    expect(newMember("mother").gender).toBe("female");
    expect(newMember("spouse", "male").gender).toBe("female");
    expect(newMember("child").gender).toBeUndefined();
  });
});

describe(memberLabel, () => {
  it("numbers children in order", () => {
    const members = [
      member({ relation: "self" }),
      member({ relation: "child" }),
      member({ relation: "child" }),
    ];
    expect(memberLabel(members, 0)).toBe("Self");
    expect(memberLabel(members, 2)).toBe("Child 2");
  });
});

describe(memberEligibility, () => {
  it("asks smoker for adults and pregnancy for a married female self", () => {
    expect(
      memberEligibility(member({ gender: "female", age: "30" }), "married")
    ).toStrictEqual({ asksSmoker: true, asksPregnancy: true });
    expect(
      memberEligibility(member({ gender: "female", age: 30 }), "single")
    ).toStrictEqual({ asksSmoker: true, asksPregnancy: false });
    expect(
      memberEligibility(member({ relation: "child", age: 4 }), "married")
    ).toStrictEqual({ asksSmoker: false, asksPregnancy: false });
  });
});

describe(pruneHealthAnswers, () => {
  it("drops answers to questions that no longer apply", () => {
    const [child] = pruneHealthAnswers(
      [member({ relation: "child", age: 4, smoker: false, pregnant: false })],
      "married"
    );
    expect(child).not.toHaveProperty("smoker");
    expect(child).not.toHaveProperty("pregnant");
  });
});
