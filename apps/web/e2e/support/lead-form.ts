import { addDays, addYears, formatIso, todayInDubai } from "@insure/shared";
import type { SubmitResponse, Submission } from "@insure/shared";
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

// Dates, relative to today in Dubai like the schema's windows.

/** "YYYY-MM-DD", the value format of <input type="date">. */
export const daysFromToday = (days: number) =>
  formatIso(addDays(todayInDubai(), days));

/** A date of birth that makes someone `age` today (with a margin either side). */
export const dobForAge = (age: number) =>
  formatIso(addDays(addYears(todayInDubai(), -age), -30));

// Test people.

export interface MemberData {
  firstName: string;
  lastName: string;
  /** Asked of self, spouse and children only. */
  gender?: "Male" | "Female";
  /** Asked of self (unless there's a spouse), father and mother only. */
  maritalStatus?: "Single" | "Married" | "Divorced" | "Widowed";
  dateOfBirth: string;
  nationality: string;
  visaEmirate: string;
  visaFileNumber: string;
  /** An e-visa UID instead of the Emirates ID and expiry. */
  uid?: string;
  emiratesId?: string;
  passportNumber: string;
  heightCm: string;
  weightKg: string;
}

const adult = {
  dateOfBirth: dobForAge(36),
  nationality: "India",
  visaEmirate: "Dubai",
  visaFileNumber: "201/2020/1234567",
  emiratesId: "784199012345671",
  heightCm: "175",
  weightKg: "72",
} satisfies Partial<MemberData>;

export const SELF: MemberData = {
  ...adult,
  firstName: "Arjun",
  lastName: "Mehta",
  gender: "Male",
  maritalStatus: "Single",
  passportNumber: "N1234567",
};

export const SPOUSE: MemberData = {
  ...adult,
  firstName: "Priya",
  lastName: "Mehta",
  gender: "Female",
  dateOfBirth: dobForAge(32),
  emiratesId: "784199212345672",
  passportNumber: "N7654321",
  heightCm: "162",
  weightKg: "58",
};

export const CHILD: MemberData = {
  ...adult,
  firstName: "Kabir",
  lastName: "Mehta",
  gender: "Male",
  dateOfBirth: dobForAge(6),
  emiratesId: "784202012345673",
  passportNumber: "C1234567",
  heightCm: "118",
  weightKg: "21",
};

export const FATHER: MemberData = {
  ...adult,
  firstName: "Raj",
  lastName: "Mehta",
  maritalStatus: "Married",
  dateOfBirth: dobForAge(64),
  emiratesId: "784196012345674",
  passportNumber: "F1234567",
};

export const MOTHER: MemberData = {
  ...adult,
  firstName: "Sunita",
  lastName: "Mehta",
  maritalStatus: "Married",
  dateOfBirth: dobForAge(60),
  emiratesId: "784196512345675",
  passportNumber: "M1234567",
  heightCm: "158",
  weightKg: "60",
};

export const SPONSOR = {
  firstName: "Vikram",
  lastName: "Shah",
  nationality: "India",
  emiratesId: "784198512345676",
};

export const CONTACT = { mobile: "501234567", email: "arjun@example.com" };

// Controls.

export const continueButton = (page: Page) =>
  page.getByRole("button", { name: /^(?:Continue|Next: .+)$/u });

export const backButton = (page: Page) =>
  page.getByRole("button", { name: "Back", exact: true });

export const submitButton = (page: Page) =>
  page.getByRole("button", { name: "Get my quotes" });

export const heading = (page: Page) => page.getByRole("heading", { level: 1 });

export const field = (page: Page, label: string) =>
  page.getByLabel(label, { exact: true });

/** A segmented choice (category, gender, Yes/No…), found by its question. */
export const choiceGroup = (page: Page, question: string | RegExp) =>
  page.getByRole("group", { name: question });

export const pick = async (
  page: Page,
  question: string | RegExp,
  option: string
) => {
  await choiceGroup(page, question)
    .getByRole("button", { name: option, exact: true })
    .click();
};

/** Searchable list (nationality, emirate): type, then choose the match. */
export const choose = async (page: Page, label: string, option: string) => {
  await field(page, label).fill(option);
  await page.getByRole("option", { name: option, exact: true }).click();
};

export const memberTab = (page: Page, name: string) =>
  page.getByRole("tab", { name: new RegExp(`^${name}`, "u") });

// Steps.

export const start = async (page: Page) => {
  await page.goto("/");
  await expect(heading(page)).toHaveText("Who are you buying for?");
};

type Relation = "Spouse" | "Father" | "Mother";

export const chooseCover = async (
  page: Page,
  category: "Self Only" | "Both Self and Family" | "Family without Self",
  {
    relations = [],
    children = 0,
  }: { relations?: Relation[]; children?: number } = {}
) => {
  await pick(page, "Selecting health insurance for", category);
  for (const relation of relations) {
    await page.getByRole("button", { name: relation, exact: true }).click();
  }
  if (children > 0) {
    await page.getByRole("button", { name: "Children" }).click();
    for (let i = 1; i < children; i += 1) {
      await page.getByRole("button", { name: "Add a child" }).click();
    }
  }
};

export const fillContact = async (page: Page, contact = CONTACT) => {
  await field(page, "Mobile number").fill(contact.mobile);
  await field(page, "Email").fill(contact.email);
};

export const fillSponsor = async (page: Page, sponsor = SPONSOR) => {
  await field(page, "First name").fill(sponsor.firstName);
  await field(page, "Last name").fill(sponsor.lastName);
  await choose(page, "Nationality", sponsor.nationality);
  await field(page, "Emirates ID").fill(sponsor.emiratesId);
};

/** Fills the open member tab. */
export const fillMember = async (page: Page, member: MemberData) => {
  await pick(page, "I have only an e-visa.", member.uid ? "Yes" : "No");
  await field(page, "First name").fill(member.firstName);
  await field(page, "Last name").fill(member.lastName);
  if (member.gender) {
    await pick(page, "Gender", member.gender);
  }
  if (member.maritalStatus) {
    await pick(page, "Marital status", member.maritalStatus);
  }
  await field(page, "Date of birth").fill(member.dateOfBirth);
  await choose(page, "Nationality", member.nationality);
  await choose(page, "Emirate of visa issuance", member.visaEmirate);
  await field(page, "Visa file number").fill(member.visaFileNumber);
  if (member.uid) {
    await field(page, "UID number").fill(member.uid);
  } else {
    await field(page, "Emirates ID").fill(member.emiratesId ?? "");
    await field(page, "Emirates ID expiry date").fill(daysFromToday(365));
  }
  await field(page, "Passport number").fill(member.passportNumber);
  await field(page, "Height (cm)").fill(member.heightCm);
  await field(page, "Weight (kg)").fill(member.weightKg);
};

/** Fills each member tab in order and moves on, ending on the Health step. */
export const fillMembers = async (page: Page, members: MemberData[]) => {
  for (const member of members) {
    await fillMember(page, member);
    await continueButton(page).click();
  }
  await expect(heading(page)).toHaveText("Health details");
};

export const fillPolicy = async (
  page: Page,
  { previousPolicy = false }: { previousPolicy?: boolean } = {}
) => {
  await field(page, "When do you want the policy to start?").fill(
    daysFromToday(7)
  );
  await pick(
    page,
    "Do you have a current or recent health policy?",
    previousPolicy ? "Yes" : "No"
  );
  if (previousPolicy) {
    await field(page, "Policy expiry date").fill(daysFromToday(20));
  }
  await pick(page, "Monthly income", "AED 10,001 – 20,000");
  await pick(page, "Occupation", "Salaried");
  await page.getByRole("checkbox", { name: /I have read and agree/u }).check();
};

export const PED_QUESTION =
  "Does anyone to be insured have a pre-existing medical condition?";

type Category = Parameters<typeof chooseCover>[1];
type Cover = Parameters<typeof chooseCover>[2];

/** Cover and Contact filled in validly, ending on the first member tab. */
export const reachMembers = async (
  page: Page,
  category: Category,
  cover?: Cover
) => {
  await start(page);
  await chooseCover(page, category, cover);
  await continueButton(page).click();
  await fillContact(page);
  if (category === "Family without Self") {
    await fillSponsor(page);
  }
  await continueButton(page).click();
  await expect(heading(page)).toHaveText("Member details");
};

/** Everything up to Health filled in validly, ending on the Health step. */
export const reachHealth = async (
  page: Page,
  category: Category,
  cover: Cover,
  members: MemberData[]
) => {
  await reachMembers(page, category, cover);
  await fillMembers(page, members);
};

/** The quickest valid route to the Policy step: Self Only, no conditions. */
export const reachPolicy = async (page: Page) => {
  await reachHealth(page, "Self Only", {}, [SELF]);
  await pick(page, PED_QUESTION, "No");
  await pick(page, "Arjun (Self) smokes or uses tobacco", "No");
  await continueButton(page).click();
  await expect(heading(page)).toHaveText("Your policy");
};

// API.

/**
 * Answers POST /api/lead with each response in turn (the last one repeats) and
 * records what was sent. A response of "abort" fails the request at the network.
 */
export const mockLeadApi = async (
  page: Page,
  responses: (SubmitResponse | "abort" | { status: number; body: string })[] = [
    { ok: true, reference: "HC-TEST-0001" },
  ]
) => {
  const submissions: Submission[] = [];

  await page.route("**/api/lead", async (route) => {
    submissions.push(route.request().postDataJSON() as Submission);
    const response =
      responses[Math.min(submissions.length, responses.length) - 1];

    if (response === "abort") {
      await route.abort("failed");
    } else if (response && "status" in response) {
      await route.fulfill(response);
    } else {
      await route.fulfill({ json: response });
    }
  });

  return submissions;
};
