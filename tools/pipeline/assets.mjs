// npm run assets: the Blender file to a validated, compressed model in the game (plan 0005, brief section 9).
// Validate, export, bake the ground shadow, optimise, check and copy. Stops at the first step that fails.

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const blend = join(root, "assets", "gen950", "blend", "gen950.blend");
const handBlend = join(root, "assets", "hand", "blend", "hand.blend");
const blender = (script, file = blend, ...args) => [join(root, "tools", "run-blender.mjs"), join(root, "tools", "blender", script), "--blend", file, ...(args.length ? ["--", ...args] : [])];
const handGlb = join(root, "assets", "hand", "export", "hand.glb");
const handOpt = join(root, "assets", "hand", "export", "hand.optimised.glb");

const steps = [
  ["Validate the model", blender("validate.py")],
  ["Export the GLB", blender("export.py")],
  ["Bake the ground shadow", blender("bake_ground.py")],
  ["Optimise", [join(root, "tools", "pipeline", "optimise.mjs")]],
  ["Check and copy into the game", [join(root, "tools", "pipeline", "check.ts")]],
  ["Validate and export the hand", blender("hand.py", handBlend, "export")],
  ["Optimise the hand", [join(root, "tools", "pipeline", "optimise.mjs"), handGlb, handOpt]],
  ["Check and copy the hand", [join(root, "tools", "pipeline", "check.ts"), "--hand"]],
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
