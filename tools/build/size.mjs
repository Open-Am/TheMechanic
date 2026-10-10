// Checks the built JavaScript against the ADR 0006 budget: 350 KB gzipped, counted as 350,000 bytes.
// Run `npm run build` first, then `npm run size`. Exits 1 if over budget or if there is no build.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const BUDGET_BYTES = 350_000;
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const dist = join(root, "game", "dist");

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

let files;
try {
  files = walk(dist).filter((f) => f.endsWith(".js"));
} catch {
  console.error("No build found at game/dist. Run `npm run build` first.");
  process.exit(1);
}
if (files.length === 0) {
  console.error("No JavaScript in game/dist. Run `npm run build` first.");
  process.exit(1);
}

let total = 0;
for (const f of files) {
  const gz = gzipSync(readFileSync(f), { level: 9 }).length;
  total += gz;
  console.log(`${(gz / 1000).toFixed(1).padStart(7)} KB  ${relative(root, f)}`);
}
const ok = total <= BUDGET_BYTES;
console.log(`${(total / 1000).toFixed(1).padStart(7)} KB  total gzipped, budget ${BUDGET_BYTES / 1000} KB: ${ok ? "within" : "OVER"}`);
process.exit(ok ? 0 : 1);
