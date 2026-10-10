// Audio hooks (brief section 8). No audio ships yet, so every sound is usually missing and play() does nothing.
// Sounds are passed in already loaded, so playing one never makes a network request (ADR 0010).

import type { Audio, SoundName } from "../interfaces/index.ts";

/** The part of HTMLAudioElement this needs. */
export interface Playable {
  currentTime: number;
  play(): Promise<void> | void;
}

export function createAudio(sounds: Partial<Record<SoundName, Playable>> = {}): Audio {
  return {
    play(name) {
      const sound = sounds[name];
      if (!sound) return;
      try {
        sound.currentTime = 0;
        const p = sound.play();
        // Browsers refuse audio before the first tap; that is not an error worth showing.
        if (p && typeof p.catch === "function") p.catch(() => {});
      } catch {
        // Same: a sound that cannot play is skipped.
      }
    },
  };
}
