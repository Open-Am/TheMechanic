// Colour maths for pictures read back from offscreen targets. Three.js applies tone mapping and sRGB encoding only
// when drawing to the screen, so tray pictures do the same steps here, matching the scene (ADR 0014).

/** Khronos PBR Neutral tone mapping, the same curve as Three.js NeutralToneMapping. Input and output are linear. */
export function neutralToneMap(r: number, g: number, b: number, exposure = 1): [number, number, number] {
  r *= exposure;
  g *= exposure;
  b *= exposure;
  const startCompression = 0.8 - 0.04;
  const desaturation = 0.15;
  const x = Math.min(r, g, b);
  const offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  r -= offset;
  g -= offset;
  b -= offset;
  const peak = Math.max(r, g, b);
  if (peak < startCompression) return [r, g, b];
  const d = 1 - startCompression;
  const newPeak = 1 - (d * d) / (peak + d - startCompression);
  const k = newPeak / peak;
  r *= k;
  g *= k;
  b *= k;
  const t = 1 - 1 / (desaturation * (peak - newPeak) + 1);
  return [r + (newPeak - r) * t, g + (newPeak - g) * t, b + (newPeak - b) * t];
}

/** Linear to sRGB, for one channel in 0..1. */
export function linearToSrgb(c: number): number {
  const v = c <= 0 ? 0 : c >= 1 ? 1 : c;
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
}

/**
 * Turns premultiplied linear RGBA (as an antialiased offscreen render resolves) into straight-alpha sRGB bytes,
 * flipping rows from WebGL's bottom-up order to an image's top-down order.
 */
export function encodePicture(linear: ArrayLike<number>, width: number, height: number, exposure: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = ((height - 1 - y) * width + x) * 4;
      const o = (y * width + x) * 4;
      const a = Math.min(1, Math.max(0, linear[i + 3]!));
      if (a <= 0) continue;
      const [r, g, b] = neutralToneMap(linear[i]! / a, linear[i + 1]! / a, linear[i + 2]! / a, exposure);
      out[o] = Math.round(linearToSrgb(r) * 255);
      out[o + 1] = Math.round(linearToSrgb(g) * 255);
      out[o + 2] = Math.round(linearToSrgb(b) * 255);
      out[o + 3] = Math.round(a * 255);
    }
  }
  return out;
}
