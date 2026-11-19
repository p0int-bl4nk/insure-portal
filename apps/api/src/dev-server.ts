// Local stand-in for API Gateway: wraps the Lambda handler in a plain HTTP server.
// Vite proxies /api/* here during development.
import { createServer } from "node:http";
import { text } from "node:stream/consumers";

import { getConfig } from "./config.ts";
import { handler } from "./handler.ts";
import { toApiEvent } from "./utils.ts";

const { port } = getConfig();

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${port}`);
  if (url.pathname !== "/api/lead") {
    res.writeHead(404).end();
    return;
  }

  const result = await handler(
    toApiEvent({
      method: req.method ?? "GET",
      path: url.pathname,
      headers: Object.fromEntries(
        Object.entries(req.headers).map(([name, value]) => [
          name,
          Array.isArray(value) ? value.join(",") : value,
        ])
      ),
      body: await text(req),
      sourceIp: req.socket.remoteAddress,
    })
  );
  res.writeHead(
    result.statusCode ?? 200,
    Object.fromEntries(
      Object.entries(result.headers ?? {}).map(([name, value]) => [
        name,
        String(value),
      ])
    )
  );
  res.end(result.body);
}).listen(port, () => {
  console.info(`API dev server on http://localhost:${port}/api/lead`);
});
