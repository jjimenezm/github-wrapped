/** FNV-1a: a tiny, stable 32-bit string hash. */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * The seed of a person's art: their numeric GitHub id (it survives a rename, like ownership does)
 * and the wrap year, so each year looks different too.
 */
export function seedFor(githubUserId: number, year: number): number {
  return hashString(`${githubUserId}:${year}`);
}

/** An independent stream per piece of art, so tuning one never reshuffles the others. */
export function deriveSeed(seed: number, salt: string): number {
  return hashString(`${seed}:${salt}`);
}

/** mulberry32: small, well distributed and identical in Node and every browser. */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
