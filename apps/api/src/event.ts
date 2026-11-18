import { randomUUID } from "node:crypto";

import type { APIGatewayProxyEventV2 } from "aws-lambda";

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
