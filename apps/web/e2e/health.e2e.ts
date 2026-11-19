import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  backButton,
  CHILD,
  choiceGroup,
  continueButton,
  dobForAge,
  field,
  fillPolicy,
  heading,
  memberTab,
  mockLeadApi,
  MOTHER,
  PED_QUESTION,
  pick,
  reachHealth,
  SELF,
  SPOUSE,
  submitButton,
} from "./support/lead-form.ts";
import type { MemberData } from "./support/lead-form.ts";

const lifestyleQuestions = (page: Page) =>
  page.getByRole("region", { name: "Lifestyle" }).locator("label");

test("asks smoking of adults and pregnancy of married women 18–55", async ({
  page,
}) => {
  await reachHealth(
    page,
    "Both Self and Family",
    { relations: ["Spouse", "Mother"], children: 1 },
    [
      { ...SELF, maritalStatus: undefined },
      SPOUSE,
      CHILD,
      { ...MOTHER, dateOfBirth: dobForAge(50) },
    ]
  );

  await expect(lifestyleQuestions(page)).toHaveText([
    "Arjun (Self) smokes or uses tobacco",
    "Priya (Spouse) smokes or uses tobacco",
    "Priya (Spouse) is currently pregnant",
    "Sunita (Mother) smokes or uses tobacco",
    "Sunita (Mother) is currently pregnant",
  ]);
});

const pregnancyCases: [string, Partial<MemberData>, boolean][] = [
  [
    "married, 30",
    { maritalStatus: "Married", dateOfBirth: dobForAge(30) },
    true,
  ],
  [
    "married, 55",
    { maritalStatus: "Married", dateOfBirth: dobForAge(55) },
    true,
  ],
  [
    "married, 56",
    { maritalStatus: "Married", dateOfBirth: dobForAge(56) },
    false,
  ],
  ["single", { maritalStatus: "Single" }, false],
  ["divorced", { maritalStatus: "Divorced" }, false],
  ["widowed", { maritalStatus: "Widowed" }, false],
];

for (const [label, details, asked] of pregnancyCases) {
  test(`pregnancy is ${asked ? "" : "not "}asked of a woman who is ${label}`, async ({
    page,
  }) => {
    await reachHealth(page, "Self Only", {}, [
      { ...SELF, firstName: "Leila", gender: "Female", ...details },
    ]);

    await expect(lifestyleQuestions(page)).toHaveText([
      "Leila (Self) smokes or uses tobacco",
      ...(asked ? ["Leila (Self) is currently pregnant"] : []),
    ]);
  });
}

test("every question must be answered", async ({ page }) => {
  await reachHealth(page, "Both Self and Family", { relations: ["Spouse"] }, [
    { ...SELF, maritalStatus: undefined },
    SPOUSE,
  ]);
  const unanswered = page.getByText("Answer this question.");
  await continueButton(page).click();

  // The lifestyle rule only runs once the PED question is answered, so the
  // errors come in two rounds.
  await expect(unanswered).toHaveCount(1);
  await pick(page, PED_QUESTION, "No");
  await continueButton(page).click();
  // Two smoker questions and one pregnancy question.
  await expect(unanswered).toHaveCount(3);
  await expect(heading(page)).toHaveText("Health details");
});

test("Yes to conditions needs at least one ticked", async ({ page }) => {
  await reachHealth(page, "Self Only", {}, [SELF]);
  await pick(page, "Arjun (Self) smokes or uses tobacco", "No");

  await pick(page, PED_QUESTION, "Yes");
  await continueButton(page).click();
  await expect(
    page.getByText("Select at least one condition, or answer No.")
  ).toBeVisible();
  await expect(heading(page)).toHaveText("Health details");

  await page.getByRole("checkbox", { name: "Thyroid" }).check();
  await continueButton(page).click();
  await expect(heading(page)).toHaveText("Your policy");
});

test("summarises ticked conditions per member, and No clears them", async ({
  page,
}) => {
  await reachHealth(page, "Both Self and Family", { children: 1 }, [
    { ...SELF, maritalStatus: "Divorced" },
    CHILD,
  ]);
  await pick(page, PED_QUESTION, "Yes");

  const self = page.getByRole("button", { name: /^Arjun \(Self\) · 36/u });
  const child = page.getByRole("button", { name: /^Kabir \(Child 1\) · 6/u });
  await expect(self).toHaveAttribute("aria-expanded", "true");
  await expect(child).toHaveAttribute("aria-expanded", "false");

  for (const condition of ["Diabetes", "High blood pressure", "Thyroid"]) {
    await page.getByRole("checkbox", { name: condition }).check();
  }
  await expect(self).toContainText("Diabetes, High blood pressure and 1 more");

  // One member open at a time.
  await child.click();
  await expect(self).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("checkbox", { name: "Kidney condition" }).check();
  await expect(child).toContainText("Kidney condition");

  await pick(page, PED_QUESTION, "No");
  await expect(self).toHaveCount(0);
  await pick(page, PED_QUESTION, "Yes");
  await expect(self).toContainText("None");
  await expect(child).toContainText("None");
});

test("answers that stop applying after a date of birth change are dropped", async ({
  page,
}) => {
  const submissions = await mockLeadApi(page);
  await reachHealth(page, "Both Self and Family", { relations: ["Spouse"] }, [
    { ...SELF, maritalStatus: undefined },
    SPOUSE,
  ]);
  await pick(page, PED_QUESTION, "No");
  await pick(page, "Arjun (Self) smokes or uses tobacco", "No");
  await pick(page, "Priya (Spouse) smokes or uses tobacco", "No");
  await pick(page, "Priya (Spouse) is currently pregnant", "Yes");

  // Back to the spouse's tab: now 60, so pregnancy no longer applies.
  await backButton(page).click();
  await expect(memberTab(page, "Spouse")).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await field(page, "Date of birth").fill(dobForAge(60));
  await continueButton(page).click();

  await expect(heading(page)).toHaveText("Health details");
  await expect(lifestyleQuestions(page)).toHaveText([
    "Arjun (Self) smokes or uses tobacco",
    "Priya (Spouse) smokes or uses tobacco",
  ]);
  // Answers that still apply are kept.
  await expect(
    choiceGroup(page, PED_QUESTION).getByRole("button", { name: "No" })
  ).toHaveAttribute("aria-pressed", "true");
  await continueButton(page).click();

  await fillPolicy(page);
  await submitButton(page).click();
  await expect(page.getByRole("heading", { name: /^Thanks/u })).toBeVisible();

  const [{ lead }] = submissions;
  expect(lead.members.spouse?.smoker).toBe(false);
  expect(lead.members.spouse).not.toHaveProperty("pregnant");
});
