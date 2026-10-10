// Tiny DOM helper. No framework (ADR 0002).

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
