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

import type { Config } from "./config.ts";
import { createHandler, liveDeps } from "./handler.ts";
import type { Deps } from "./handler.ts";
import type { Logger } from "./log.ts";
import { LEAD_HEADERS, MEMBER_HEADERS } from "./rows.ts";

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
  contact: {
    email: "rahul@example.com",
    mobile: "0501234567",
    incomeRange: IncomeRange.From10001To20000,
    occupation: Occupation.Salaried,
  },
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

const event = (
  body: unknown,
  method = "POST",
  headers: Record<string, string> = {}
) =>
  new Request("https://x.workers.dev/api/lead", {
    method,
    ...(method === "GET" || method === "HEAD"
      ? {}
      : { body: typeof body === "string" ? body : JSON.stringify(body) }),
    headers: {
      "cf-connecting-ip": "203.0.113.7",
      "x-forwarded-for": "198.51.100.1",
      ...headers,
    },
  });

// The tests run on Node, whose fetch needs `duplex` for a stream body. workerd's
// RequestInit type doesn't have it, hence the cast.
const NODE_STREAM_BODY = { duplex: "half" } as RequestInit;

const parse = async (res: Response) => ({
  status: res.status,
  body: await res.json(),
});

describe("handler", () => {
  const verify = vi.fn<NonNullable<Deps["verify"]>>();
  const append = vi.fn<Deps["append"]>();
  const logInfo = vi.fn<Logger["info"]>();
  const logWarn = vi.fn<Logger["warn"]>();
  const logError = vi.fn<Logger["error"]>();
  const alert = vi.fn<Deps["alert"]>();
  let handler: ReturnType<typeof createHandler>;

  const makeHandler = (turnstileEnabled: boolean) =>
    createHandler({
      verify: turnstileEnabled ? verify : undefined,
      append,
      now: () => NOW,
      newId: () => LEAD_ID,
      log: { info: logInfo, warn: logWarn, error: logError },
      alert,
    });

  beforeEach(() => {
    vi.resetAllMocks();
    verify.mockResolvedValue({ success: true, errorCodes: [] });
    append.mockResolvedValue();
    handler = makeHandler(true);
  });

  it("saves a valid lead and returns its reference", async () => {
    const res = await parse(await handler(event(submission())));
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

  it("never writes answers to questions that weren't asked", async () => {
    // Sent by hand: the form itself never includes these.
    const sent = {
      ...lead,
      sponsor: {
        firstName: "Vikram",
        lastName: "Shah",
        nationality: "IN",
        emiratesId: "784198512345676",
      },
      members: {
        ...lead.members,
        self: { ...lead.members.self, pregnant: true },
        children: [
          {
            ...person("Aarav", 4),
            gender: Gender.Female,
            smoker: true,
            pregnant: true,
          },
        ],
      },
    };
    const res = await parse(await handler(event(submission({ lead: sent }))));
    expect(res.status).toBe(200);

    const [leadRow, memberRows = []] = append.mock.calls[0] ?? [];
    const leadCells = Object.fromEntries(
      LEAD_HEADERS.map((header, i) => [header, leadRow?.[i]])
    );
    expect(leadCells).toMatchObject({
      sponsor_first_name: "",
      sponsor_last_name: "",
      sponsor_nationality: "",
      sponsor_emirates_id: "",
      any_smoker: "No",
      any_pregnant: "No",
    });
    for (const row of memberRows) {
      const cells = Object.fromEntries(
        MEMBER_HEADERS.map((header, i) => [header, row[i]])
      );
      expect(cells.pregnant).not.toBe("Yes");
    }
  });

  it("skips the human check when Turnstile is switched off", async () => {
    const res = await makeHandler(false)(
      event(submission({ turnstileToken: undefined }))
    );

    expect(res.status).toBe(200);
    expect(verify).not.toHaveBeenCalled();
    expect(append).toHaveBeenCalledOnce();
  });

  it("requires a token when Turnstile is on", async () => {
    const res = await handler(event(submission({ turnstileToken: undefined })));

    expect(res.status).toBe(403);
    expect(append).not.toHaveBeenCalled();
  });

  it("rejects non-POST requests", async () => {
    const res = await handler(event(submission(), "GET"));
    expect(res.status).toBe(405);
  });

  it("returns a decoy success for honeypot hits without writing", async () => {
    const res = await parse(
      await handler(event(submission({ website: "http://spam" })))
    );
    expect(res.status).toBe(200);
    expect(verify).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it("returns a decoy success for impossibly fast submissions", async () => {
    const res = await parse(
      await handler(event(submission({ startedAt: NOW.getTime() - 500 })))
    );
    expect(res.status).toBe(200);
    expect(append).not.toHaveBeenCalled();
  });

  it.each([{}, { lead: null }, [], "null"])(
    "rejects a body without a lead object (%j) with 400",
    async (body) => {
      await expect(parse(await handler(event(body)))).resolves.toStrictEqual({
        status: 400,
        body: { ok: false, error: "invalid" },
      });
      expect(append).not.toHaveBeenCalled();
    }
  );

  it("rejects invalid payloads with 400", async () => {
    const bad = submission({ lead: { ...lead, consent: false } });
    await expect(parse(await handler(event(bad)))).resolves.toStrictEqual({
      status: 400,
      body: { ok: false, error: "invalid" },
    });
    await expect(
      parse(await handler(event("{not json")))
    ).resolves.toMatchObject({
      status: 400,
    });
  });

  it("rejects failed Turnstile checks with 403", async () => {
    verify.mockResolvedValue({
      success: false,
      errorCodes: ["invalid-input-response"],
    });
    await expect(
      parse(await handler(event(submission())))
    ).resolves.toStrictEqual({
      status: 403,
      body: { ok: false, error: "verification_failed" },
    });
    expect(append).not.toHaveBeenCalled();
  });

  it("returns 503 when the Sheet write fails", async () => {
    append.mockRejectedValue(new Error("Sheets API 429"));
    await expect(
      parse(await handler(event(submission())))
    ).resolves.toStrictEqual({
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
    expect(res.status).toBe(413);
  });

  it("rejects a declared Content-Length over 16 KB before reading", async () => {
    const req = new Request("https://x.workers.dev/api/lead", {
      method: "POST",
      body: new ReadableStream({
        pull() {
          throw new Error("body was read");
        },
      }),
      ...NODE_STREAM_BODY,
      headers: { "content-length": "20000" },
    });

    const res = await handler(req);
    expect(res.status).toBe(413);
    expect(append).not.toHaveBeenCalled();
  });

  it("rejects bodies over 16 KB even without Content-Length", async () => {
    const chunk = new TextEncoder().encode("x".repeat(4000));
    let pullCount = 0;
    const req = new Request("https://x.workers.dev/api/lead", {
      method: "POST",
      body: new ReadableStream({
        pull(controller) {
          pullCount += 1;
          controller.enqueue(chunk);
        },
      }),
      ...NODE_STREAM_BODY,
    });

    const res = await handler(req);
    expect(res.status).toBe(413);
    expect(append).not.toHaveBeenCalled();
    // Proves the stream was cancelled, not drained: a stream that never ends
    // would hang `text()` forever, so a small pull count shows the bounded
    // reader stopped as soon as it crossed MAX_BODY_BYTES.
    expect(pullCount).toBeLessThan(10);
  });

  it("accepts a 16 KB body streamed one byte at a time", async () => {
    const encoder = new TextEncoder();
    const base = JSON.stringify(submission());
    const baseBytes = encoder.encode(base);
    // Pad with trailing whitespace (JSON.parse ignores it) to land exactly on
    // the MAX_BODY_BYTES boundary, so this also proves the boundary itself
    // isn't rejected.
    const padded = base + " ".repeat(16 * 1024 - baseBytes.byteLength);
    const bytes = encoder.encode(padded);
    expect(bytes.byteLength).toBe(16 * 1024);

    let offset = 0;
    const req = new Request("https://x.workers.dev/api/lead", {
      method: "POST",
      body: new ReadableStream<Uint8Array>({
        pull(controller) {
          if (offset >= bytes.byteLength) {
            controller.close();
            return;
          }
          controller.enqueue(bytes.slice(offset, offset + 1));
          offset += 1;
        },
      }),
      ...NODE_STREAM_BODY,
    });

    const res = await parse(await handler(req));
    expect(res.status).not.toBe(413);
    expect(res.body).toStrictEqual({
      ok: true,
      reference: "7F3A-21C9",
    });
  });

  it("returns 400 when the body stream errors", async () => {
    const req = new Request("https://x.workers.dev/api/lead", {
      method: "POST",
      body: new ReadableStream({
        pull() {
          throw new Error("client disconnected");
        },
      }),
      ...NODE_STREAM_BODY,
    });

    const res = await parse(await handler(req));
    expect(res.status).toBe(400);
    expect(res.body).toStrictEqual({ ok: false, error: "invalid" });
    expect(append).not.toHaveBeenCalled();
    expect(logWarn).toHaveBeenCalledWith("lead_rejected", {
      reason: "body_unreadable",
    });
  });

  it("uses the Turnstile IP from cf-connecting-ip, ignoring x-forwarded-for", async () => {
    await handler(
      event(submission(), "POST", {
        "cf-connecting-ip": "203.0.113.7",
        "x-forwarded-for": "198.51.100.1",
      })
    );
    expect(verify).toHaveBeenCalledWith("token", "203.0.113.7");
  });

  it("has no Turnstile IP when cf-connecting-ip is absent, even with x-forwarded-for", async () => {
    const req = new Request("https://x.workers.dev/api/lead", {
      method: "POST",
      body: JSON.stringify(submission()),
      headers: { "x-forwarded-for": "198.51.100.1" },
    });
    await handler(req);
    expect(verify).toHaveBeenCalledWith("token", undefined);
  });

  it("alerts on a failed Sheet write with the lead ID", async () => {
    append.mockRejectedValue(new Error("Sheets API 429"));
    await handler(event(submission()));
    expect(alert).toHaveBeenCalledWith("sheet_write_failed", LEAD_ID);
  });

  it("alerts when Turnstile is unreachable", async () => {
    verify.mockRejectedValue(new Error("network down"));
    await handler(event(submission()));
    expect(alert).toHaveBeenCalledWith("turnstile_unreachable");
  });

  it("does not alert on rejections", async () => {
    await handler(event(submission({ lead: { ...lead, consent: false } })));
    await handler(event(submission({ website: "http://spam" })));
    verify.mockResolvedValue({
      success: false,
      errorCodes: ["invalid-input-response"],
    });
    await handler(event(submission()));
    expect(alert).not.toHaveBeenCalled();
  });
});

const baseConfig: Config = {
  sheet: {
    spreadsheetId: "sheet-id",
    leadsTab: "Leads",
    membersTab: "Members",
  },
  googleServiceAccount: { client_email: "a@b.iam", private_key: "key" },
  turnstile: { enabled: false },
  alertWebhookUrl: undefined,
};

describe(liveDeps, () => {
  it("is a no-op alert with no alertWebhookUrl configured, and never calls waitUntil", () => {
    const waitUntil = vi.fn<(promise: Promise<unknown>) => void>();
    const deps = liveDeps(baseConfig, waitUntil);

    expect(() => deps.alert("sheet_write_failed", "id")).not.toThrow();
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it("calls waitUntil once with a promise when a webhook is configured", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const waitUntil = vi.fn<(promise: Promise<unknown>) => void>();
    const deps = liveDeps(
      {
        ...baseConfig,
        alertWebhookUrl:
          "https://chat.googleapis.com/v1/spaces/x/messages?key=y",
      },
      waitUntil
    );

    deps.alert("sheet_write_failed", "id");

    expect(waitUntil).toHaveBeenCalledOnce();
    const [promise] = waitUntil.mock.calls[0] ?? [];
    expect(promise).toBeInstanceOf(Promise);
    await promise;
    expect(fetchMock).toHaveBeenCalledOnce();

    vi.unstubAllGlobals();
  });
});
