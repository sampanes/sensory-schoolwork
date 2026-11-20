import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type SpellingBank,
  BUILTIN_BANKS,
  CURRENT_WEEK_BANK,
  THIS_WEEK_ID,
  WEEKLY_BANKS,
  describeSelection,
  getBanksForGrade,
  getDefaultPackIds,
  resolveSelectedBanks,
  resolveSelectedWords,
} from "../src/apps/spelling/banks";
import { generateTemplateSentence } from "../src/apps/spelling/sentenceGen/templates";
import { GRADES, getStoredGrade } from "../src/utils/gradePreferences";
import {
  SPELLING_CUSTOM_LIST_ENABLED_STORAGE_KEY,
  SPELLING_CUSTOM_LIST_TEXT_STORAGE_KEY,
  SPELLING_PACK_IDS_STORAGE_KEY,
  getStoredSpellingPackIds,
  getStoredSpellingRoundLength,
  getStoredSpellingSource,
  parseSpellingCustomList,
  serializeSpellingCustomList,
} from "../src/utils/spellingPreferences";
import { CURRENT_WEEK, WEEKS } from "../src/weekly";
import { installStorage } from "./memoryStorage";

test("bank ids are unique across weekly and built-in banks", () => {
  const ids = [...WEEKLY_BANKS, ...BUILTIN_BANKS].map((bank) => bank.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(!ids.includes(THIS_WEEK_ID), `"${THIS_WEEK_ID}" must stay free for the follow-the-calendar choice`);
});

test("no bank has an empty word, and only deliberate homographs repeat", () => {
  // Pack 4 lists "read" twice on purpose: present tense, then past tense.
  const homographs = new Set(["pack-4:read"]);
  for (const bank of [...WEEKLY_BANKS, ...BUILTIN_BANKS]) {
    const keys = bank.words.map((entry) => entry.word.trim().toLowerCase());
    assert.ok(keys.every(Boolean), `${bank.id}: empty word`);
    const repeated = keys.filter((key, index) => keys.indexOf(key) !== index && !homographs.has(`${bank.id}:${key}`));
    assert.deepEqual(repeated, [], `${bank.id}: repeated words`);
  }
});

test("the newest week is this week, and the default at every grade", () => {
  assert.equal(CURRENT_WEEK, WEEKS[0]);
  for (let index = 1; index < WEEKS.length; index += 1) {
    assert.ok(WEEKS[index - 1].weekOf > WEEKS[index].weekOf, "WEEKS must be newest first");
  }
  if (!CURRENT_WEEK_BANK) {
    return;
  }
  for (const grade of GRADES) {
    assert.deepEqual(getDefaultPackIds(grade), [THIS_WEEK_ID]);
    assert.deepEqual(
      resolveSelectedBanks([], grade).map((bank) => bank.id),
      [CURRENT_WEEK_BANK.id],
      `grade ${grade}: an empty selection should give this week`
    );
    assert.deepEqual(resolveSelectedBanks([THIS_WEEK_ID], grade).map((bank) => bank.id), [CURRENT_WEEK_BANK.id]);
  }
});

test("a selection never smuggles a higher-grade bank into a lower grade", () => {
  for (const grade of GRADES) {
    const visible = new Set(getBanksForGrade(grade).map((bank) => bank.id));
    const everything = [...WEEKLY_BANKS, ...BUILTIN_BANKS].map((bank) => bank.id);
    for (const bank of resolveSelectedBanks(everything, grade)) {
      assert.ok(visible.has(bank.id), `grade ${grade} got ${bank.id}`);
      assert.ok(bank.grade <= grade, `grade ${grade} got grade-${bank.grade} bank ${bank.id}`);
    }
  }
});

test("unknown or out-of-grade ids fall back to the grade default instead of an empty round", () => {
  const higher = BUILTIN_BANKS.find((bank) => bank.grade === 2);
  for (const grade of GRADES) {
    const fallback = resolveSelectedBanks(getDefaultPackIds(grade), grade).map((bank) => bank.id);
    assert.ok(fallback.length > 0, `grade ${grade} has no default words`);
    assert.deepEqual(resolveSelectedBanks(["no-such-pack"], grade).map((bank) => bank.id), fallback);
    if (higher && grade < 2) {
      assert.deepEqual(resolveSelectedBanks([higher.id], grade).map((bank) => bank.id), fallback);
    }
    assert.ok(resolveSelectedWords(["no-such-pack"], grade).length > 0);
  }
});

test("a week with no words yet never leaves a round with nothing to spell", () => {
  if (!CURRENT_WEEK_BANK) {
    return;
  }
  const bank = CURRENT_WEEK_BANK as { words: SpellingBank["words"] };
  const saved = bank.words;
  bank.words = [];
  try {
    for (const grade of GRADES) {
      for (const ids of [[], [THIS_WEEK_ID], [CURRENT_WEEK_BANK.id]]) {
        assert.ok(resolveSelectedWords(ids, grade).length > 0, `grade ${grade}, ${JSON.stringify(ids)}: no words`);
        assert.ok(!resolveSelectedBanks(ids, grade).includes(CURRENT_WEEK_BANK), "the empty week was picked");
      }
    }
  } finally {
    bank.words = saved;
  }
});

test("selected words are de-duplicated across banks, ignoring case", () => {
  const everything = [...WEEKLY_BANKS, ...BUILTIN_BANKS].map((bank) => bank.id);
  const words = resolveSelectedWords(everything, 2).map((entry) => entry.word.trim().toLowerCase());
  assert.equal(new Set(words).size, words.length);
});

test("the selection label names one or two banks and counts more", () => {
  const banks = getBanksForGrade(2);
  assert.equal(describeSelection([banks[0].id], 2), banks[0].label);
  assert.equal(describeSelection([banks[0].id, banks[1].id], 2), `${banks[0].label} + ${banks[1].label}`);
  assert.equal(describeSelection(banks.slice(0, 3).map((bank) => bank.id), 2), "3 packs");
});

test("a typed list reads word-per-line, comma or space separated, and word; sentence", () => {
  assert.deepEqual(parseSpellingCustomList("cat\r\ndog\n\n  hat  "), [
    { word: "cat", sentence: "" },
    { word: "dog", sentence: "" },
    { word: "hat", sentence: "" },
  ]);
  assert.deepEqual(parseSpellingCustomList("cat, dog hat"), [
    { word: "cat", sentence: "" },
    { word: "dog", sentence: "" },
    { word: "hat", sentence: "" },
  ]);
  assert.deepEqual(parseSpellingCustomList("ice   cream; We ate ice cream; then we ran."), [
    { word: "ice cream", sentence: "We ate ice cream; then we ran." },
  ]);
});

test("a typed list survives a save and reload unchanged", () => {
  const entries = [
    { word: "jump", sentence: "Frogs can jump over the log." },
    { word: "ice cream", sentence: "" },
    { word: "don't", sentence: "Please don't run inside." },
  ];
  assert.deepEqual(parseSpellingCustomList(serializeSpellingCustomList(entries)), entries);
});

test("saved pack ids: the pre-weekly key is deleted, and junk reads as nothing chosen", () => {
  const storage = installStorage({ "spelling.packIds": JSON.stringify(["pack-6"]) });
  assert.deepEqual(getStoredSpellingPackIds(), []);
  assert.ok(!storage.has("spelling.packIds"), "legacy key should be removed");

  installStorage({ [SPELLING_PACK_IDS_STORAGE_KEY]: JSON.stringify(["this-week", 7, "pack-1"]) });
  assert.deepEqual(getStoredSpellingPackIds(), ["this-week", "pack-1"]);

  installStorage({ [SPELLING_PACK_IDS_STORAGE_KEY]: "{not json" });
  assert.deepEqual(getStoredSpellingPackIds(), []);

  installStorage({ [SPELLING_PACK_IDS_STORAGE_KEY]: JSON.stringify({ id: "pack-1" }) });
  assert.deepEqual(getStoredSpellingPackIds(), []);
});

test("word source migration honors the old toggle and a saved typed list", () => {
  installStorage();
  assert.equal(getStoredSpellingSource(), "packs");

  installStorage({ [SPELLING_CUSTOM_LIST_TEXT_STORAGE_KEY]: "cat\ndog" });
  assert.equal(getStoredSpellingSource(), "typed");

  installStorage({ [SPELLING_CUSTOM_LIST_TEXT_STORAGE_KEY]: "cat\ndog", [SPELLING_CUSTOM_LIST_ENABLED_STORAGE_KEY]: "false" });
  assert.equal(getStoredSpellingSource(), "packs");

  installStorage({ "spelling.source": "typed" });
  assert.equal(getStoredSpellingSource(), "typed");
});

test("round length is clamped to 5..50 and defaults to 15", () => {
  for (const [stored, expected] of [["3", 5], ["99", 50], ["20", 20], ["abc", 15]] as const) {
    installStorage({ "spelling.roundLength": stored });
    assert.equal(getStoredSpellingRoundLength(), expected, `stored "${stored}"`);
  }
  installStorage();
  assert.equal(getStoredSpellingRoundLength(), 15);
});

test("the stored grade defaults to 1, and 0 is a real grade rather than missing", () => {
  for (const [stored, expected] of [[null, 1], ["", 1], ["0", 0], ["1", 1], ["2", 2], ["7", 1], ["two", 1]] as const) {
    installStorage(stored === null ? {} : { "app.grade": stored });
    assert.equal(getStoredGrade(), expected, `stored ${JSON.stringify(stored)}`);
  }
});

test("template sentences contain the word, pick a or an, and never change", () => {
  for (const word of ["apple", "egg", "cat", "umbrella", "jump"]) {
    const sentence = generateTemplateSentence(word);
    assert.ok(sentence.includes(word), sentence);
    assert.equal(generateTemplateSentence(word), sentence);
    assert.ok(!/\ba [aeiou]/i.test(sentence), `"a" before a vowel: ${sentence}`);
    assert.ok(!/\ban [^aeiou\s]/i.test(sentence), `"an" before a consonant: ${sentence}`);
  }
  assert.equal(generateTemplateSentence("   "), "");
});
