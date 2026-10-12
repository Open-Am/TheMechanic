// The exhaust (ADR 0027, plan 0018 step 3): a puff when the engine catches, a faint haze while it runs, a small dark
// puff at each cough. A few soft camera-facing sprites from the muffler's outlet with one 128 px texture drawn here (our
// own), no lights, no shadows, at most EXHAUST.sprites at once (ADR 0014's frame budget).

import { CanvasTexture, Sprite, SpriteMaterial, Vector3, type Object3D } from "three";

export const EXHAUST = {
  /** The most sprites alive at once. */
  sprites: 10,
  /** Seconds a puff lives. */
  life: 1.4,
  /** Metres per second out of the outlet, then upwards. */
  outSpeed: 0.18,
  riseSpeed: 0.12,
  /** Sizes in metres at birth and at the end of life. */
  startSize: 0.05,
  endSize: 0.22,
  /** Opacity at the strongest. */
  puffOpacity: 0.55,
  hazeOpacity: 0.22,
  /** Haze sprites per second at full haze. */
  hazeRate: 4,
  /** Light grey exhaust and dark cough smoke, linear-ish sRGB. */
  light: "#d9d6d0",
  dark: "#3a3633",
  texturePx: 128,
} as const;

export type PuffKind = "puff" | "haze" | "cough";

/** Where a sprite is and how it looks at `age` seconds: pure, so it is tested without WebGL. */
export function puffPose(kind: PuffKind, age: number): { out: number; up: number; size: number; opacity: number } {
  const life = EXHAUST.life * (kind === "haze" ? 1.2 : 1);
  const u = Math.max(0, Math.min(1, age / life));
  const peak = kind === "haze" ? EXHAUST.hazeOpacity : EXHAUST.puffOpacity;
  // Quick to appear, slow to thin out.
  const opacity = age >= life ? 0 : peak * Math.min(1, u / 0.1) * (1 - u) ** 1.5;
  const strength = kind === "haze" ? 0.6 : 1;
  return {
    out: EXHAUST.outSpeed * strength * (1 - (1 - u) ** 2) * life * 0.5,
    up: EXHAUST.riseSpeed * age,
    size: (EXHAUST.startSize + (EXHAUST.endSize - EXHAUST.startSize) * Math.sqrt(u)) * (kind === "haze" ? 0.8 : 1),
    opacity,
  };
}

/** How many haze sprites are due after `elapsed` seconds at `level` (0 to 1), given `spawned` so far. */
export function hazeDue(level: number, dt: number, carry: number): { spawn: number; carry: number } {
  const total = carry + Math.max(0, level) * EXHAUST.hazeRate * Math.max(0, dt);
  const spawn = Math.floor(total + 1e-9);
  return { spawn, carry: Math.max(0, total - spawn) };
}

export interface Exhaust {
  /** A puff from the outlet now: the catch, a cough. */
  puff(kind: "puff" | "cough"): void;
  /** Call once a frame with the haze level (0 to 1). */
  update(dt: number, haze: number): void;
  /** Removes every sprite at once. */
  clear(): void;
  /** For the browser check: sprites alive. */
  alive(): number;
}

function softTexture(): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = c.height = EXHAUST.texturePx;
  const g = c.getContext("2d");
  if (!g) return null;
  const r = EXHAUST.texturePx / 2;
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, "rgba(255,255,255,0.9)");
  grad.addColorStop(0.45, "rgba(255,255,255,0.45)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  return new CanvasTexture(c);
}

/**
 * Sprites under `parent` (the scene), born at `outlet` (an object in the machine, so they follow its turn) and blowing
 * along `direction` (unit, in the outlet's parent's axes: the muffler's spout points along the machine's -X).
 */
export function createExhaust(parent: Object3D, outlet: () => Object3D | null, direction: Vector3): Exhaust {
  const map = softTexture();
  interface Live {
    sprite: Sprite;
    kind: PuffKind;
    age: number;
    from: Vector3;
    dir: Vector3;
  }
  const live: Live[] = [];
  const free: Sprite[] = [];
  let carry = 0;

  function spawn(kind: PuffKind): void {
    const o = outlet();
    if (!o) return;
    if (live.length >= EXHAUST.sprites) {
      const oldest = live.shift()!;
      oldest.sprite.visible = false;
      free.push(oldest.sprite);
    }
    const sprite = free.pop() ?? new Sprite(new SpriteMaterial({ map, transparent: true, depthWrite: false, opacity: 0 }));
    (sprite.material as SpriteMaterial).color.set(kind === "cough" ? EXHAUST.dark : EXHAUST.light);
    sprite.renderOrder = 10;
    sprite.visible = true;
    if (!sprite.parent) parent.add(sprite);
    o.updateMatrixWorld(true);
    const from = o.getWorldPosition(new Vector3());
    const dir = direction.clone().transformDirection(o.parent ? o.parent.matrixWorld : o.matrixWorld).normalize();
    live.push({ sprite, kind, age: 0, from, dir });
    place(live[live.length - 1]!);
  }

  function place(l: Live): void {
    const p = puffPose(l.kind, l.age);
    l.sprite.position.copy(l.from).addScaledVector(l.dir, p.out);
    l.sprite.position.y += p.up;
    l.sprite.scale.setScalar(Math.max(1e-4, p.size));
    (l.sprite.material as SpriteMaterial).opacity = p.opacity;
  }

  return {
    puff(kind) {
      spawn(kind);
      if (kind === "puff") spawn("puff");
    },
    update(dt, haze) {
      const due = hazeDue(haze, dt, carry);
      carry = due.carry;
      for (let i = 0; i < due.spawn; i++) spawn("haze");
      for (let i = live.length - 1; i >= 0; i--) {
        const l = live[i]!;
        l.age += dt;
        if (puffPose(l.kind, l.age).opacity <= 0 && l.age > 0.2) {
          l.sprite.visible = false;
          free.push(l.sprite);
          live.splice(i, 1);
        } else place(l);
      }
    },
    clear() {
      for (const l of live.splice(0)) {
        l.sprite.visible = false;
        free.push(l.sprite);
      }
      carry = 0;
    },
    alive: () => live.length,
  };
}
