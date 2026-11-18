import {
  Condition,
  Emirate,
  Gender,
  MaritalStatus,
  SalaryBand,
} from "@insure/shared";
import type { LeadInput } from "@insure/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { toApiEvent } from "./event.ts";
import { createHandler } from "./handler.ts";
import type { Deps } from "./handler.ts";
import type { Logger } from "./log.ts";

const NOW = new Date("2026-11-18T10:05:33Z");
const LEAD_ID = "7f3a21c9-0000-4000-8000-000000000000";

const lead: LeadInput = {
  proposer: {
    fullName: "Rahul Menon",
    mobile: "0501234567",
    email: "rahul@example.com",
    nationality: "IN",
    emirate: Emirate.Dubai,
    salaryBand: SalaryBand.Above4000,
    gender: Gender.Male,
    maritalStatus: MaritalStatus.Married,
  },
  members: {
    self: { age: 34, conditions: [Condition.Diabetes], smoker: false },
    spouse: {
      age: 31,
      gender: Gender.Female,
      conditions: [],
      smoker: false,
      pregnant: false,
    },
  },
  hasPed: true,
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
  const verify = vi.fn<Deps["verify"]>();
  const append = vi.fn<Deps["append"]>();
  const logInfo = vi.fn<Logger["info"]>();
  const logWarn = vi.fn<Logger["warn"]>();
  const logError = vi.fn<Logger["error"]>();
  let handler: ReturnType<typeof createHandler>;

  beforeEach(() => {
    vi.resetAllMocks();
    verify.mockResolvedValue({ success: true, errorCodes: [] });
    append.mockResolvedValue();
    handler = createHandler({
      verify,
      append,
      now: () => NOW,
      newId: () => LEAD_ID,
      log: { info: logInfo, warn: logWarn, error: logError },
    });
  });

  it("saves a valid lead and returns its reference", async () => {
    const res = parse(await handler(event(submission())));
    expect(res).toStrictEqual({
      status: 200,
      body: { ok: true, reference: "7F3A-21C9" },
    });
    expect(verify).toHaveBeenCalledWith("token", "203.0.113.7");

    const [leadRow, memberRows] = append.mock.calls[0] ?? [];
    expect(leadRow?.slice(0, 5)).toStrictEqual([
      LEAD_ID,
      "7F3A-21C9",
      "2026-11-18 14:05:33",
      "Rahul Menon",
      "+971501234567",
    ]);
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
    ]) {
      expect(logged).not.toContain(secret);
    }
  });

  it("rejects bodies over 16 KB", async () => {
    const res = await handler(event(submission({ pad: "x".repeat(20_000) })));
    expect(res.statusCode).toBe(413);
  });
});
