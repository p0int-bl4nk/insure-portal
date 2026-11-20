import type { Config } from "./config.ts";
import { loadConfig } from "./config.ts";
import { createHandler, liveDeps } from "./handler.ts";
import { log } from "./log.ts";

const LEAD_PATH = "/api/lead";

// One Worker serves the SPA and the lead API. `run_worker_first` sends only /api/*
// here; anything else that reaches us (e.g. an unknown /api path) goes to assets.
export default {
  fetch: (request, env, ctx) => {
    if (new URL(request.url).pathname !== LEAD_PATH) {
      return env.ASSETS.fetch(request);
    }

    let config: Config;
    try {
      config = loadConfig({ ...env });
    } catch (error) {
      // Zod messages name the bad keys, never their values.
      log.error("config_invalid", { message: String(error) });
      return Promise.resolve(
        Response.json(
          { ok: false, error: "unavailable" },
          { status: 503, headers: { "cache-control": "no-store" } }
        )
      );
    }

    return createHandler(liveDeps(config, (p) => ctx.waitUntil(p)))(request);
  },
} satisfies ExportedHandler<Env>;
