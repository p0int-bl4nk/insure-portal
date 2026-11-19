import {
  addDays,
  addYears,
  Category,
  Condition,
  Emirate,
  Gender,
  IncomeRange,
  MaritalStatus,
  Occupation,
  todayInDubai,
} from "@insure/shared";
import type { LeadInput } from "@insure/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createHandler } from "./handler.ts";
import type { Deps } from "./handler.ts";
import type { Logger } from "./log.ts";
import { LEAD_HEADERS, MEMBER_HEADERS } from "./rows.ts";
import { toApiEvent } from "./utils.ts";

const NOW = new Date("2026-11-18T10:05:33Z");
const LEAD_ID = "7f3a21c9-0000-4000-8000-000000000000";

// Date rules are relative to the real today, so fixtures are too.
const today = todayInDubai();

const person = (firstName: string, age: number) => ({
  firstName,
  lastName: "Menon",
  dateOfBirth: addYears(today, -age),
  nationality: "IN" as const,
  visaEmirate: Emirate.Dubai,
  documents: {
    eVisaOnly: false as const,
    emiratesId: "784-1990-1234567-1",
    emiratesIdExpiry: addYears(today, 2),
  },
  visaFileNumber: "201/2020/1234567",
  passportNumber: "P1234567",
  heightCm: 175,
  weightKg: 72,
  conditions: [],
  smoker: false,
});

const lead: LeadInput = {
  category: Category.SelfAndFamily,
  contact: { email: "rahul@example.com", mobile: "0501234567" },
  members: {
    self: {
      ...person("Rahul", 34),
      gender: Gender.Male,
      maritalStatus: MaritalStatus.Married,
      conditions: [Condition.Diabetes],
    },
    spouse: { ...person("Priya", 31), gender: Gender.Female, pregnant: false },
  },
  hasPed: true,
  policy: {
    startDate: addDays(today, 7),
    incomeRange: IncomeRange.From10001To20000,
    occupation: Occupation.Salaried,
    hasPreviousPolicy: false,
  },
  consent: true,
};

const submission = (overrides: Record<string, unknown> = {}) => ({
  lead,
  turnstileToken: "token",
  website: "",
  startedAt: NOW.getTime() - 60_000,
  ...overrides,
});

const event = (body: unknown, method = "POST") =>
  toApiEvent({
    method,
    path: "/api/lead",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
    sourceIp: "10.0.0.1",
  });

const parse = (res: { statusCode?: number; body?: string }) => ({
  status: res.statusCode,
  body: JSON.parse(res.body ?? "{}"),
});

describe("handler", () => {
  const verify = vi.fn<NonNullable<Deps["verify"]>>();
  const append = vi.fn<Deps["append"]>();
  const logInfo = vi.fn<Logger["info"]>();
  const logWarn = vi.fn<Logger["warn"]>();
  const logError = vi.fn<Logger["error"]>();
  let handler: ReturnType<typeof createHandler>;

  const makeHandler = (turnstileEnabled: boolean) =>
    createHandler({
      verify: turnstileEnabled ? verify : undefined,
      append,
      now: () => NOW,
      newId: () => LEAD_ID,
      log: { info: logInfo, warn: logWarn, error: logError },
    });

  beforeEach(() => {
    vi.resetAllMocks();
    verify.mockResolvedValue({ success: true, errorCodes: [] });
    append.mockResolvedValue();
    handler = makeHandler(true);
  });

  it("saves a valid lead and returns its reference", async () => {
    const res = parse(await handler(event(submission())));
    expect(res).toStrictEqual({
      status: 200,
      body: { ok: true, reference: "7F3A-21C9" },
    });
    expect(verify).toHaveBeenCalledWith("token", "203.0.113.7");

    const [, memberRows] = append.mock.calls[0] ?? [];
    expect(memberRows).toHaveLength(2);
    const self = memberRows?.[0] ?? [];
    expect(self).toHaveLength(MEMBER_HEADERS.length);
    expect(
      Object.fromEntries(MEMBER_HEADERS.map((header, i) => [header, self[i]]))
    ).toMatchObject({
      relation: "Self",
      first_name: "Rahul",
      age: 34,
      marital_status: "Married",
      emirates_id: "784199012345671",
      uid_number: "",
      conditions: "Diabetes",
    });
  });

  it("writes one value per Sheet column, normalised", async () => {
    await handler(event(submission()));

    const [leadRow] = append.mock.calls[0] ?? [];
    expect(leadRow).toHaveLength(LEAD_HEADERS.length);
    expect(
      Object.fromEntries(
        LEAD_HEADERS.map((header, i) => [header, leadRow?.[i]])
      )
    ).toMatchObject({
      submitted_at_gst: "2026-11-18 14:05:33",
      category: "Both Self and Family",
      contact_name: "Rahul Menon",
      contact_mobile: "+971501234567",
      sponsor_first_name: "",
    });
  });

  it("skips the human check when Turnstile is switched off", async () => {
    const res = await makeHandler(false)(
      event(submission({ turnstileToken: undefined }))
    );

    expect(res.statusCode).toBe(200);
    expect(verify).not.toHaveBeenCalled();
    expect(append).toHaveBeenCalledOnce();
  });

  it("requires a token when Turnstile is on", async () => {
    const res = await handler(event(submission({ turnstileToken: undefined })));

    expect(res.statusCode).toBe(403);
    expect(append).not.toHaveBeenCalled();
  });

  it("rejects non-POST requests", async () => {
    const res = await handler(event(submission(), "GET"));
    expect(res.statusCode).toBe(405);
  });

  it("returns a decoy success for honeypot hits without writing", async () => {
    const res = parse(
      await handler(event(submission({ website: "http://spam" })))
    );
    expect(res.status).toBe(200);
    expect(verify).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it("returns a decoy success for impossibly fast submissions", async () => {
    const res = parse(
      await handler(event(submission({ startedAt: NOW.getTime() - 500 })))
    );
    expect(res.status).toBe(200);
    expect(append).not.toHaveBeenCalled();
  });

  it("rejects invalid payloads with 400", async () => {
    const bad = submission({ lead: { ...lead, consent: false } });
    expect(parse(await handler(event(bad)))).toStrictEqual({
      status: 400,
      body: { ok: false, error: "invalid" },
    });
    expect(parse(await handler(event("{not json")))).toMatchObject({
      status: 400,
    });
  });

  it("rejects failed Turnstile checks with 403", async () => {
    verify.mockResolvedValue({
      success: false,
      errorCodes: ["invalid-input-response"],
    });
    expect(parse(await handler(event(submission())))).toStrictEqual({
      status: 403,
      body: { ok: false, error: "verification_failed" },
    });
    expect(append).not.toHaveBeenCalled();
  });

  it("returns 503 when the Sheet write fails", async () => {
    append.mockRejectedValue(new Error("Sheets API 429"));
    expect(parse(await handler(event(submission())))).toStrictEqual({
      status: 503,
      body: { ok: false, error: "unavailable" },
    });
  });

  it("never logs personal data", async () => {
    await handler(event(submission()));
    await handler(event(submission({ lead: { ...lead, consent: false } })));
    const logged = JSON.stringify([logInfo.mock.calls, logWarn.mock.calls]);
    for (const secret of [
      "Rahul",
      "501234567",
      "rahul@example.com",
      "Diabetes",
      "P1234567",
      "784199012345671",
      "201/2020/1234567",
    ]) {
      expect(logged).not.toContain(secret);
    }
  });

  it("rejects bodies over 16 KB", async () => {
    const res = await handler(event(submission({ pad: "x".repeat(20_000) })));
    expect(res.statusCode).toBe(413);
  });
});
