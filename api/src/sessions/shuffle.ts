// Deterministic per-item option ordering.
//
// Content authors put the correct answer first far more often than chance —
// the seed bank did it in every single question — and any bank assembled by
// hand will carry some version of that tell. Rendering options in their stored
// order turns "pick the first one" into a working strategy, which makes both
// practice and the readiness score meaningless.
//
// Shuffling per (item, option) rather than randomly at render time keeps the
// order STABLE: the same question in the same session looks the same when the
// learner scrolls back or reviews it afterwards, while carrying no positional
// information across questions.

/// FNV-1a. Small, fast, and dependency-free; the quality bar here is "no
/// visible pattern", not cryptographic.
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function shuffleOptions<T extends { id: string }>(itemId: string, options: T[]): T[] {
  return [...options]
    .map((o) => ({ o, k: hash(`${itemId}:${o.id}`) }))
    // Tie-break on id so the result is fully determined even in the
    // astronomically unlikely case of a hash collision.
    .sort((a, b) => a.k - b.k || a.o.id.localeCompare(b.o.id))
    .map((x) => x.o);
}
