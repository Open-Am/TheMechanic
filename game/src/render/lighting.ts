// The lighting rig (ADR 0014). One place for the environment, the key light, tone mapping and exposure, and the fallback.
// The environment is the real HDR map from game/public/env when it loaded, otherwise Three.js RoomEnvironment, generated in code.

import { DirectionalLight, HemisphereLight, NeutralToneMapping, PMREMGenerator, type Scene, type Texture, type WebGLRenderer } from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

export type Rig = "ibl" | "fallback";

/** Every lighting number in one file (ADR 0014). Tuned by eye against the placeholder scene; retuned in Phase 3 look-development. */
export const LIGHTING = {
  /** PBR Neutral tone mapping exposure. */
  exposure: 0.9,
  /** How strongly materials pick up the environment: the generated studio is bright, the street HDR darker. */
  environmentIntensity: 0.55,
  hdrIntensity: 1.25,
  /** Blur of the generated studio before prefiltering. */
  roomSigma: 0.04,
  /** The key light: one directional light, from the front right and above. */
  key: { color: 0xfff6ea, intensity: 1.4, direction: [0.6, 1.4, 1.0] as const },
  /** The ADR 0006 rig, kept as the fallback. */
  fallback: { sky: 0xfff4e0, ground: 0x2a2622, hemisphere: 1.6, key: 2.4 },
} as const;

export interface Capabilities {
  /** The GPU can render to half-float targets, which PMREMGenerator needs. */
  halfFloatTargets: boolean;
  /** A development-only override, from ?lighting=fallback or ?lighting=ibl. */
  forced?: string | null;
}

/** Picks the rig. Pure, so it is tested without a GPU. */
export function chooseRig(caps: Capabilities): Rig {
  if (caps.forced === "fallback") return "fallback";
  if (caps.forced === "ibl") return "ibl";
  return caps.halfFloatTargets ? "ibl" : "fallback";
}

export interface Lighting {
  readonly rig: Rig;
  /** Adds this rig's lights (and environment) to a scene. Call once per scene; each call makes new light objects. */
  addTo(scene: Scene): void;
  dispose(): void;
}

function halfFloatTargets(renderer: WebGLRenderer): boolean {
  return renderer.extensions.has("EXT_color_buffer_half_float") || renderer.extensions.has("EXT_color_buffer_float");
}

function keyLight(intensity: number, color: number): DirectionalLight {
  const light = new DirectionalLight(color, intensity);
  light.position.set(...LIGHTING.key.direction);
  return light;
}

/** `equirect` is the loaded HDR environment, or null to generate a studio instead. */
export function createLighting(renderer: WebGLRenderer, forced: string | null = null, equirect: Texture | null = null): Lighting {
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = LIGHTING.exposure;

  let rig = chooseRig({ halfFloatTargets: halfFloatTargets(renderer), forced });
  let environment: Texture | null = null;
  const fromHdr = equirect !== null;
  if (rig === "ibl") {
    try {
      const pmrem = new PMREMGenerator(renderer);
      if (equirect) {
        environment = pmrem.fromEquirectangular(equirect).texture;
      } else {
        const room = new RoomEnvironment();
        environment = pmrem.fromScene(room, LIGHTING.roomSigma).texture;
        room.dispose();
      }
      pmrem.dispose();
    } catch (e) {
      console.warn("Environment lighting failed; using the simple rig.", e);
      rig = "fallback";
    }
  }

  return {
    rig,
    addTo(scene) {
      if (rig === "ibl" && environment) {
        scene.environment = environment;
        scene.environmentIntensity = fromHdr ? LIGHTING.hdrIntensity : LIGHTING.environmentIntensity;
        scene.add(keyLight(LIGHTING.key.intensity, LIGHTING.key.color));
      } else {
        const f = LIGHTING.fallback;
        scene.add(new HemisphereLight(f.sky, f.ground, f.hemisphere));
        scene.add(keyLight(f.key, 0xffffff));
      }
    },
    dispose() {
      environment?.dispose();
    },
  };
}
