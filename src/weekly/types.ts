import type { SpellingWord } from "../apps/spelling/spellingWords";

/**
 * One sentence maze. Only the sentence is authored: the 4x4 grid, the path
 * through it, and the distractor words are built from it at load time (see
 * mazes.ts), so adding a maze never means hand-placing sixteen cells.
 *
 * Keep it to 4-9 words with no commas. A trailing period is dropped.
 */
export type WeeklyMaze = {
  sentence: string;
  /** Shown behind the Hint button, the way the workbook mazes describe their picture. */
  picture: string;
};

/**
 * One week's words. A week is a single file in this folder, registered in
 * index.ts, and feeds both activities: the words become a spelling list, and
 * the mazes become that week's set of sentence mazes.
 */
export type Week = {
  /** "week-YYYY-MM-DD". Saved selections and maze progress are keyed on it, so never rename one. */
  id: string;
  /** The Monday the words were added, as YYYY-MM-DD. The newest one is "this week". */
  weekOf: string;
  words: readonly SpellingWord[];
  mazes: readonly WeeklyMaze[];
};
