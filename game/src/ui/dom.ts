// Tiny DOM helper. No framework (ADR 0002).

const SVG = "http://www.w3.org/2000/svg";

/** A speaker, with a slash through it when muted (plan 0013 step 7). Drawn inline: no file to download. */
export function speakerIcon(muted: boolean): SVGSVGElement {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const path = (d: string, fill: boolean) => {
    const p = document.createElementNS(SVG, "path");
    p.setAttribute("d", d);
    p.setAttribute("fill", fill ? "currentColor" : "none");
    p.setAttribute("stroke", "currentColor");
    p.setAttribute("stroke-width", "2");
    p.setAttribute("stroke-linecap", "round");
    p.setAttribute("stroke-linejoin", "round");
    svg.appendChild(p);
  };
  path("M4 9h4l5-4v14l-5-4H4z", true);
  if (muted) path("M17 9l5 6M22 9l-5 6", false);
  else path("M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12", false);
  return svg;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: { class?: string; text?: string; [key: string]: string | undefined } = {},
  ...children: Array<Node | null>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) if (c) node.appendChild(c);
  return node;
}
