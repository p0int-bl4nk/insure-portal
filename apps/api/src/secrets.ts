import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { z } from "zod";

import type { SecretsSource } from "./config.ts";
import { jsonText } from "./utils.ts";

export const serviceAccountSchema = z.object({
  client_email: z.string().min(1),
  private_key: z.string().min(1),
});

const appSecretsSchema = z
  .object({
    googleServiceAccount: serviceAccountSchema,
    turnstileSecretKey: z
      .string()
      .min(1)
      .optional()
      .describe("Only needed while TURNSTILE_ENABLED is on."),
  })
  .describe("Shape of the Secrets Manager secret (see README).");

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
export const getSecrets = (source: SecretsSource): Promise<AppSecrets> => {
  if (!cached) {
    cached =
      source.kind === "secretsManager"
        ? loadFromSecretsManager(source.secretId)
        : Promise.resolve(source.secrets);
    // Let a failed load be retried by the next request instead of caching the failure.
    cached.catch(() => {
      cached = undefined;
    });
  }
  return cached;
};
