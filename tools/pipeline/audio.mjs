// npm run audio: the chosen sound originals to checked Ogg Opus files in the game (plan 0013 steps 3 and 4, ADR 0018).
// Encode with Blender (tools/blender/audio.py), then keep only the Opus stream, copy into game/public/audio with
// LICENCE.md, and check every moment's file, the budget and the licences (tools/pipeline/check.ts --audio).
// Stops at the first step that fails.
//
//   npm run audio [-- --sounds <sounds.json> --source <dir> --out <dir> --to <dir>]
//
// The options point it away from assets/audio and the game, to prove the pipeline on a test sound.

import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? resolve(argv[i + 1]) : fallback;
};
const sounds = opt("--sounds", join(root, "assets", "audio", "sounds.json"));
const source = opt("--source", join(root, "assets", "audio", "source"));
const out = opt("--out", join(root, "assets", "audio", "export"));
const to = opt("--to", join(root, "game", "public", "audio"));

const steps = [
  ["Encode with Blender", [join(root, "tools", "run-blender.mjs"), join(root, "tools", "blender", "audio.py"), "--", "--sounds", sounds, "--source", source, "--out", out]],
  ["Check and copy into the game", [join(root, "tools", "pipeline", "check.ts"), "--audio", "--from", out, "--to", to, "--sounds", sounds]],
];

for (const [label, args] of steps) {
  console.log(`\n== ${label} ==`);
  const run = spawnSync(process.execPath, args, { stdio: "inherit", cwd: root });
  if (run.status !== 0) {
    console.error(`\n${label} failed. Nothing further was run.`);
    process.exit(run.status ?? 1);
  }
}
console.log("\nSounds are up to date.");
