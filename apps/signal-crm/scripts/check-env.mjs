/**
 * Prebuild environment check.
 * Fails the build immediately if required client-side env vars are missing,
 * instead of shipping a broken bundle to production.
 *
 * Run via: node scripts/check-env.mjs
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const REQUIRED_CLIENT_VARS = [
  "VITE_CONVEX_URL",
];

function loadDotEnvLocal() {
  try {
    const raw = readFileSync(resolve(__dirname, "..", ".env.local"), "utf-8");
    const env = {};
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      env[key] = val;
    }
    return env;
  } catch {
    return {};
  }
}

const dotEnvLocal = loadDotEnvLocal();
const missing = [];

for (const key of REQUIRED_CLIENT_VARS) {
  if (!process.env[key] && !dotEnvLocal[key]) {
    missing.push(key);
  }
}

if (missing.length > 0) {
  console.error("\n❌  Missing required environment variables:\n");
  for (const key of missing) {
    console.error(`   • ${key}`);
  }
  console.error(`
   To fix this:
     Local dev:  add the variable to .env.local (see .env.example)
     Vercel:     add in Settings → Environment Variables (all environments)
     Then run:   npx convex url   to get your Convex deployment URL

   See: https://docs.convex.dev/production/hosting/
`);
  process.exit(1);
}

console.log("✅  All required environment variables are set.");
