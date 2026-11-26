import assert from "node:assert/strict";
import { test } from "node:test";
import { type SpellingBank, resolveReviewWords } from "../src/apps/spelling/banks";
import { composeRound } from "../src/apps/spelling/round";
import type { SpellingWord } from "../src/apps/spelling/spellingWords";
import {
  DEFAULT_SPELLING_REVIEW_WEEKS,
  SPELLING_REVIEW_COUNT_STORAGE_KEY,
  SPELLING_REVIEW_WEEKS_STORAGE_KEY,
  getStoredSpellingReviewCount,
  getStoredSpellingReviewWeeks,
} from "../src/utils/spellingPreferences";
import { installStorage } from "./memoryStorage";

const words = (...list: string[]): SpellingWord[] => list.map((word) => ({ word, sentence: `I can spell ${word}.` }));
const keys = (list: readonly SpellingWord[]) => list.map((entry) => entry.word);
const bank = (id: string, list: SpellingWord[]): SpellingBank => ({ id, label: id, grade: 0, words: list });

/** A repeatable stand-in for Math.random, so a failing shuffle fails the same way twice. */
function seeded(seed: number): () => number {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
}

const weeks = [
  bank("this", words("pear", "chain")),
  bank("last", words("frog", "Pear", "kite")),
  bank("two-ago", words("drum", "kite", "lamp")),
  bank("three-ago", words("yak")),
];

test("review is empty until there is a past week", () => {
  assert.deepEqual(resolveReviewWords(4, weeks[0].words, [weeks[0]]), []);
});

test("review reaches back only the number of weeks asked for", () => {
  assert.deepEqual(keys(resolveReviewWords(1, weeks[0].words, weeks)), ["frog", "kite"]);
  assert.deepEqual(keys(resolveReviewWords(2, weeks[0].words, weeks)), ["frog", "kite", "drum", "lamp"]);
});

test("review skips words already in the main pool, ignoring case, and repeats across weeks", () => {
  const review = keys(resolveReviewWords(4, weeks[0].words, weeks));
  assert.ok(!review.includes("Pear"));
  assert.equal(review.filter((word) => word === "kite").length, 1);
});

const pool = words("a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8");
const reviewPool = words("r1", "r2", "r3", "r4");

test("a round takes its length from the pool, then puts review words after it", () => {
  const round = composeRound(pool, reviewPool, 5, 3, seeded(1));
  assert.deepEqual(
    round.map((entry) => entry.review),
    [false, false, false, false, false, true, true, true]
  );
  assert.ok(round.slice(0, 5).every((entry) => entry.word.startsWith("a")));
  assert.ok(round.slice(5).every((entry) => entry.word.startsWith("r")));
});

test("a round never asks a word twice, and is capped by what the pools hold", () => {
  const round = keys(composeRound(pool, reviewPool, 50, 15, seeded(2)));
  assert.equal(new Set(round).size, round.length);
  assert.equal(round.length, pool.length + reviewPool.length);
});

test("a round has no review words when review is off, and always has at least one word", () => {
  assert.ok(composeRound(pool, reviewPool, 5, 0, seeded(3)).every((entry) => !entry.review));
  assert.equal(composeRound(pool, [], 0, 0, seeded(4)).length, 1);
});

test("building a round does not reorder the caller's list", () => {
  const before = keys(pool);
  composeRound(pool, reviewPool, 5, 2, seeded(5));
  assert.deepEqual(keys(pool), before);
});

test("review settings default to off and two weeks, and ignore values not on offer", () => {
  installStorage();
  assert.equal(getStoredSpellingReviewCount(), 0);
  assert.equal(getStoredSpellingReviewWeeks(), DEFAULT_SPELLING_REVIEW_WEEKS);

  installStorage({ [SPELLING_REVIEW_COUNT_STORAGE_KEY]: "10", [SPELLING_REVIEW_WEEKS_STORAGE_KEY]: "4" });
  assert.equal(getStoredSpellingReviewCount(), 10);
  assert.equal(getStoredSpellingReviewWeeks(), 4);

  installStorage({ [SPELLING_REVIEW_COUNT_STORAGE_KEY]: "7", [SPELLING_REVIEW_WEEKS_STORAGE_KEY]: "abc" });
  assert.equal(getStoredSpellingReviewCount(), 0);
  assert.equal(getStoredSpellingReviewWeeks(), DEFAULT_SPELLING_REVIEW_WEEKS);
});
