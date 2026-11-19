import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { z } from "zod";

import { jsonText } from "./json.ts";

const serviceAccountSchema = z.object({
  client_email: z.string().min(1),
  private_key: z.string().min(1),
});

/** Shape of the Secrets Manager secret (see README). */
const appSecretsSchema = z.object({
  googleServiceAccount: serviceAccountSchema,
  // Only needed while TURNSTILE_ENABLED is on.
  turnstileSecretKey: z.string().min(1).optional(),
});

/** Local development: the same values from env vars. */
const localEnvSchema = z
  .object({
    GOOGLE_SERVICE_ACCOUNT_JSON: jsonText.pipe(serviceAccountSchema),
    TURNSTILE_SECRET_KEY: z.string().min(1).optional(),
  })
  .transform(
    ({ GOOGLE_SERVICE_ACCOUNT_JSON, TURNSTILE_SECRET_KEY }): AppSecrets => ({
      googleServiceAccount: GOOGLE_SERVICE_ACCOUNT_JSON,
      turnstileSecretKey: TURNSTILE_SECRET_KEY,
    })
  );

export type ServiceAccount = z.infer<typeof serviceAccountSchema>;
export type AppSecrets = z.infer<typeof appSecretsSchema>;

const loadFromSecretsManager = async (secretId: string) => {
  const client = new SecretsManagerClient({});
  const { SecretString } = await client.send(
    new GetSecretValueCommand({ SecretId: secretId })
  );
  return jsonText.pipe(appSecretsSchema).parse(SecretString);
};

let cached: Promise<AppSecrets> | undefined;

/** Loaded once per Lambda instance: Secrets Manager in AWS, env vars locally. */
export const getSecrets = (): Promise<AppSecrets> => {
  if (!cached) {
    const secretId = process.env.APP_SECRET_ID;
    cached = secretId
      ? loadFromSecretsManager(secretId)
      : Promise.resolve().then(() => localEnvSchema.parse(process.env));
    // Let a failed load be retried by the next request instead of caching the failure.
    cached.catch(() => {
      cached = undefined;
    });
  }
  return cached;
};
