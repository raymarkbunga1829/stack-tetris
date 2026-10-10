#!/usr/bin/env node
/**
 * Serve `.vercel/output` (from `npx vite build`) on 127.0.0.1 the way Vercel
 * would: static files first, then the server function. `vite preview` cannot,
 * because the build targets the Vercel preset. For local perf probes only.
 * Usage: node scripts/serve-vercel-output.mjs [port] [outputDir]
 */
import { createServer } from "node:http";
import { copyFile, readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const port = Number(process.argv[2] || 8080);
const root = resolve(process.argv[3] || ".vercel/output");
const staticDir = join(root, "static");
// Vercel's bundler ships PGlite's runtime files next to the chunk; a bare build does not.
for (const f of ["pglite.data", "pglite.wasm", "initdb.wasm"]) {
  await copyFile(
    resolve("node_modules/@electric-sql/pglite/dist", f),
    join(root, "functions/__server.func/_libs", f),
  );
}
const fn = (await import(pathToFileURL(join(root, "functions/__server.func/index.mjs")).href)).default;

const TYPES = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
  ".html": "text/html",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
};

createServer(async (req, res) => {
  const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const file = normalize(join(staticDir, path));
  if (file.startsWith(staticDir) && path !== "/") {
    try {
      if ((await stat(file)).isFile()) {
        res.setHeader("content-type", TYPES[extname(file)] ?? "application/octet-stream");
        res.end(await readFile(file));
        return;
      }
    } catch {
      // fall through to the server function
    }
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v != null) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
  }
  const body = chunks.length && req.method !== "GET" && req.method !== "HEAD" ? Buffer.concat(chunks) : undefined;
  const out = await fn.fetch(new Request(`http://127.0.0.1:${port}${req.url}`, { method: req.method, headers, body }), {
    waitUntil() {},
  });
  res.statusCode = out.status;
  out.headers.forEach((v, k) => res.setHeader(k, v));
  res.end(Buffer.from(await out.arrayBuffer()));
}).listen(port, "127.0.0.1", () => console.log(`serving .vercel/output on http://127.0.0.1:${port}`));
