// Loading progress for the render assets (plan 0014 step 6): files settled out of files requested, not bytes.

/** Reports loading progress: files settled (arrived or failed) out of files requested (plan 0014 step 6). */
export type LoadProgress = (done: number, total: number) => void;

/** Wraps file loads so each one counts towards `onProgress` as it settles. A failed file counts too: it has a fallback. */
export function progressCounter(total: number, onProgress?: LoadProgress): <T>(p: Promise<T>) => Promise<T> {
  let done = 0;
  onProgress?.(0, total);
  return <T>(p: Promise<T>) =>
    p.finally(() => {
      done++;
      onProgress?.(done, total);
    });
}
