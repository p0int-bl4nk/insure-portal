import {
  addDays,
  addYears,
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
import { LEAD_HEADERS } from "./rows.ts";
import { toApiEvent } from "./utils.ts";

const NOW = new Date("2026-11-18T10:05:33Z");
const LEAD_ID = "7f3a21c9-0000-4000-8000-000000000000";

// Date rules are relative to the real today, so fixtures are too.
const today = todayInDubai();

const lead: LeadInput = {
  proposer: {
    firstName: "Rahul",
    lastName: "Menon",
    dateOfBirth: addYears(today, -34),
    gender: Gender.Male,
    maritalStatus: MaritalStatus.Married,
    nationality: "IN",
    email: "rahul@example.com",
    mobile: "0501234567",
  },
  members: {
    self: { conditions: [Condition.Diabetes], smoker: false },
    spouse: {
      age: 31,
      gender: Gender.Female,
      conditions: [],
      smoker: false,
      pregnant: false,
    },
  },
  hasPed: true,
  measurements: { heightCm: 175, weightKg: 72 },
  policy: {
    startDate: addDays(today, 7),
    incomeRange: IncomeRange.From10001To20000,
    occupation: Occupation.Salaried,
    hasPreviousPolicy: false,
  },
  residency: {
    emirate: Emirate.Dubai,
    visaFileNumber: "201/2020/1234567",
    passportNumber: "P1234567",
    sponsorFirstName: "Acme",
    sponsorLastName: "Trading LLC",
    eVisaOnly: false,
    emiratesId: "784-1990-1234567-1",
    emiratesIdExpiry: addYears(today, 2),
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
    expect(memberRows?.[0]).toStrictEqual([
      LEAD_ID,
      1,
      "Self",
      34,
      "Male",
      "Diabetes",
      "No",
      "",
    ]);
  });

  it("writes one value per Sheet column, normalised", async () => {
    await handler(event(submission()));

    const [leadRow] = append.mock.calls[0] ?? [];
    const cell = (header: (typeof LEAD_HEADERS)[number]) =>
      leadRow?.[LEAD_HEADERS.indexOf(header)];

    expect(leadRow).toHaveLength(LEAD_HEADERS.length);
    expect(cell("submitted_at_gst")).toBe("2026-11-18 14:05:33");
    expect(cell("mobile")).toBe("+971501234567");
    expect(cell("emirates_id")).toBe("784199012345671");
    expect(cell("uid_number")).toBe("");
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
