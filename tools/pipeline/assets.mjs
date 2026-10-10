// npm run assets: the Blender file to a validated, compressed model in the game (plan 0005, brief section 9).
// Validate, export, bake the ground shadow, optimise, check and copy. Stops at the first step that fails.

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const blend = join(root, "assets", "gen950", "blend", "gen950.blend");
const blender = (script) => [join(root, "tools", "run-blender.mjs"), join(root, "tools", "blender", script), "--blend", blend];

const steps = [
  ["Validate the model", blender("validate.py")],
  ["Export the GLB", blender("export.py")],
  ["Bake the ground shadow", blender("bake_ground.py")],
  ["Optimise", [join(root, "tools", "pipeline", "optimise.mjs")]],
  ["Check and copy into the game", [join(root, "tools", "pipeline", "check.ts")]],
];

for (const [label, args] of steps) {
  console.log(`\n== ${label} ==`);
  const run = spawnSync(process.execPath, args, { stdio: "inherit", cwd: root });
  if (run.status !== 0) {
    console.error(`\n${label} failed. Nothing further was run.`);
    process.exit(run.status ?? 1);
  }
}
console.log("\nAssets are up to date.");
