// Local stand-in for API Gateway: wraps the Lambda handler in a plain HTTP server.
// Vite proxies /api/* here during development.
import { createServer } from "node:http";

import type { APIGatewayProxyEventV2 } from "aws-lambda";

import { handler } from "./handler.ts";

const port = Number(process.env.PORT ?? 8787);

createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);
  const headers = Object.fromEntries(
    Object.entries(req.headers).map(([k, v]) => [
      k,
      Array.isArray(v) ? v.join(",") : v,
    ])
  );

  const event = {
    version: "2.0",
    routeKey: `${req.method} ${url.pathname}`,
    rawPath: url.pathname,
    rawQueryString: url.search.slice(1),
    headers,
    body: Buffer.concat(chunks).toString("utf-8"),
    isBase64Encoded: false,
    requestContext: {
      http: {
        method: req.method ?? "GET",
        path: url.pathname,
        protocol: "HTTP/1.1",
        sourceIp: req.socket.remoteAddress ?? "127.0.0.1",
        userAgent: req.headers["user-agent"] ?? "",
      },
    },
  } as APIGatewayProxyEventV2;

  if (url.pathname !== "/api/lead") {
    res.writeHead(404).end();
    return;
  }
  const result = await handler(event);
  res.writeHead(
    result.statusCode ?? 200,
    result.headers as Record<string, string>
  );
  res.end(result.body);
}).listen(port, () => {
  console.info(`API dev server on http://localhost:${port}/api/lead`);
});
