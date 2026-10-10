/**
 * Emits /sw.js from src/sw.js on every client build, stamped with the build id
 * and the exact hashed asset list. Every deploy therefore ships a byte-different
 * worker with its own cache name, which is what makes browsers (including iOS
 * home-screen installs) see an update. The page reads the same id from
 * import.meta.env.VITE_STACK_BUILD.
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const TEMPLATE_URL = new URL("../src/sw.js", import.meta.url);
const VERSION_LINE = 'const VERSION = "dev";';
const ASSETS_LINE = "const ASSETS = [];";

function gitSha() {
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

/** Short commit id for the build, or a build-time stamp when git is unavailable. */
export function resolveBuildId(env = process.env, now = Date.now()) {
  if (env.STACK_BUILD_ID) return env.STACK_BUILD_ID;
  const sha = env.VERCEL_GIT_COMMIT_SHA || gitSha();
  return sha ? sha.slice(0, 7) : `t${now.toString(36)}`;
}

/** Same commit and same bundle give the same worker, so a redeploy does not nag. */
export function workerVersion(buildId, assets) {
  const digest = createHash("sha256")
    .update([...assets].sort().join("\n"))
    .digest("hex");
  return `${buildId}-${digest.slice(0, 8)}`;
}

export function renderServiceWorker(template, { version, assets }) {
  if (!template.includes(VERSION_LINE) || !template.includes(ASSETS_LINE)) {
    throw new Error("src/sw.js lost its VERSION/ASSETS placeholder lines");
  }
  return template
    .replace(VERSION_LINE, `const VERSION = ${JSON.stringify(version)};`)
    .replace(ASSETS_LINE, `const ASSETS = ${JSON.stringify(assets)};`);
}

export function bundleAssets(bundle) {
  return Object.keys(bundle)
    .filter((file) => !file.endsWith(".map") && !file.endsWith(".html") && file !== "sw.js")
    .map((file) => `/${file}`)
    .sort();
}

export function serviceWorkerPlugin() {
  const buildId = resolveBuildId();
  return {
    name: "stack:service-worker",
    config() {
      return { define: { "import.meta.env.VITE_STACK_BUILD": JSON.stringify(buildId) } };
    },
    generateBundle(_options, bundle) {
      if (this.environment && this.environment.name !== "client") return;
      const assets = bundleAssets(bundle);
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: renderServiceWorker(readFileSync(TEMPLATE_URL, "utf8"), {
          version: workerVersion(buildId, assets),
          assets,
        }),
      });
    },
  };
}
