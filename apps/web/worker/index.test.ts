import { afterEach, describe, expect, it, vi } from "vitest";

import worker from "./index.ts";

const ENV = {
  SPREADSHEET_ID: "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abc",
  GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({
    client_email: "a@b.iam",
    private_key: "key",
  }),
};

const ctx = {
  waitUntil: vi.fn<ExecutionContext["waitUntil"]>(),
  passThroughOnException: vi.fn<ExecutionContext["passThroughOnException"]>(),
} as unknown as ExecutionContext;

// The handler is typed for incoming requests, which carry `cf` properties.
const req = (url: string, init?: RequestInit) =>
  new Request(url, init) as Request<unknown, IncomingRequestCfProperties>;

const withAssets = (env: Record<string, unknown>) => {
  const assetsFetch = vi
    .fn<Fetcher["fetch"]>()
    .mockResolvedValue(new Response("<html></html>"));
  return {
    env: { ...env, ASSETS: { fetch: assetsFetch } } as unknown as Env,
    assetsFetch,
  };
};

describe(worker.fetch, () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("serves non-API paths from assets", async () => {
    const { env, assetsFetch } = withAssets({});
    const request = req("https://example.com/some/page");

    const response = await worker.fetch(request, env, ctx);

    expect(assetsFetch).toHaveBeenCalledWith(request);
    await expect(response.text()).resolves.toBe("<html></html>");
  });

  it("returns 503 when the config is invalid", async () => {
    const consoleError = vi.spyOn(console, "error").mockReturnValue();
    const { env, assetsFetch } = withAssets({});

    const response = await worker.fetch(
      req("https://example.com/api/lead", {
        method: "POST",
        body: "{}",
      }),
      env,
      ctx
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toStrictEqual({
      ok: false,
      error: "unavailable",
    });
    expect(consoleError).toHaveBeenCalledWith(
      expect.objectContaining({ event: "config_invalid" })
    );
    expect(assetsFetch).not.toHaveBeenCalled();
  });

  it("routes /api/lead to the handler", async () => {
    const { env, assetsFetch } = withAssets(ENV);

    const response = await worker.fetch(
      req("https://example.com/api/lead"),
      env,
      ctx
    );

    expect(response.status).toBe(405);
    expect(assetsFetch).not.toHaveBeenCalled();
  });
});
