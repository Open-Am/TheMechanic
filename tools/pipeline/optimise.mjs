// Optimises the exported GLB with glTF Transform (plan 0005 step 7, brief section 9).
//
//   node tools/pipeline/optimise.mjs [in.glb] [out.glb] [--keep-empty]
//
// Defaults: assets/gen950/export/model.glb -> assets/gen950/export/model.optimised.glb.
// Meshopt geometry compression (the decoder ships in three), WebP textures at most 2048 px.
// Flattening, joining, instancing, palettes and simplification are all turned off: they would merge or rename the
// one-node-per-part structure the game relies on (brief section 8), and triangle counts are the modeller's job.
// Flags checked against `gltf-transform help optimize` for 4.5.0.
// --keep-empty turns pruning off: it would drop empty nodes, and the toolbox's tool slots are empty nodes (plan 0012).
// A fresh Blender export of selected objects carries nothing unused, so there is nothing for pruning to remove.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const keepEmpty = process.argv.includes("--keep-empty");
const input = resolve(files[0] ?? join(root, "assets", "gen950", "export", "model.glb"));
const output = resolve(files[1] ?? join(root, "assets", "gen950", "export", "model.optimised.glb"));
if (!existsSync(input)) {
  console.error(`No model at ${input}. Run the Blender export first.`);
  process.exit(1);
}

const cli = join(root, "game", "node_modules", "@gltf-transform", "cli", "bin", "cli.js");
const args = [
  cli,
  "optimize",
  input,
  output,
  "--compress", "meshopt",
  "--texture-compress", "webp",
  "--texture-size", "2048",
  "--flatten", "false",
  "--join", "false",
  "--instance", "false",
  "--palette", "false",
  "--simplify", "false",
  "--weld", "true",
  "--prune", keepEmpty ? "false" : "true",
];
const run = spawnSync(process.execPath, args, { stdio: "inherit" });
if (run.status !== 0) process.exit(run.status ?? 1);
console.log(`Optimised ${input} -> ${output}`);
