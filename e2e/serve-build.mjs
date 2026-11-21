// Serve the production build locally the way Vercel does, for the iPhone
// hydration check (e2e/). `vite build` writes Vercel's output format
// (.vercel/output): static files, plus one server function for everything
// else. Vercel's routing is "file if it exists, otherwise the function"
// (.vercel/output/config.json), which is all this does. Testing the real build
// matters: hydration timing (code-split chunks, minified React) differs from
// the dev server.
//
//   node e2e/serve-build.mjs          (port from PORT, default 4173)

import http from "node:http";
import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../.vercel/output/", import.meta.url));
const staticDir = join(root, "static");
const port = Number(process.env.PORT || 4173);
const { default: fn } = await import(pathToFileURL(join(root, "functions/__server.func/index.mjs")).href);

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon",
  ".woff2": "font/woff2", ".woff": "font/woff", ".txt": "text/plain", ".map": "application/json",
};

function staticFile(pathname) {
  const p = normalize(join(staticDir, decodeURIComponent(pathname)));
  if (!p.startsWith(staticDir)) return null;
  try {
    const s = statSync(p);
    if (s.isFile()) return p;
  } catch { /* not a file */ }
  return null;
}

http
  .createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "127.0.0.1"}`);
      const file = (req.method === "GET" || req.method === "HEAD") && url.pathname !== "/" ? staticFile(url.pathname) : null;
      if (file) {
        res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
        if (req.method === "HEAD") return res.end();
        return createReadStream(file).pipe(res);
      }
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
      const hasBody = req.method !== "GET" && req.method !== "HEAD";
      const request = new Request(url, { method: req.method, headers, ...(hasBody ? { body: Readable.toWeb(req), duplex: "half" } : {}) });
      const response = await fn.fetch(request, { waitUntil: () => {} });
      const out = {};
      response.headers.forEach((v, k) => { out[k] = v; });
      const cookies = response.headers.getSetCookie?.() ?? [];
      if (cookies.length) out["set-cookie"] = cookies;
      res.writeHead(response.status, out);
      if (!response.body) return res.end();
      Readable.fromWeb(response.body).pipe(res);
    } catch (err) {
      console.error("[serve-build]", err);
      if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain" });
      res.end("serve-build error");
    }
  })
  .listen(port, "127.0.0.1", () => console.log(`[serve-build] .vercel/output on http://127.0.0.1:${port}`));
