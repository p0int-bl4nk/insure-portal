import { z } from "zod";

import { serviceAccountSchema } from "./secrets.ts";
import { jsonText } from "./utils.ts";

const SHEET_ID = /^[\w-]{20,}$/u;

const baseEnvSchema = z.object({
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
  PORT: z.coerce
    .number()
    .int()
    .positive()
    .default(8787)
    .describe("Local dev server only."),
});

const secretsSourceSchema = z
  .union(
    [
      z
        .object({ APP_SECRET_ID: z.string().min(1) })
        .transform(({ APP_SECRET_ID }) => ({
          kind: "secretsManager" as const,
          secretId: APP_SECRET_ID,
        })),
      z
        .object({
          GOOGLE_SERVICE_ACCOUNT_JSON: jsonText.pipe(serviceAccountSchema),
          TURNSTILE_SECRET_KEY: z
            .string()
            .min(1)
            .optional()
            .describe("Only needed while TURNSTILE_ENABLED is on."),
        })
        .transform((env) => ({
          kind: "env" as const,
          secrets: {
            googleServiceAccount: env.GOOGLE_SERVICE_ACCOUNT_JSON,
            turnstileSecretKey: env.TURNSTILE_SECRET_KEY,
          },
        })),
    ],
    {
      error:
        "Set APP_SECRET_ID (AWS) or GOOGLE_SERVICE_ACCOUNT_JSON with a service-account key (local)",
    }
  )
  .describe(
    "Secrets Manager in AWS (APP_SECRET_ID set); otherwise the same values from env vars."
  );

const configSchema = baseEnvSchema
  .and(secretsSourceSchema.transform((secrets) => ({ secrets })))
  .transform((env) => ({
    sheet: {
      spreadsheetId: env.SPREADSHEET_ID,
      leadsTab: env.SHEET_LEADS_TAB,
      membersTab: env.SHEET_MEMBERS_TAB,
    },
    turnstileEnabled: env.TURNSTILE_ENABLED,
    port: env.PORT,
    secrets: env.secrets,
  }));

export type Config = z.output<typeof configSchema>;
export type SheetConfig = Config["sheet"];
export type SecretsSource = Config["secrets"];

/** Parses an environment, reporting every bad or missing variable at once. */
export const parseConfig = (
  env: Record<string, string | undefined>
): Config => {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(result.error)}`);
  }

  return result.data;
};

let cached: Config | undefined;

/** The app config from process.env, parsed once per process. */
export const getConfig = (): Config => {
  cached ??= parseConfig(process.env);

  return cached;
};
