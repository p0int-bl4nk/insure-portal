import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

export interface ServiceAccount {
  client_email: string;
  private_key: string;
}

export interface AppSecrets {
  googleServiceAccount: ServiceAccount;
  turnstileSecretKey: string;
}

const parseServiceAccount = (raw: unknown): ServiceAccount => {
  const sa = (
    typeof raw === "string" ? JSON.parse(raw) : raw
  ) as Partial<ServiceAccount>;
  if (!(sa?.client_email && sa.private_key)) {
    throw new Error(
      "Service account JSON is missing client_email or private_key"
    );
  }
  return { client_email: sa.client_email, private_key: sa.private_key };
};

const loadFromSecretsManager = async (
  secretId: string
): Promise<AppSecrets> => {
  const client = new SecretsManagerClient({});
  const { SecretString } = await client.send(
    new GetSecretValueCommand({ SecretId: secretId })
  );
  if (!SecretString) {
    throw new Error("App secret is empty");
  }
  const parsed = JSON.parse(SecretString) as {
    googleServiceAccount?: unknown;
    turnstileSecretKey?: string;
  };
  if (!parsed.turnstileSecretKey) {
    throw new Error("App secret is missing turnstileSecretKey");
  }
  return {
    googleServiceAccount: parseServiceAccount(parsed.googleServiceAccount),
    turnstileSecretKey: parsed.turnstileSecretKey,
  };
};

const loadFromEnv = (): AppSecrets => {
  const { GOOGLE_SERVICE_ACCOUNT_JSON, TURNSTILE_SECRET_KEY } = process.env;
  if (!(GOOGLE_SERVICE_ACCOUNT_JSON && TURNSTILE_SECRET_KEY)) {
    throw new Error(
      "Set APP_SECRET_ID (AWS) or GOOGLE_SERVICE_ACCOUNT_JSON and TURNSTILE_SECRET_KEY (local)"
    );
  }
  return {
    googleServiceAccount: parseServiceAccount(GOOGLE_SERVICE_ACCOUNT_JSON),
    turnstileSecretKey: TURNSTILE_SECRET_KEY,
  };
};

let cached: Promise<AppSecrets> | undefined;

/** Loaded once per Lambda instance: Secrets Manager in AWS, env vars locally. */
export const getSecrets = (): Promise<AppSecrets> => {
  if (!cached) {
    const secretId = process.env.APP_SECRET_ID;
    cached = secretId
      ? loadFromSecretsManager(secretId)
      : Promise.resolve().then(loadFromEnv);
    // Let a failed load be retried by the next request instead of caching the failure.
    cached.catch(() => {
      cached = undefined;
    });
  }
  return cached;
};
