import { expect, test } from "@playwright/test";

import {
  choiceGroup,
  chooseCover,
  CONTACT,
  continueButton,
  field,
  fillContact,
  heading,
  start,
} from "./support/lead-form.ts";

test.describe("Cover step", () => {
  test.beforeEach(async ({ page }) => {
    await start(page);
  });

  test("asks who the cover is for before moving on", async ({ page }) => {
    await continueButton(page).click();

    await expect(page.getByText("Choose who you're buying for.")).toBeVisible();
    await expect(heading(page)).toHaveText("Who are you buying for?");
  });

  for (const category of [
    "Both Self and Family",
    "Family without Self",
  ] as const) {
    test(`${category} needs at least one family member`, async ({ page }) => {
      await chooseCover(page, category);
      await continueButton(page).click();

      await expect(
        page.getByText("Choose at least one family member.")
      ).toBeVisible();
      await expect(heading(page)).toHaveText("Who are you buying for?");
    });
  }

  test("asks about family only for the family categories", async ({ page }) => {
    await chooseCover(page, "Self Only");
    await expect(page.getByText(/Who (?:else )?is covered\?/u)).toHaveCount(0);

    await chooseCover(page, "Both Self and Family");
    await expect(page.getByText("Who else is covered?")).toBeVisible();

    await chooseCover(page, "Family without Self");
    await expect(page.getByText("Who is covered?")).toBeVisible();
  });

  test("counts children from 1 up to 4", async ({ page }) => {
    await chooseCover(page, "Both Self and Family", { children: 1 });
    // The Children toggle shows how many, e.g. "Children×2".
    const children = page.getByRole("button", { name: /^Children/u });
    const add = page.getByRole("button", { name: "Add a child" });
    const remove = page.getByRole("button", { name: "Remove a child" });
    await expect(children).toHaveText("Children×1");

    await add.click();
    await add.click();
    await add.click();
    await expect(children).toHaveText("Children×4");
    await expect(add).toBeDisabled();

    await remove.click();
    await expect(children).toHaveText("Children×3");
    await expect(add).toBeEnabled();

    // Switching Children off clears them all.
    await children.click();
    await expect(remove).toHaveCount(0);
    await expect(children).toHaveText("Children");
    await expect(children).toHaveAttribute("aria-pressed", "false");
  });

  test("switching a relation off drops their tab", async ({ page }) => {
    await chooseCover(page, "Both Self and Family", {
      relations: ["Spouse", "Father"],
    });
    await page.getByRole("button", { name: "Spouse", exact: true }).click();
    await continueButton(page).click();
    await fillContact(page);
    await continueButton(page).click();

    await expect(page.getByRole("tab")).toHaveText(["Self", "Father"]);
  });

  test("switching to Self Only drops the family chosen before", async ({
    page,
  }) => {
    await chooseCover(page, "Both Self and Family", {
      relations: ["Spouse"],
      children: 2,
    });
    await chooseCover(page, "Self Only");
    await continueButton(page).click();
    await fillContact(page);
    await continueButton(page).click();

    await expect(page.getByRole("tab")).toHaveText(["Self"]);
  });

  test("switching between family categories adds or drops Self", async ({
    page,
  }) => {
    await chooseCover(page, "Family without Self", { relations: ["Mother"] });
    await continueButton(page).click();
    await expect(page.getByText("Sponsor details")).toBeVisible();

    await page.getByRole("button", { name: "Back" }).click();
    await chooseCover(page, "Both Self and Family");
    await continueButton(page).click();
    // Self is covered now, so there's no separate sponsor.
    await expect(page.getByText("Sponsor details")).toHaveCount(0);
    await fillContact(page);
    await continueButton(page).click();

    await expect(page.getByRole("tab")).toHaveText(["Self", "Mother"]);
  });
});

test.describe("Contact step", () => {
  test("requires a UAE mobile and an email", async ({ page }) => {
    await start(page);
    await chooseCover(page, "Self Only");
    await continueButton(page).click();
    await continueButton(page).click();

    await expect(
      page.getByText(
        "Enter a UAE mobile number starting with 5, e.g. 50 123 4567."
      )
    ).toBeVisible();
    await expect(
      page.getByText("Enter a valid email address, e.g. name@example.com.")
    ).toBeVisible();
    await expect(heading(page)).toHaveText("How can we reach you?");

    await field(page, "Mobile number").fill("41234567");
    await field(page, "Email").fill("not-an-email");
    await continueButton(page).click();
    await expect(heading(page)).toHaveText("How can we reach you?");

    await fillContact(page);
    await continueButton(page).click();
    await expect(heading(page)).toHaveText("Member details");
  });

  test("formats the mobile as it's typed, dropping a pasted prefix", async ({
    page,
  }) => {
    await start(page);
    await chooseCover(page, "Self Only");
    await continueButton(page).click();
    const mobile = field(page, "Mobile number");

    await mobile.fill(CONTACT.mobile);
    await expect(mobile).toHaveValue("50 123 4567");

    for (const pasted of ["+971 50 123 4567", "00971501234567", "0501234567"]) {
      await mobile.fill(pasted);
      await expect(mobile).toHaveValue("50 123 4567");
    }
  });

  test("asks for sponsor details only under Family without Self", async ({
    page,
  }) => {
    await start(page);
    await chooseCover(page, "Family without Self", { relations: ["Father"] });
    await continueButton(page).click();
    await fillContact(page);
    await continueButton(page).click();

    await expect(page.getByText("Enter the first name.")).toBeVisible();
    await expect(page.getByText("Enter the last name.")).toBeVisible();
    await expect(page.getByText("Choose a nationality.")).toBeVisible();
    await expect(
      page.getByText("Enter the 15-digit Emirates ID starting with 784.")
    ).toBeVisible();

    const emiratesId = field(page, "Emirates ID");
    await emiratesId.fill("784198512345676");
    await expect(emiratesId).toHaveValue("784-1985-1234567-6");
  });

  test("Back keeps what was typed", async ({ page }) => {
    await start(page);
    await chooseCover(page, "Self Only");
    await continueButton(page).click();
    await fillContact(page);
    await page.getByRole("button", { name: "Back" }).click();

    await expect(
      choiceGroup(page, "Selecting health insurance for").getByRole("button", {
        name: "Self Only",
      })
    ).toHaveAttribute("aria-pressed", "true");
    await continueButton(page).click();
    await expect(field(page, "Mobile number")).toHaveValue("50 123 4567");
    await expect(field(page, "Email")).toHaveValue(CONTACT.email);
  });
});
