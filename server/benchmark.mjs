import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { serveStatic } from "./static.js";
import { requestJev } from "./jev.js";
import { validateSnapshot } from "../duel/contract.js";
import { CONFIG as C } from "../duel/config.js";

export function createBenchmarkServer({
  key = "",
  enabled = false,
  model = "jev-1.13.0",
  maxRequests = 1000,
  fetchImpl = fetch,
} = {}) {
  const token = randomBytes(32).toString("hex");
  let busy = false,
    requests = 0,
    lastRequest = -Infinity;
  if (
    !/^jev-[a-zA-Z0-9_.-]{1,60}$/.test(model) ||
    !Number.isInteger(maxRequests) ||
    maxRequests < 1 ||
    maxRequests > 10000
  )
    throw new Error("Invalid server configuration");
  const json = (res, status, body) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(JSON.stringify(body));
  };
  const server = createServer(async (req, res) => {
    const expectedHost = `127.0.0.1:${server.address().port}`,
      origin = `http://${expectedHost}`;
    if (req.headers.host !== expectedHost)
      return json(res, 403, {
        error: "Use the loopback URL printed by the server",
      });
    if (req.url === "/api/config" && req.method === "GET")
      return json(res, 200, {
        liveEnabled: enabled && !!key,
        model,
        token,
        remainingRequests: maxRequests - requests,
      });
    if (req.url !== "/api/jev/decision") return serveStatic(req, res);
    if (
      req.method !== "POST" ||
      req.headers.origin !== origin ||
      req.headers["x-duel-token"] !== token ||
      req.headers["content-type"] !== "application/json" ||
      (req.headers["sec-fetch-site"] &&
        req.headers["sec-fetch-site"] !== "same-origin")
    )
      return json(res, 403, { error: "Local same-origin session required" });
    if (!enabled || !key)
      return json(res, 503, {
        error: "Live Jev is disabled. Configure the local server.",
      });
    if (
      busy ||
      performance.now() - lastRequest < 200 ||
      requests >= maxRequests
    )
      return json(res, 429, {
        error: "Request limit reached or request already pending",
      });
    busy = true;
    try {
      let size = 0,
        chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 16384) {
          json(res, 413, { error: "Request too large" });
          return;
        }
        chunks.push(chunk);
      }
      let snapshot;
      try {
        const body = JSON.parse(Buffer.concat(chunks).toString());
        if (Object.keys(body).length !== 1) throw new Error();
        snapshot = validateSnapshot(body.snapshot);
      } catch {
        return json(res, 400, { error: "Invalid tactical snapshot" });
      }
      requests++;
      lastRequest = performance.now();
      const controller = new AbortController(),
        timer = setTimeout(() => controller.abort(), C.timeoutMs);
      res.once("close", () => {
        if (!res.writableEnded) controller.abort();
      });
      try {
        json(
          res,
          200,
          await requestJev(snapshot, {
            key,
            model,
            fetchImpl,
            signal: controller.signal,
          }),
        );
      } catch (error) {
        const message = /^Provider HTTP \d{3}$/.test(error.message)
          ? error.message
          : controller.signal.aborted
            ? "Provider timeout"
            : "Provider request failed or response malformed";
        json(res, 502, { error: message });
      } finally {
        clearTimeout(timer);
      }
    } catch {
      if (!res.writableEnded) json(res, 400, { error: "Invalid request" });
    } finally {
      busy = false;
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  return server;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const port = Number(process.env.PORT || 8765);
  const server = createBenchmarkServer({
    key: process.env.JEV_API_KEY,
    enabled: process.env.JEV_LIVE_ENABLED === "1",
    model: process.env.JEV_MODEL || "jev-1.13.0",
    maxRequests: Number(process.env.JEV_MAX_REQUESTS || 1000),
  });
  server.listen(port, "127.0.0.1", () =>
    console.log(
      `AI Duel Lab: http://127.0.0.1:${server.address().port}/duel.html (live ${process.env.JEV_LIVE_ENABLED === "1" && !!process.env.JEV_API_KEY ? "enabled" : "disabled"})`,
    ),
  );
}
