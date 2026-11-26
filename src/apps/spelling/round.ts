import type { SpellingWord } from "./spellingWords";

export type RoundWord = SpellingWord & {
  /** From an earlier week, added after the main round. */
  review: boolean;
};

export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * One sitting: a shuffled slice of the pool, then a shuffled slice of the
 * review words after it.
 *
 * Shuffle first, then take a round's worth. Several packs together are a pool
 * to draw from, not one sitting: ticking three of them should not mean ninety
 * words before she is allowed to stop. Review comes after the main round,
 * never mixed into it, so this week's words always get her freshest attention.
 */
export function composeRound(
  pool: readonly SpellingWord[],
  reviewPool: readonly SpellingWord[],
  roundLength: number,
  reviewCount: number,
  random: () => number = Math.random
): RoundWord[] {
  const main = shuffle(pool, random)
    .slice(0, Math.max(1, roundLength))
    .map((entry) => ({ ...entry, review: false }));
  const review = shuffle(reviewPool, random)
    .slice(0, Math.max(0, reviewCount))
    .map((entry) => ({ ...entry, review: true }));
  return [...main, ...review];
}
