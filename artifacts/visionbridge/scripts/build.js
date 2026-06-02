/**
 * Production build script for VisionBridge (Expo).
 *
 * Runs `expo export` to produce OTA-compatible platform bundles, then
 * writes them to `static-build/` where serve.js can pick them up.
 *
 * Usage (called by `pnpm run build`):
 *   node scripts/build.js
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const OUT_DIR = path.join(ROOT, "static-build");

// ── Resolve the public API URL ────────────────────────────────────────────────
// In production REPLIT_DOMAINS is a comma-separated list; take the first entry.
const replitDomains = process.env.REPLIT_DOMAINS ?? "";
const primaryDomain = replitDomains.split(",")[0]?.trim();
const apiUrl = primaryDomain
  ? `https://${primaryDomain}`
  : process.env.EXPO_PUBLIC_API_URL ?? "";

if (!apiUrl) {
  console.warn(
    "[build] Warning: REPLIT_DOMAINS and EXPO_PUBLIC_API_URL are both unset." +
      " The app will try to reach the API at an empty base URL."
  );
}

// ── Clean previous build ─────────────────────────────────────────────────────
if (fs.existsSync(OUT_DIR)) {
  console.log(`[build] Removing previous build at ${OUT_DIR}`);
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
}

// ── Run expo export ───────────────────────────────────────────────────────────
console.log(`[build] Exporting Expo app → ${OUT_DIR}`);
console.log(`[build] EXPO_PUBLIC_API_URL = ${apiUrl}`);

execSync(`pnpm exec expo export --output-dir ${OUT_DIR}`, {
  stdio: "inherit",
  cwd: ROOT,
  env: {
    ...process.env,
    EXPO_PUBLIC_API_URL: apiUrl,
    EXPO_PUBLIC_DOMAIN: primaryDomain ?? process.env.EXPO_PUBLIC_DOMAIN ?? "",
    NODE_ENV: "production",
  },
});

console.log("[build] Done.");
