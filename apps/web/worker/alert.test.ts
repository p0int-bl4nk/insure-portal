import { describe, expect, it, vi } from "vitest";

import { postAlert } from "./alert.ts";

const LEAD_ID = "7f3a21c9-0000-4000-8000-000000000000";
const WEBHOOK_URL = "https://chat.googleapis.com/v1/spaces/x/messages?key=y";

describe(postAlert, () => {
  it("posts the event and lead ID as a Chat message", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 200 }));

    await postAlert(WEBHOOK_URL, "sheet_write_failed", LEAD_ID, fetchMock);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(WEBHOOK_URL);
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toStrictEqual({
      text: "insure-portal: sheet_write_failed (lead 7f3a21c9-0000-4000-8000-000000000000)",
    });
  });

  it("never throws when the webhook fails", async () => {
    const rejecting = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("network down"));
    await expect(
      postAlert(WEBHOOK_URL, "turnstile_unreachable", undefined, rejecting)
    ).resolves.toBeUndefined();

    const erroring = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 500 }));
    await expect(
      postAlert(WEBHOOK_URL, "turnstile_unreachable", undefined, erroring)
    ).resolves.toBeUndefined();
  });
});
