import { expect, test } from "@playwright/test";

import {
  CHILD,
  chooseCover,
  continueButton,
  FATHER,
  fillContact,
  fillMember,
  fillMembers,
  fillPolicy,
  fillSponsor,
  heading,
  mockLeadApi,
  nextMember,
  MOTHER,
  PED_QUESTION,
  pick,
  SELF,
  SPOUSE,
  start,
  submitButton,
} from "./support/lead-form.ts";

// One full journey per category, checked against what reaches the API.
test.describe("full journeys", { tag: "@journey" }, () => {
  test("Self Only", async ({ page }) => {
    const submissions = await mockLeadApi(page);
    await start(page);

    await chooseCover(page, "Self Only");
    await continueButton(page).click();

    await expect(heading(page)).toHaveText("How can we reach you?");
    await fillContact(page);
    await continueButton(page).click();

    await expect(heading(page)).toHaveText("Member details");
    await fillMembers(page, [SELF]);

    await pick(page, PED_QUESTION, "No");
    await pick(page, "Arjun (Self) smokes or uses tobacco", "Yes");
    await continueButton(page).click();

    await expect(heading(page)).toHaveText("Your policy");
    await fillPolicy(page);
    await submitButton(page).click();

    await expect(
      page.getByRole("heading", {
        name: "Thanks, Arjun. We've got your details.",
      })
    ).toBeVisible();
    await expect(page.getByText("+971 50 123 4567")).toBeVisible();
    await expect(page.getByText("HC-TEST-0001")).toBeVisible();
    await expect(page.getByRole("definition")).toHaveText([
      "HC-TEST-0001",
      "Self Only",
      "Self",
    ]);

    expect(submissions).toHaveLength(1);
    const [{ lead, website, turnstileToken, startedAt }] = submissions;
    expect(website).toBe("");
    expect(turnstileToken).toBeUndefined();
    expect(startedAt).toBeGreaterThan(0);
    expect(lead).toMatchObject({
      category: "self_only",
      contact: { mobile: "+971501234567", email: "arjun@example.com" },
      hasPed: false,
      consent: true,
      policy: {
        hasPreviousPolicy: false,
        incomeRange: "10001_20000",
        occupation: "salaried",
      },
      members: {
        children: [],
        self: {
          firstName: "Arjun",
          lastName: "Mehta",
          gender: "male",
          maritalStatus: "single",
          nationality: "IN",
          visaEmirate: "dubai",
          visaFileNumber: "201/2020/1234567",
          passportNumber: "N1234567",
          heightCm: 175,
          weightKg: 72,
          smoker: true,
          conditions: [],
          documents: { eVisaOnly: false, emiratesId: "784199012345671" },
        },
      },
    });
    expect(lead).not.toHaveProperty("sponsor");
    expect(lead.members.spouse).toBeUndefined();
  });

  test("Both Self and Family, with conditions, an e-visa child and a previous policy", async ({
    page,
  }) => {
    const submissions = await mockLeadApi(page);
    await start(page);

    await chooseCover(page, "Both Self and Family", {
      relations: ["Spouse"],
      children: 2,
    });
    await continueButton(page).click();

    await fillContact(page);
    await continueButton(page).click();

    // Self is fixed as Married because a spouse is covered, so it isn't asked.
    await fillMember(page, { ...SELF, maritalStatus: undefined });
    await expect(continueButton(page)).toHaveText("Next: Spouse");
    await nextMember(page);
    await fillMember(page, SPOUSE);
    await nextMember(page);
    await fillMember(page, CHILD);
    await nextMember(page);
    await fillMember(page, {
      ...CHILD,
      firstName: "Anaya",
      gender: "Female",
      dateOfBirth: CHILD.dateOfBirth,
      uid: "123456789012",
      passportNumber: "C7654321",
    });
    await expect(continueButton(page)).toHaveText("Continue");
    await continueButton(page).click();

    await expect(heading(page)).toHaveText("Health details");
    await pick(page, PED_QUESTION, "Yes");
    // The first member's conditions are open by default.
    await page.getByRole("checkbox", { name: "Diabetes" }).check();
    await page.getByRole("button", { name: /^Kabir \(Child 1\)/u }).click();
    await page.getByRole("checkbox", { name: "Asthma / respiratory" }).check();

    await pick(page, "Arjun (Self) smokes or uses tobacco", "No");
    await pick(page, "Priya (Spouse) smokes or uses tobacco", "No");
    await pick(page, "Priya (Spouse) is currently pregnant", "Yes");
    await continueButton(page).click();

    await fillPolicy(page, { previousPolicy: true });
    await submitButton(page).click();

    await expect(
      page.getByRole("heading", { name: /^Thanks, Arjun\./u })
    ).toBeVisible();
    await expect(page.getByRole("definition")).toHaveText([
      "HC-TEST-0001",
      "Both Self and Family",
      "Self, Spouse, Child",
    ]);

    const [{ lead }] = submissions;
    expect(lead).toMatchObject({
      category: "self_and_family",
      hasPed: true,
      policy: { hasPreviousPolicy: true },
      members: {
        self: {
          maritalStatus: "married",
          conditions: ["diabetes"],
          smoker: false,
        },
        spouse: {
          firstName: "Priya",
          gender: "female",
          smoker: false,
          pregnant: true,
          conditions: [],
        },
        children: [
          { firstName: "Kabir", conditions: ["respiratory"] },
          {
            firstName: "Anaya",
            gender: "female",
            documents: { eVisaOnly: true, uidNumber: "123456789012" },
          },
        ],
      },
    });
    // Children aren't asked about smoking or pregnancy.
    for (const child of lead.members.children ?? []) {
      expect(child.smoker).toBeUndefined();
      expect(child.pregnant).toBeUndefined();
    }
  });

  test("Family without Self, with the filler as sponsor", async ({ page }) => {
    const submissions = await mockLeadApi(page);
    await start(page);

    await chooseCover(page, "Family without Self", {
      relations: ["Father", "Mother"],
    });
    await continueButton(page).click();

    await fillContact(page);
    await expect(
      page.getByRole("heading", { name: "Sponsor details" })
    ).toBeVisible();
    await fillSponsor(page);
    await continueButton(page).click();

    await expect(page.getByRole("tab")).toHaveText(["Father", "Mother"]);
    await fillMembers(page, [FATHER, MOTHER]);

    await pick(page, PED_QUESTION, "No");
    await pick(page, "Raj (Father) smokes or uses tobacco", "No");
    await pick(page, "Sunita (Mother) smokes or uses tobacco", "No");
    // Mother is married but over 55, so pregnancy isn't asked.
    await expect(page.getByText("is currently pregnant")).toHaveCount(0);
    await continueButton(page).click();

    await fillPolicy(page);
    await submitButton(page).click();

    // The sponsor is who the lead belongs to.
    await expect(
      page.getByRole("heading", { name: /^Thanks, Vikram\./u })
    ).toBeVisible();
    await expect(page.getByRole("definition")).toHaveText([
      "HC-TEST-0001",
      "Family without Self",
      "Father, Mother",
    ]);

    const [{ lead }] = submissions;
    expect(lead).toMatchObject({
      category: "family_only",
      sponsor: {
        firstName: "Vikram",
        lastName: "Shah",
        nationality: "IN",
        emiratesId: "784198512345676",
      },
      members: {
        father: { firstName: "Raj", maritalStatus: "married" },
        mother: { firstName: "Sunita", maritalStatus: "married" },
      },
    });
    expect(lead.members.self).toBeUndefined();
    expect(lead.members.mother?.pregnant).toBeUndefined();
  });
});
