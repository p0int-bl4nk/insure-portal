// Structured logging. Lambda's JSON log format turns console output into JSON with the
// request ID attached. NEVER pass names, mobiles, emails or health data in here — only
// identifiers, outcomes and error codes.

type Fields = Record<string, string | number | boolean | undefined>;

export const log = {
  info: (event: string, fields: Fields = {}) =>
    console.info({ event, ...fields }),
  warn: (event: string, fields: Fields = {}) =>
    console.warn({ event, ...fields }),
  error: (event: string, fields: Fields = {}) =>
    console.error({ event, ...fields }),
};

export type Logger = typeof log;
