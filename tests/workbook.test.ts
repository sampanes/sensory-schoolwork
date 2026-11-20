import assert from "node:assert/strict";
import { test } from "node:test";
import data from "../src/apps/sentences/data/puzzles.json";
import type { Puzzle, PuzzleData } from "../src/apps/sentences/types/puzzle";

const workbook = data as PuzzleData;
const SIZE = 4;
const norm = (word: string) => word.toLowerCase().replace(/[.,!?]+$/, "");

/** Every path of one-cell steps from the top-left corner that spells the sentence, ignoring case. */
function tracings(puzzle: Puzzle): Array<Array<[number, number]>> {
  const grid = puzzle.grid.map((row) => row.map(norm));
  const words = puzzle.solution_words.map(norm);
  const found: Array<Array<[number, number]>> = [];
  const walk = (trail: Array<[number, number]>) => {
    const [row, col] = trail[trail.length - 1];
    if (grid[row][col] !== words[trail.length - 1]) {
      return;
    }
    if (trail.length === words.length) {
      found.push(trail);
      return;
    }
    for (const [nextRow, nextCol] of [
      [row + 1, col],
      [row - 1, col],
      [row, col + 1],
      [row, col - 1],
    ]) {
      const inside = nextRow >= 0 && nextRow < SIZE && nextCol >= 0 && nextCol < SIZE;
      if (inside && !trail.some(([r, c]) => r === nextRow && c === nextCol)) {
        walk([...trail, [nextRow, nextCol]]);
      }
    }
  };
  walk([[0, 0]]);
  return found;
}

test("the workbook summary count matches, and puzzle ids are unique", () => {
  assert.equal(workbook.summary.total_puzzles, workbook.puzzles.length);
  const ids = workbook.puzzles.map((puzzle) => puzzle.puzzle_id);
  assert.equal(new Set(ids).size, ids.length);
});

test("every workbook maze is a full 4x4 grid with a valid grade", () => {
  for (const puzzle of workbook.puzzles) {
    assert.equal(puzzle.grid.length, SIZE, puzzle.puzzle_id);
    for (const row of puzzle.grid) {
      assert.equal(row.length, SIZE, puzzle.puzzle_id);
      assert.ok(row.every((cell) => cell.trim()), `${puzzle.puzzle_id}: empty cell`);
    }
    assert.ok(puzzle.grade === undefined || [0, 1, 2].includes(puzzle.grade), `${puzzle.puzzle_id}: grade ${puzzle.grade}`);
  }
});

test("every workbook answer key is a path of one-cell steps from the top-left that spells the sentence", () => {
  for (const puzzle of workbook.puzzles) {
    const id = puzzle.puzzle_id;
    const cells = puzzle.solution_cells;
    assert.equal(cells.length, puzzle.solution_words.length, `${id}: cells vs words`);
    const bare = (text: string) => text.replace(/[.!?]+$/, "");
    assert.equal(bare(puzzle.solution_sentence), bare(puzzle.solution_words.join(" ")), `${id}: sentence vs words`);
    assert.deepEqual(cells[0], { row: 1, col: 1 }, `${id}: start`);
    cells.forEach((cell, index) => {
      assert.equal(puzzle.grid[cell.row - 1]?.[cell.col - 1], puzzle.solution_words[index], `${id}: word ${index + 1} is not on its cell`);
      if (index > 0) {
        const previous = cells[index - 1];
        assert.equal(Math.abs(previous.row - cell.row) + Math.abs(previous.col - cell.col), 1, `${id}: step ${index} jumps`);
      }
    });
  }
});

test("every workbook sentence traces exactly one way, so the right trace is always the one the screen accepts", () => {
  for (const puzzle of workbook.puzzles) {
    const found = tracings(puzzle);
    assert.equal(found.length, 1, `${puzzle.puzzle_id} ("${puzzle.solution_sentence}") traces ${found.length} ways`);
    assert.deepEqual(
      found[0].map(([row, col]) => ({ row: row + 1, col: col + 1 })),
      puzzle.solution_cells,
      `${puzzle.puzzle_id}: the only tracing is not the answer key`
    );
  }
});
