// Matching model nodes to machine IDs (brief section 8). Pure, so it is tested without loading a GLB.

export interface NodeMatch {
  /** IDs with exactly one node. */
  found: string[];
  /** IDs with no node: these fall back to their placeholders. */
  missing: string[];
  /** Node names that are not IDs: ignored, as the brief says ("anything else is ignored"). */
  extra: string[];
}

export function matchNodes(nodeNames: readonly string[], ids: readonly string[]): NodeMatch {
  const names = new Set(nodeNames);
  return {
    found: ids.filter((id) => names.has(id)),
    missing: ids.filter((id) => !names.has(id)),
    extra: [...names].filter((n) => !ids.includes(n)),
  };
}
