import { randomUUID } from "node:crypto";

import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { z } from "zod";

export const jsonText = z
  .string()
  .transform((text, ctx): unknown => {
    try {
      return JSON.parse(text);
    } catch {
      ctx.addIssue({ code: "custom", message: "Not valid JSON" });
      return z.NEVER;
    }
  })
  .describe(
    "JSON text → parsed value. Malformed JSON is reported as a schema issue."
  );

const gstFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Dubai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/** "2026-11-18 14:05:33" in Gulf Standard Time (UTC+4). */
export const formatGst = (date: Date): string => {
  const p = Object.fromEntries(
    gstFormatter.formatToParts(date).map((part) => [part.type, part.value])
  );

  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
};

/** Short human reference derived from the lead ID, e.g. "7F3A-21C9". */
export const toReference = (leadId: string): string => {
  const hex = leadId.replaceAll("-", "").slice(0, 8).toUpperCase();

  return `${hex.slice(0, 4)}-${hex.slice(4)}`;
};

/** A complete API Gateway HTTP API (v2) event, for the dev server and tests. */
export const toApiEvent = ({
  method,
  path,
  headers = {},
  body,
  sourceIp = "127.0.0.1",
}: {
  method: string;
  path: string;
  headers?: APIGatewayProxyEventV2["headers"];
  body?: string;
  sourceIp?: string;
}): APIGatewayProxyEventV2 => {
  const now = new Date();
  const routeKey = `${method} ${path}`;
  return {
    version: "2.0",
    routeKey,
    rawPath: path,
    rawQueryString: "",
    headers,
    body,
    isBase64Encoded: false,
    requestContext: {
      accountId: "local",
      apiId: "local",
      domainName: "localhost",
      domainPrefix: "localhost",
      requestId: randomUUID(),
      routeKey,
      stage: "$default",
      time: now.toUTCString(),
      timeEpoch: now.getTime(),
      http: {
        method,
        path,
        protocol: "HTTP/1.1",
        sourceIp,
        userAgent: headers["user-agent"] ?? "",
      },
    },
  };
};
