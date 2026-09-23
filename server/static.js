import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = new URL("../", import.meta.url);
export const publicFiles = [
  "index.html",
  "duel.html",
  "duel/style.css",
  "duel/ui.js",
  "duel/render.js",
  "duel/config.js",
  "duel/combat.js",
  "duel/tracking.js",
  "duel/observation.js",
  "duel/simulation.js",
  "duel/policy.js",
  "duel/runner.js",
  "duel/contract.js",
  "duel/client.js",
];
export async function serveStatic(request, response) {
  if (request.url === "/api/config") {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end('{"liveEnabled":false}');
    return;
  }
  const path =
    new URL(request.url, "http://localhost").pathname.slice(1) || "index.html";
  if (
    !["GET", "HEAD"].includes(request.method) ||
    !publicFiles.includes(path)
  ) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  try {
    const data = await readFile(fileURLToPath(new URL(path, root)));
    const type = path.endsWith(".js")
      ? "text/javascript"
      : path.endsWith(".css")
        ? "text/css"
        : "text/html";
    response.writeHead(200, {
      "Content-Type": `${type}; charset=utf-8`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-store",
    });
    response.end(request.method === "HEAD" ? undefined : data);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}
