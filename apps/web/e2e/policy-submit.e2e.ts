import { expect, test } from "@playwright/test";

import {
  backButton,
  choiceGroup,
  daysFromToday,
  field,
  fillPolicy,
  heading,
  mockLeadApi,
  PED_QUESTION,
  pick,
  reachPolicy,
  submitButton,
} from "./support/lead-form.ts";

const thanks = (page: Parameters<typeof reachPolicy>[0]) =>
  page.getByRole("heading", { name: /^Thanks, Arjun\./u });

test.describe("Policy step", () => {
  test("checks every answer before sending anything", async ({ page }) => {
    const submissions = await mockLeadApi(page);
    await reachPolicy(page);
    await submitButton(page).click();

    for (const message of [
      "Enter a date.",
      "Answer this question.",
      "You need to agree to continue.",
    ]) {
      await expect(page.getByText(message)).toBeVisible();
    }
    expect(submissions).toHaveLength(0);
  });

  test("asks the previous policy's expiry only if there is one", async ({
    page,
  }) => {
    await reachPolicy(page);
    const expiry = field(page, "Policy expiry date");
    const question = "Do you have a current or recent health policy?";

    await expect(expiry).toHaveCount(0);
    await pick(page, question, "Yes");
    await expect(expiry).toBeVisible();
    await pick(page, question, "No");
    await expect(expiry).toHaveCount(0);
  });

  test("the start date must be within 30 days", async ({ page }) => {
    const submissions = await mockLeadApi(page);
    await reachPolicy(page);
    await fillPolicy(page);

    for (const date of [daysFromToday(-1), daysFromToday(31)]) {
      await field(page, "When do you want the policy to start?").fill(date);
      await submitButton(page).click();
      await expect(
        page.getByText("Choose a date from today up to 30 days ahead.")
      ).toBeVisible();
    }
    expect(submissions).toHaveLength(0);

    await field(page, "When do you want the policy to start?").fill(
      daysFromToday(30)
    );
    await submitButton(page).click();
    await expect(thanks(page)).toBeVisible();
  });

  test("Back keeps the health answers", async ({ page }) => {
    await reachPolicy(page);
    await backButton(page).click();

    await expect(heading(page)).toHaveText("Health details");
    await expect(
      choiceGroup(page, PED_QUESTION).getByRole("button", { name: "No" })
    ).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("submitting", () => {
  const failures = [
    {
      name: "invalid answers",
      response: { ok: false, error: "invalid" },
      title: "Some answers need checking",
    },
    {
      name: "a failed human check",
      response: { ok: false, error: "verification_failed" },
      title: "We couldn't verify you're human",
    },
    {
      name: "the API being down",
      response: { ok: false, error: "unavailable" },
      title: "Couldn't submit your details",
    },
    {
      name: "a network failure",
      response: "abort",
      title: "Couldn't submit your details",
    },
    {
      name: "an unexpected response",
      response: { status: 502, body: "<html>Bad gateway</html>" },
      title: "Couldn't submit your details",
    },
  ] as const;

  for (const { name, response, title } of failures) {
    test(`explains ${name}, keeps the answers and can retry`, async ({
      page,
    }) => {
      const submissions = await mockLeadApi(page, [
        response,
        { ok: true, reference: "HC-TEST-0002" },
      ]);
      await reachPolicy(page);
      await fillPolicy(page);
      await submitButton(page).click();

      await expect(
        page.getByRole("alert").filter({ hasText: title })
      ).toBeVisible();
      await expect(heading(page)).toHaveText("Your policy");
      await expect(
        field(page, "When do you want the policy to start?")
      ).toHaveValue(daysFromToday(7));

      await submitButton(page).click();
      await expect(thanks(page)).toBeVisible();
      await expect(page.getByText("HC-TEST-0002")).toBeVisible();
      expect(submissions).toHaveLength(2);
      expect(submissions[1]).toEqual(submissions[0]);
    });
  }

  test("shows progress and blocks a second submit while sending", async ({
    page,
  }) => {
    const { promise: sent, resolve: release } =
      Promise.withResolvers<undefined>();
    let requests = 0;
    await page.route("**/api/lead", async (route) => {
      requests += 1;
      await sent;
      await route.fulfill({ json: { ok: true, reference: "HC-TEST-0003" } });
    });
    await reachPolicy(page);
    await fillPolicy(page);
    await submitButton(page).click();

    const submitting = page.getByRole("button", { name: "Submitting" });
    await expect(submitting).toBeDisabled();
    await expect(backButton(page)).toBeDisabled();

    release(undefined);
    await expect(thanks(page)).toBeVisible();
    expect(requests).toBe(1);
  });
});
