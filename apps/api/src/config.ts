import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { z } from "zod";

import { jsonText } from "./utils.ts";

const SHEET_ID = /^[\w-]{20,}$/u;

const serviceAccountSchema = z.object({
  client_email: z.string().min(1),
  private_key: z.string().min(1),
});

const secretsSchema = z
  .object({
    googleServiceAccount: serviceAccountSchema,
    turnstileSecretKey: z
      .string()
      .min(1)
      .optional()
      .describe("Only needed while TURNSTILE_ENABLED is on."),
  })
  .describe("Shape of the Secrets Manager secret (see README).");

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
          TURNSTILE_SECRET_KEY: secretsSchema.shape.turnstileSecretKey,
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

const envSchema = baseEnvSchema
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

const turnstileSchema = z
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

export type ServiceAccount = z.output<typeof serviceAccountSchema>;
export type Env = z.output<typeof envSchema>;
export type SheetConfig = Env["sheet"];

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

/** Parses an environment's variables, before any secret is fetched. */
export const parseEnv = (env: Record<string, string | undefined>): Env =>
  parseOrThrow(envSchema, env, "environment");

/** The Secrets Manager secret's JSON text. */
const fetchSecret = async (secretId: string) => {
  const client = new SecretsManagerClient({});
  const { SecretString } = await client.send(
    new GetSecretValueCommand({ SecretId: secretId })
  );

  return SecretString;
};

/** The full config: env vars plus secrets (Secrets Manager in AWS, env vars locally). */
export const loadConfig = async (
  rawEnv: Record<string, string | undefined>,
  fetch: (secretId: string) => Promise<string | undefined> = fetchSecret
) => {
  const { secrets: source, turnstileEnabled, ...env } = parseEnv(rawEnv);
  const secrets =
    source.kind === "secretsManager"
      ? parseOrThrow(
          jsonText.pipe(secretsSchema),
          await fetch(source.secretId),
          "app secret"
        )
      : source.secrets;

  return {
    ...env,
    googleServiceAccount: secrets.googleServiceAccount,
    turnstile: parseOrThrow(
      turnstileSchema,
      { enabled: turnstileEnabled, secretKey: secrets.turnstileSecretKey },
      "Turnstile config"
    ),
  };
};

export type Config = Awaited<ReturnType<typeof loadConfig>>;

let cached: Promise<Config> | undefined;

/** The config from process.env, loaded once per process (Lambda instance). */
export const getConfig = (): Promise<Config> => {
  if (!cached) {
    cached = loadConfig(process.env);
    // Let a failed load be retried by the next call instead of caching the failure.
    cached.catch(() => {
      cached = undefined;
    });
  }

  return cached;
};
