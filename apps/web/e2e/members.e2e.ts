import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  backButton,
  CHILD,
  choiceGroup,
  continueButton,
  dobForAge,
  field,
  fillMember,
  heading,
  memberTab,
  nextMember,
  pick,
  reachMembers,
  SELF,
  SPOUSE,
} from "./support/lead-form.ts";

/** A value the relation fixes, shown read-only instead of asked. */
const fixedValue = (page: Page, label: string) =>
  page
    .getByRole("tabpanel")
    .getByRole("group")
    .filter({
      has: page.getByText(label, { exact: true }),
      hasNot: page.getByRole("button"),
    });

test("lists one tab per member, in order, and steps through them", async ({
  page,
}) => {
  await reachMembers(page, "Both Self and Family", {
    relations: ["Spouse", "Father", "Mother"],
    children: 2,
  });

  await expect(page.getByRole("tab")).toHaveText([
    "Self",
    "Spouse",
    "Child 1",
    "Child 2",
    "Father",
    "Mother",
  ]);
  await expect(memberTab(page, "Self")).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(continueButton(page)).toHaveText("Next: Spouse");

  await fillMember(page, { ...SELF, maritalStatus: undefined });
  await continueButton(page).click();

  await expect(memberTab(page, "Spouse")).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(continueButton(page)).toHaveText("Next: Child 1");
  await expect(memberTab(page, "Self").getByLabel("complete")).toBeVisible();
});

test("a new member's tab opens without errors", async ({ page }) => {
  await reachMembers(page, "Both Self and Family", { children: 2 });

  for (const tab of ["Self", "Child 1", "Child 2"]) {
    await memberTab(page, tab).click();
    await expect(page.getByRole("tab", { name: /has errors/u })).toHaveCount(0);
    await expect(
      page.getByRole("tabpanel").locator("[data-slot=field-error]")
    ).toHaveCount(0);
  }
});

test("checks the open tab before moving to the next", async ({ page }) => {
  await reachMembers(page, "Both Self and Family", { relations: ["Spouse"] });
  await continueButton(page).click();

  const panel = page.getByRole("tabpanel");
  for (const message of [
    "Enter the first name.",
    "Enter the last name.",
    "Choose a gender.",
    "Enter a date.",
    "Choose a nationality.",
    "Choose the emirate that issued the visa.",
    "Enter the visa file number.",
    "Enter the 15-digit Emirates ID starting with 784.",
    // A blank passport gets the format message: the form sends "".
    "Use 5–20 letters and digits.",
    "Enter the height in cm.",
    "Enter the weight in kg.",
  ]) {
    await expect(panel.getByText(message).first()).toBeVisible();
  }
  await expect(memberTab(page, "Self")).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(memberTab(page, "Self")).toHaveAccessibleName(/has errors/u);
});

test("rejects values in the wrong format", async ({ page }) => {
  await reachMembers(page, "Self Only");
  await fillMember(page, SELF);

  await field(page, "First name").fill("Arjun2");
  await field(page, "Visa file number").fill("2020-1234");
  await field(page, "Emirates ID").fill("123");
  await field(page, "Passport number").fill("N1");
  await field(page, "Height (cm)").fill("20");
  await field(page, "Weight (kg)").fill("0");
  await continueButton(page).click();

  const panel = page.getByRole("tabpanel");
  await expect(
    panel.getByText("Use letters, hyphens or apostrophes only.")
  ).toBeVisible();
  await expect(
    panel.getByText("Use the format 201/2020/1234567.")
  ).toBeVisible();
  await expect(
    panel.getByText("Enter the 15-digit Emirates ID starting with 784.")
  ).toBeVisible();
  await expect(panel.getByText("Use 5–20 letters and digits.")).toBeVisible();
  await expect(
    panel.getByText("Enter the height in cm from 40 to 250.")
  ).toBeVisible();
  await expect(
    panel.getByText("Enter the weight in kg from 1 to 300.")
  ).toBeVisible();
  await expect(heading(page)).toHaveText("Member details");
});

test("accepts hyphenated names and formats the visa file number", async ({
  page,
}) => {
  await reachMembers(page, "Self Only");
  await fillMember(page, { ...SELF, visaFileNumber: "20120201234567" });
  await field(page, "Last name").fill("Al-Mansoori");
  await expect(field(page, "Visa file number")).toHaveValue("201/2020/1234567");

  await field(page, "Visa file number").fill("201.2020.1.1234567");
  await expect(field(page, "Visa file number")).toHaveValue(
    "201/2020/1/1234567"
  );

  await field(page, "Weight (kg)").fill("3.4");
  await continueButton(page).click();
  await expect(heading(page)).toHaveText("Health details");
});

test("checks ages against the member's relation", async ({ page }) => {
  await reachMembers(page, "Both Self and Family", { children: 1 });

  await fillMember(page, { ...SELF, maritalStatus: "Divorced" });
  await field(page, "Date of birth").fill(dobForAge(17));
  await continueButton(page).click();
  await expect(page.getByText("Must be 18 to 99 years old.")).toBeVisible();

  await field(page, "Date of birth").fill(SELF.dateOfBirth);
  await nextMember(page);
  await fillMember(page, { ...CHILD, dateOfBirth: dobForAge(18) });
  await continueButton(page).click();
  await expect(page.getByText("Children must be under 18.")).toBeVisible();
  await expect(heading(page)).toHaveText("Member details");
});

test("e-visa only swaps the Emirates ID for a UID", async ({ page }) => {
  await reachMembers(page, "Self Only");

  await pick(page, "I have only an e-visa.", "Yes");
  await expect(field(page, "UID number")).toBeVisible();
  await expect(field(page, "Emirates ID")).toHaveCount(0);
  await expect(field(page, "Emirates ID expiry date")).toHaveCount(0);

  await pick(page, "I have only an e-visa.", "No");
  await expect(field(page, "UID number")).toHaveCount(0);
  await expect(field(page, "Emirates ID")).toBeVisible();
  await expect(field(page, "Emirates ID expiry date")).toBeVisible();

  const emiratesId = field(page, "Emirates ID");
  await emiratesId.fill("784199012345671");
  await expect(emiratesId).toHaveValue("784-1990-1234567-1");
});

test.describe("details fixed by the relation", () => {
  test("a spouse makes Self and the spouse Married; children are Single", async ({
    page,
  }) => {
    await reachMembers(page, "Both Self and Family", {
      relations: ["Spouse"],
      children: 1,
    });

    await expect(choiceGroup(page, "Marital status")).toHaveCount(0);
    await expect(fixedValue(page, "Marital status")).toContainText("Married");

    for (const [tab, status] of [
      ["Spouse", "Married"],
      ["Child 1", "Single"],
    ] as const) {
      await memberTab(page, tab).click();
      await expect(choiceGroup(page, "Gender").getByRole("button")).toHaveText([
        "Male",
        "Female",
      ]);
      await expect(choiceGroup(page, "Marital status")).toHaveCount(0);
      await expect(fixedValue(page, "Marital status")).toContainText(status);
    }
  });

  test("father and mother have a fixed gender and are asked marital status", async ({
    page,
  }) => {
    await reachMembers(page, "Family without Self", {
      relations: ["Father", "Mother"],
    });

    await expect(choiceGroup(page, "Gender")).toHaveCount(0);
    await expect(fixedValue(page, "Gender")).toContainText("Male");
    await expect(
      choiceGroup(page, "Marital status").getByRole("button")
    ).toHaveText(["Single", "Married", "Divorced", "Widowed"]);

    await memberTab(page, "Mother").click();
    await expect(fixedValue(page, "Gender")).toContainText("Female");
  });

  test("Self covering children without a spouse can't be Single", async ({
    page,
  }) => {
    await reachMembers(page, "Both Self and Family", { children: 1 });

    await expect(
      choiceGroup(page, "Marital status").getByRole("button")
    ).toHaveText(["Married", "Divorced", "Widowed"]);
  });

  test("Self alone can be any marital status", async ({ page }) => {
    await reachMembers(page, "Self Only");

    await expect(
      choiceGroup(page, "Marital status").getByRole("button")
    ).toHaveText(["Single", "Married", "Divorced", "Widowed"]);
  });
});

test.describe("moving between tabs", () => {
  test("Back steps through the tabs, then to Contact, keeping answers", async ({
    page,
  }) => {
    await reachMembers(page, "Both Self and Family", { relations: ["Spouse"] });
    await fillMember(page, { ...SELF, maritalStatus: undefined });
    await nextMember(page);
    await field(page, "First name").fill(SPOUSE.firstName);

    await backButton(page).click();
    await expect(memberTab(page, "Self")).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await expect(field(page, "First name")).toHaveValue(SELF.firstName);

    await backButton(page).click();
    await expect(heading(page)).toHaveText("How can we reach you?");

    await continueButton(page).click();
    await memberTab(page, "Spouse").click();
    await expect(field(page, "First name")).toHaveValue(SPOUSE.firstName);
  });

  test("on the last tab, Continue returns to the first tab with errors", async ({
    page,
  }) => {
    await reachMembers(page, "Both Self and Family", {
      relations: ["Spouse"],
      children: 1,
    });
    // Skip Self and Spouse, fill only the child.
    await memberTab(page, "Child 1").click();
    await expect(continueButton(page)).toHaveText("Continue");
    await fillMember(page, CHILD);
    await continueButton(page).click();

    await expect(heading(page)).toHaveText("Member details");
    await expect(memberTab(page, "Self")).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await expect(memberTab(page, "Self")).toHaveAccessibleName(/has errors/u);
    await expect(memberTab(page, "Spouse")).toHaveAccessibleName(/has errors/u);
    await expect(memberTab(page, "Child 1")).toHaveAccessibleName("Child 1");
  });
});

test("the date field keeps its focus ring while the calendar button has focus", async ({
  page,
}) => {
  await reachMembers(page, "Self Only");
  const dob = field(page, "Date of birth");
  await dob.focus();

  const onPickerButton = () =>
    dob.evaluate((el) => el.matches(":focus-within") && !el.matches(":focus"));
  for (let i = 0; i < 4 && !(await onPickerButton()); i += 1) {
    await page.keyboard.press("Tab");
  }
  expect(await onPickerButton()).toBe(true);

  await expect(dob).not.toHaveCSS("box-shadow", "none");
});
