import type { Puzzle, SolutionCell } from "../apps/sentences/types/puzzle";
import type { Week } from "./types";

const SIZE = 4;

/*
 * Used only when a week has too few words of its own to fill a grid. Short,
 * decodable, and unlikely to complete a sentence by accident.
 */
const FILLER_WORDS = ["cat", "sun", "hop", "red", "box", "pig", "mud", "fan", "jet", "web", "zip", "log"] as const;

/** Deterministic, so a maze looks the same every time it is opened. */
function seededRandom(seedText: string): () => number {
  let seed = 2166136261;
  for (let index = 0; index < seedText.length; index += 1) {
    seed = Math.imul(seed ^ seedText.charCodeAt(index), 16777619) >>> 0;
  }

  return () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

/** The words a child taps, in order. Trailing sentence punctuation is dropped, as in the workbook mazes. */
export function mazeWords(sentence: string): string[] {
  return sentence
    .trim()
    .replace(/[.!?]+$/, "")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * A path of `length` cells from the top-left corner, each step one cell up,
 * down, left, or right, never revisiting a cell -- the same rule the workbook
 * mazes follow and the connector lines assume. Depth-first with a shuffled
 * neighbour order; a 4x4 grid has a full-length path from a corner, so any
 * length up to 16 succeeds.
 */
function findPath(length: number, random: () => number): Array<[number, number]> | null {
  const visited = new Set<number>();
  const path: Array<[number, number]> = [];

  const walk = (row: number, col: number): boolean => {
    visited.add(row * SIZE + col);
    path.push([row, col]);
    if (path.length === length) {
      return true;
    }

    const steps = shuffled(
      [
        [row - 1, col],
        [row + 1, col],
        [row, col - 1],
        [row, col + 1],
      ] as Array<[number, number]>,
      random
    );

    for (const [nextRow, nextCol] of steps) {
      const inside = nextRow >= 0 && nextRow < SIZE && nextCol >= 0 && nextCol < SIZE;
      if (inside && !visited.has(nextRow * SIZE + nextCol) && walk(nextRow, nextCol)) {
        return true;
      }
    }

    visited.delete(row * SIZE + col);
    path.pop();
    return false;
  };

  return walk(0, 0) ? path : null;
}

/**
 * One maze as the sentence app's Puzzle shape. Returns null for a sentence
 * that cannot fit a 4x4 grid, so one bad line does not take the week down.
 *
 * Distractors come from the same week -- its spelling words, then the other
 * mazes' words -- so the grid is practice with the words she is learning.
 * None of them matches a word in this sentence, ignoring case, so a correct
 * sentence can only be traced one way.
 */
export function buildMaze(week: Week, mazeIndex: number): Puzzle | null {
  const maze = week.mazes[mazeIndex];
  const words = mazeWords(maze.sentence);
  if (words.length < 2 || words.length > SIZE * SIZE) {
    return null;
  }

  const id = `${week.id}-${mazeIndex + 1}`;
  const random = seededRandom(id + "|" + words.join(" "));
  const path = findPath(words.length, random);
  if (!path) {
    return null;
  }

  const taken = new Set(words.map((word) => word.toLowerCase()));
  const candidates: string[] = [];
  const addCandidate = (raw: string) => {
    const word = raw.trim().replace(/[.!?,]+$/, "");
    const key = word.toLowerCase();
    // "I" stays capitalised; any other sentence-initial capital is dropped.
    const shown = key === "i" ? "I" : key;
    if (word && !taken.has(key)) {
      taken.add(key);
      candidates.push(shown);
    }
  };

  const ownWords = shuffled(week.words.map((entry) => entry.word), random);
  const otherMazeWords = shuffled(
    week.mazes.flatMap((other, index) => (index === mazeIndex ? [] : mazeWords(other.sentence))),
    random
  );
  [...ownWords, ...otherMazeWords, ...FILLER_WORDS].forEach(addCandidate);

  const grid: string[][] = Array.from({ length: SIZE }, () => Array<string>(SIZE).fill(""));
  path.forEach(([row, col], index) => {
    grid[row][col] = words[index];
  });

  let next = 0;
  for (let row = 0; row < SIZE; row += 1) {
    for (let col = 0; col < SIZE; col += 1) {
      if (!grid[row][col]) {
        grid[row][col] = candidates[next % candidates.length];
        next += 1;
      }
    }
  }

  const solutionCells: SolutionCell[] = path.map(([row, col]) => ({ row: row + 1, col: col + 1 }));

  return {
    puzzle_id: id,
    pdf_page: 0,
    image_description: maze.picture,
    grid,
    solution_sentence: words.join(" "),
    solution_words: words,
    solution_cells: solutionCells,
  };
}

export function buildWeekMazes(week: Week): Puzzle[] {
  const puzzles: Puzzle[] = [];
  week.mazes.forEach((_, index) => {
    const puzzle = buildMaze(week, index);
    if (puzzle) {
      puzzles.push(puzzle);
    } else {
      console.error(`Skipped maze ${index + 1} of ${week.id}: it needs 2 to 16 words.`);
    }
  });
  return puzzles;
}
