import assert from "node:assert/strict";
import { test } from "node:test";
import type { Puzzle } from "../src/apps/sentences/types/puzzle";
import { WEEKS, type Week } from "../src/weekly";
import { buildMaze, buildWeekMazes, mazeWords } from "../src/weekly/mazes";

const SIZE = 4;

/** Levenshtein distance of at most one, written independently of mazes.ts so the two can disagree. */
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) {
    return false;
  }
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[b.length] <= 1;
}

/**
 * Everything the maze screen relies on. It marks a maze solved when the SET of
 * tapped cells equals the set of solution cells, so the grid must never offer
 * a sentence word anywhere off the path: a child who taps that copy has built
 * the right sentence and gets no win.
 */
function assertSolvableOneWay(puzzle: Puzzle, sentence: string, label: string) {
  const words = mazeWords(sentence);

  assert.equal(puzzle.grid.length, SIZE, `${label}: rows`);
  puzzle.grid.forEach((row, rowIndex) => {
    assert.equal(row.length, SIZE, `${label}: row ${rowIndex + 1} width`);
    row.forEach((cell, colIndex) => assert.ok(cell.trim(), `${label}: empty cell ${rowIndex + 1},${colIndex + 1}`));
  });

  const cells = puzzle.solution_cells;
  assert.equal(cells.length, words.length, `${label}: path length`);
  assert.deepEqual(cells[0], { row: 1, col: 1 }, `${label}: path must start top-left`);
  assert.deepEqual(puzzle.solution_words, words, `${label}: solution words`);
  assert.equal(puzzle.solution_sentence, words.join(" "), `${label}: solution sentence`);

  const onPath = new Set<string>();
  cells.forEach((cell, index) => {
    assert.ok(cell.row >= 1 && cell.row <= SIZE && cell.col >= 1 && cell.col <= SIZE, `${label}: cell off grid`);
    const key = `${cell.row},${cell.col}`;
    assert.ok(!onPath.has(key), `${label}: path revisits ${key}`);
    onPath.add(key);
    if (index > 0) {
      const previous = cells[index - 1];
      const step = Math.abs(previous.row - cell.row) + Math.abs(previous.col - cell.col);
      assert.equal(step, 1, `${label}: step ${index} is not one cell up, down, left or right`);
    }
    assert.equal(puzzle.grid[cell.row - 1][cell.col - 1], words[index], `${label}: word ${index + 1} not on its cell`);
  });

  const sentenceKeys = words.map((word) => word.toLowerCase());
  puzzle.grid.forEach((row, rowIndex) =>
    row.forEach((cell, colIndex) => {
      if (onPath.has(`${rowIndex + 1},${colIndex + 1}`)) {
        return;
      }
      const key = cell.toLowerCase();
      assert.ok(!sentenceKeys.includes(key), `${label}: off-path cell holds the sentence word "${cell}"`);
      for (const own of sentenceKeys) {
        if (own.length > 2) {
          assert.ok(!withinOneEdit(own, key), `${label}: off-path "${cell}" is one letter from "${own}"`);
        }
      }
    })
  );
}

function syntheticWeek(sentences: string[], words: string[] = []): Week {
  return {
    id: "week-2000-01-03",
    weekOf: "2000-01-03",
    words: words.map((word) => ({ word, sentence: `I can spell ${word}.` })),
    mazes: sentences.map((sentence) => ({ sentence, picture: "A picture." })),
  };
}

test("every shipped weekly maze builds, and its sentence traces exactly one way", () => {
  assert.ok(WEEKS.length > 0, "no weeks registered");
  for (const week of WEEKS) {
    week.mazes.forEach((maze, index) => {
      const puzzle = buildMaze(week, index);
      assert.ok(puzzle, `${week.id} maze ${index + 1} did not build`);
      assertSolvableOneWay(puzzle, maze.sentence, `${week.id} maze ${index + 1}`);
    });
    assert.equal(buildWeekMazes(week).length, week.mazes.length, `${week.id}: a maze was skipped`);
  }
});

test("maze ids are unique across all weeks", () => {
  const ids = WEEKS.flatMap((week) => buildWeekMazes(week).map((puzzle) => puzzle.puzzle_id));
  assert.equal(new Set(ids).size, ids.length);
});

test("a maze is the same every time it is opened", () => {
  for (const week of WEEKS) {
    week.mazes.forEach((_, index) => assert.deepEqual(buildMaze(week, index), buildMaze(week, index)));
  }
});

test("mazeWords drops trailing sentence punctuation and extra spaces", () => {
  assert.deepEqual(mazeWords("  The frog can jump.  "), ["The", "frog", "can", "jump"]);
  assert.deepEqual(mazeWords("Can you hear it?!"), ["Can", "you", "hear", "it"]);
  assert.deepEqual(mazeWords("I  ran   home"), ["I", "ran", "home"]);
});

test("a sentence that repeats a word still has every copy on the path", () => {
  const week = syntheticWeek(["The cat and the dog sat on the mat"], ["cat", "dog", "mat", "sat"]);
  const puzzle = buildMaze(week, 0);
  assert.ok(puzzle);
  assertSolvableOneWay(puzzle, week.mazes[0].sentence, "repeat");
});

test("sixteen words fill the whole grid; seventeen or one cannot be built", () => {
  const sixteen = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen";
  const full = buildMaze(syntheticWeek([sixteen]), 0);
  assert.ok(full);
  assertSolvableOneWay(full, sixteen, "sixteen");

  assert.equal(buildMaze(syntheticWeek([`${sixteen} seventeen`]), 0), null);
  assert.equal(buildMaze(syntheticWeek(["Hello"]), 0), null);
});

test("a week with no spelling words still fills the grid from filler words", () => {
  const week = syntheticWeek(["We can run fast"]);
  const puzzle = buildMaze(week, 0);
  assert.ok(puzzle);
  assertSolvableOneWay(puzzle, week.mazes[0].sentence, "filler");
});

test("one-letter-off spelling words stay out of the grid (woman/women, hear/heard)", () => {
  const week = syntheticWeek(
    ["The woman can hear a pear"],
    ["women", "heard", "pair", "pare", "woman", "hear", "pear", "dollar", "evening", "chain", "learn", "wonder"]
  );
  const puzzle = buildMaze(week, 0);
  assert.ok(puzzle);
  assertSolvableOneWay(puzzle, week.mazes[0].sentence, "near-match");
});

test("random sentences from 2 to 16 words always trace one way", () => {
  const vocabulary = [
    ...new Set(WEEKS.flatMap((week) => [...week.words.map((entry) => entry.word), ...week.mazes.flatMap((maze) => mazeWords(maze.sentence))])),
    "the", "a", "I", "we", "can", "see", "big", "run", "and", "is",
  ];
  let seed = 12345;
  const random = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed / 4294967296;
  };

  for (let round = 0; round < 400; round += 1) {
    const length = 2 + Math.floor(random() * 15);
    const sentence = Array.from({ length }, () => vocabulary[Math.floor(random() * vocabulary.length)]).join(" ");
    const extraWords = Array.from({ length: 30 }, () => vocabulary[Math.floor(random() * vocabulary.length)]);
    const week = syntheticWeek([sentence, "We like to read books"], [...new Set(extraWords)]);
    const puzzle = buildMaze(week, 0);
    assert.ok(puzzle, `round ${round}: "${sentence}" did not build`);
    assertSolvableOneWay(puzzle, sentence, `round ${round} ("${sentence}")`);
  }
});
