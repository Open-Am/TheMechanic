// Share (ADR 0005): the phone's share sheet where it exists, otherwise the clipboard. Takes a navigator-like object so
// it is tested without a browser.

import type { Share } from "../interfaces/index.ts";

/** The parts of Navigator this needs. */
export interface NavigatorLike {
  share?: (data: { text: string }) => Promise<void>;
  clipboard?: { writeText(text: string): Promise<void> };
}

function isCancel(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { name?: unknown }).name === "AbortError";
}

export function createShare(nav: NavigatorLike | null | undefined): Share {
  return {
    async share(text) {
      if (nav && typeof nav.share === "function") {
        try {
          await nav.share({ text });
          return "sheet";
        } catch (e) {
          // The player closed the sheet: that is their choice, so nothing else happens (plan 0014 reading 9).
          if (isCancel(e)) return "none";
        }
      }
      try {
        if (nav?.clipboard && typeof nav.clipboard.writeText === "function") {
          await nav.clipboard.writeText(text);
          return "clipboard";
        }
      } catch {
        // Clipboard refused (no permission, not a secure page): the caller shows the text to copy by hand.
      }
      return "none";
    },
  };
}

/**
 * True if the navigator has a share sheet. Then a "none" from share() almost always means the player cancelled it; the
 * rare case of a broken sheet and a refused clipboard reads the same, and the player can tap Share again.
 */
export function hasShareSheet(nav: NavigatorLike | null | undefined): boolean {
  return !!nav && typeof nav.share === "function";
}
