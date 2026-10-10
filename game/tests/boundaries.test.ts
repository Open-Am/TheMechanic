// Enforces the import table in ADR 0010. Fails the build when a layer reaches where it must not.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

/** Which layers each layer may import. "platform/interfaces" is listed separately from "platform". */
const ALLOWED: Record<string, string[]> = {
  core: [],
  app: ["core", "platform/interfaces"],
  render: ["app", "core"],
  ui: ["app", "core"],
  platform: ["core"],
  diagnostic: ["app", "core"],
};

const FORBIDDEN_IN_CORE = [/\bfrom\s+["']three/, /\bdocument\b/, /\bwindow\b/, /\bnavigator\b/, /\blocalStorage\b/, /\bHTMLElement\b/, /\brequestAnimationFrame\b/];

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (/\.ts$/.test(name)) out.push(p);
  }
  return out;
}

function layerOf(file: string): string | null {
  const rel = relative(src, file).split(sep);
  if (rel.length < 2) return null; // main.ts
  if (rel[0] === "platform" && rel[1] === "interfaces.ts") return "platform/interfaces";
  return rel[0]!;
}

function importsOf(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const out: string[] = [];
  const re = /(?:import|export)\s[^'"]*?from\s+["']([^"']+)["']|import\s+["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m[1] ?? m[2]!);
  return out;
}

function targetLayer(fromFile: string, spec: string): string | null {
  if (!spec.startsWith(".")) return spec.split("/")[0]!; // a package
  const abs = join(dirname(fromFile), spec);
  const rel = relative(src, abs).split(sep);
  if (rel[0] === "..") return "outside-src";
  if (rel[0] === "platform" && rel[1] === "interfaces.ts") return "platform/interfaces";
  return rel[0]!;
}

const files = walk(src);

describe("layer boundaries (ADR 0010)", () => {
  it("finds source files", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    const layer = layerOf(file);
    if (!layer) continue;
    const base = layer === "platform/interfaces" ? "platform" : layer;
    const allowed = ALLOWED[base];
    if (!allowed) continue;

    it(`${relative(src, file)} imports only ${[base, ...allowed].join(", ")}`, () => {
      for (const spec of importsOf(file)) {
        const target = targetLayer(file, spec);
        if (target === null) continue;
        if (spec.startsWith("node:")) {
          expect.fail(`${relative(src, file)} imports Node built-in "${spec}"; browser code cannot`);
        }
        const same = target === base || (base === "platform" && target === "platform/interfaces");
        const ok = same || allowed.includes(target) || (target === "platform/interfaces" && allowed.includes("platform"));
        expect(ok, `${relative(src, file)} imports "${spec}" (${target})`).toBe(true);
      }
    });
  }

  it("core has no Three.js and no DOM", () => {
    for (const file of files.filter((f) => layerOf(f) === "core")) {
      const text = readFileSync(file, "utf8");
      for (const re of FORBIDDEN_IN_CORE) {
        expect(re.test(text), `${relative(src, file)} matches ${re}`).toBe(false);
      }
    }
  });
});
