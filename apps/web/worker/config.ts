import { z } from "zod";

import { jsonText } from "./utils.ts";

const SHEET_ID = /^[\w-]{20,}$/u;

export const serviceAccountSchema = z.object({
  client_email: z.string().min(1),
  private_key: z.string().min(1),
});

export const turnstileSchema = z
  .discriminatedUnion("enabled", [
    z.object({
      enabled: z.literal(true),
      secretKey: z.string(
        "TURNSTILE_ENABLED is on but no Turnstile secret key is configured"
      ),
    }),
    z.object({ enabled: z.literal(false) }),
  ])
  .describe("The key is required only while the check is on.");

/** An https URL on Google Chat's domain, where incoming-webhook alerts are posted. */
const alertWebhookUrlSchema = z
  .url()
  .refine((url) => {
    if (!URL.canParse(url)) {
      return false;
    }
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" && parsed.host === "chat.googleapis.com"
    );
  }, "ALERT_WEBHOOK_URL must be an https:// URL on chat.googleapis.com")
  .describe("A Google Chat incoming-webhook URL.");

/**
 * The Worker's env: string vars plus binding objects (ASSETS, KV, …). Only the keys
 * below are read; everything else, of any shape, passes through untouched.
 */
export type RawEnv = Record<string, unknown>;

/** Parses with a schema, reporting every problem at once. */
const parseOrThrow = <T extends z.ZodType>(
  schema: T,
  value: unknown,
  what: string
): z.output<T> => {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new Error(`Invalid ${what}:\n${z.prettifyError(result.error)}`);
  }

  return result.data;
};

const envSchema = z
  .looseObject({
    SPREADSHEET_ID: z
      .string("SPREADSHEET_ID is not set")
      .trim()
      .regex(SHEET_ID, "SPREADSHEET_ID must be the Sheet ID from its URL")
      .describe("The long ID in the Sheet URL: …/spreadsheets/d/<id>/edit"),
    SHEET_LEADS_TAB: z.string().min(1).default("Leads"),
    SHEET_MEMBERS_TAB: z.string().min(1).default("Members"),
    TURNSTILE_ENABLED: z
      .stringbool()
      .default(false)
      .describe(
        "Cloudflare Turnstile human check. Production should turn it on."
      ),
    GOOGLE_SERVICE_ACCOUNT_JSON: jsonText.pipe(serviceAccountSchema),
    TURNSTILE_SECRET_KEY: z
      .string()
      .min(1)
      .optional()
      .describe("Only needed while TURNSTILE_ENABLED is on."),
    ALERT_WEBHOOK_URL: alertWebhookUrlSchema.optional(),
  })
  .transform((env): Config => ({
    sheet: {
      spreadsheetId: env.SPREADSHEET_ID,
      leadsTab: env.SHEET_LEADS_TAB,
      membersTab: env.SHEET_MEMBERS_TAB,
    },
    googleServiceAccount: env.GOOGLE_SERVICE_ACCOUNT_JSON,
    turnstile: parseOrThrow(
      turnstileSchema,
      {
        enabled: env.TURNSTILE_ENABLED,
        secretKey: env.TURNSTILE_SECRET_KEY,
      },
      "Turnstile config"
    ),
    alertWebhookUrl: env.ALERT_WEBHOOK_URL,
  }))
  .describe("The Worker's env vars, narrowed to a validated Config.");

export type ServiceAccount = z.output<typeof serviceAccountSchema>;

export interface SheetConfig {
  spreadsheetId: string;
  leadsTab: string;
  membersTab: string;
}

export interface Config {
  sheet: SheetConfig;
  googleServiceAccount: ServiceAccount;
  turnstile: z.output<typeof turnstileSchema>;
  alertWebhookUrl: string | undefined;
}

/** The full config, read straight from the Worker's env. No secrets fetch, no async. */
export const loadConfig = (env: RawEnv): Config =>
  parseOrThrow(envSchema, env, "environment");
