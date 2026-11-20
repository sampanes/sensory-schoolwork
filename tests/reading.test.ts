import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import {
  ADVANCED_READING_DECK,
  READING_FAMILIES,
  READING_WORD_LENGTHS,
  getReadingDeck,
  getReadingFamilies,
} from "../src/apps/reading/readingWords";

const publicDir = path.join(process.cwd(), "public");

/** Tests build with BASE_URL "/", so an image URL is a path under public/. */
function publicFile(url: string) {
  return path.join(publicDir, ...url.replace(/^\//, "").split("/"));
}

test("every reading picture the decks point at exists in public/", () => {
  for (const deck of [...READING_FAMILIES, ADVANCED_READING_DECK]) {
    for (const entry of deck.words) {
      if (entry.image) {
        assert.ok(existsSync(publicFile(entry.image)), `${deck.id}/${entry.word}: missing ${entry.image}`);
      }
    }
  }
});

test("deck ids are unique and every family has at least two words", () => {
  const ids = [...READING_FAMILIES, ADVANCED_READING_DECK].map((deck) => deck.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const family of READING_FAMILIES) {
    assert.ok(family.words.length >= 2, `${family.id} has ${family.words.length} word(s)`);
    for (const entry of family.words) {
      assert.equal(entry.word.length, family.wordLength, `${family.id}: "${entry.word}" is not ${family.wordLength} letters`);
    }
  }
});

test("each word length has families, and decks are found by id", () => {
  for (const length of READING_WORD_LENGTHS) {
    assert.ok(getReadingFamilies(length).length > 0, `no ${length}-letter families`);
  }
  assert.equal(getReadingDeck("very-advanced"), ADVANCED_READING_DECK);
  assert.equal(getReadingDeck(READING_FAMILIES[0].id), READING_FAMILIES[0]);
  assert.equal(getReadingDeck("nope"), undefined);
  assert.equal(getReadingDeck(undefined), undefined);
});

test("the very advanced manifest lists exactly the pictures the deck uses", () => {
  const manifest = JSON.parse(readFileSync(path.join(publicDir, "reading", "advanced", "manifest.json"), "utf8")) as {
    count: number;
    images: Array<{ filename: string }>;
  };
  const listed = manifest.images.map((image) => image.filename).sort();
  const used = ADVANCED_READING_DECK.words
    .map((entry) => entry.image)
    .filter((image): image is string => Boolean(image))
    .map((image) => image.split("/").pop() as string)
    .sort();
  assert.equal(manifest.count, manifest.images.length, "manifest count is stale");
  assert.deepEqual(listed, used);
});
