#!/usr/bin/env node
/**
 * Serve `npm run build` output (.vercel/output, Nitro's vercel preset) locally,
 * the way Vercel routes it: static files first, everything else to the server
 * function. `vite preview` cannot serve this preset, and the smoke suite wants
 * a production build (service worker, no dev-only test hooks).
 *
 * Usage: node scripts/serve-built.mjs [port=8080]
 */
import { createReadStream } from "node:fs";
import { copyFile, readdir, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";

const root = resolve(".vercel/output");
const staticDir = join(root, "static");
const port = Number(process.argv[2] || process.env.PORT || 8080);

// The bundle leaves out PGLite's runtime files (Vercel uses DATABASE_URL), but
// the local fallback DB loads them next to the bundled module.
const libs = join(root, "functions/__server.func/_libs");
const pgliteDist = resolve("node_modules/@electric-sql/pglite/dist");
for (const f of await readdir(pgliteDist)) {
  if (/\.(data|wasm)$/.test(f)) await copyFile(join(pgliteDist, f), join(libs, f)).catch(() => undefined);
}

const { default: fn } = await import(pathToFileURL(join(root, "functions/__server.func/index.mjs")).href);

const TYPES = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webmanifest": "application/manifest+json",
  ".json": "application/json",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
};

async function staticFile(pathname) {
  const file = normalize(join(staticDir, decodeURIComponent(pathname)));
  if (!file.startsWith(staticDir) || pathname === "/") return null;
  const s = await stat(file).catch(() => null);
  return s?.isFile() ? { file, size: s.size } : null;
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const hit = req.method === "GET" || req.method === "HEAD" ? await staticFile(url.pathname) : null;
    if (hit) {
      res.writeHead(200, {
        "content-type": TYPES[extname(hit.file)] ?? "application/octet-stream",
        "content-length": hit.size,
        "cache-control": url.pathname.startsWith("/assets/")
          ? "public, max-age=31536000, immutable"
          : "public, max-age=0, must-revalidate",
      });
      if (req.method === "HEAD") return res.end();
      return createReadStream(hit.file).pipe(res);
    }
    const body = req.method === "GET" || req.method === "HEAD" ? undefined : Readable.toWeb(req);
    const response = await fn.fetch(
      new Request(url, { method: req.method, headers: req.headers, body, duplex: "half" }),
      { waitUntil: () => {} },
    );
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(res);
    else res.end();
  } catch (err) {
    console.error(err);
    res.writeHead(500).end("serve-built: internal error");
  }
}).listen(port, "127.0.0.1", () => console.log(`serve-built: http://127.0.0.1:${port}/`));
