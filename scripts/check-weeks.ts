/*
 * Checks every week in src/weekly/ before it ships. Run with:
 *
 *   npm run check:weeks
 *
 * Exits non-zero on a problem that would break or confuse a session (a maze
 * that cannot be built, a duplicate word, an id that does not match its date).
 * Warnings are things worth a second look that still work.
 */
import { WEEKS } from "../src/weekly";
import { buildMaze, mazeWords } from "../src/weekly/mazes";

let errors = 0;
let warnings = 0;
const error = (message: string) => {
  errors += 1;
  console.log(`[X] ${message}`);
};
const warn = (message: string) => {
  warnings += 1;
  console.log(`[!] ${message}`);
};

const ids = new Set<string>();

for (const week of WEEKS) {
  const where = week.id;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(week.weekOf)) {
    error(`${where}: weekOf "${week.weekOf}" is not YYYY-MM-DD`);
  } else {
    if (week.id !== `week-${week.weekOf}`) {
      error(`${where}: id should be "week-${week.weekOf}"`);
    }
    const [year, month, day] = week.weekOf.split("-").map(Number);
    if (new Date(Date.UTC(year, month - 1, day)).getUTCDay() !== 1) {
      warn(`${where}: ${week.weekOf} is not a Monday`);
    }
  }

  if (ids.has(week.id)) {
    error(`${where}: id used by two weeks`);
  }
  ids.add(week.id);

  if (week.words.length < 20 || week.words.length > 40) {
    warn(`${where}: ${week.words.length} words (the ritual is about 30)`);
  }

  const seen = new Set<string>();
  for (const entry of week.words) {
    const key = entry.word.trim().toLowerCase();
    if (!key) {
      error(`${where}: an empty word`);
      continue;
    }
    if (seen.has(key)) {
      error(`${where}: "${entry.word}" is listed twice`);
    }
    seen.add(key);

    const sentence = (entry.sentence ?? "").trim();
    if (!sentence) {
      warn(`${where}: "${entry.word}" has no sentence (a template one will be read instead)`);
    } else if (!sentence.toLowerCase().includes(key)) {
      warn(`${where}: the sentence for "${entry.word}" does not contain the word`);
    }
  }

  if (week.mazes.length === 0) {
    warn(`${where}: no mazes, so the maze screen shows only the workbook`);
  }

  week.mazes.forEach((maze, index) => {
    const label = `${where} maze ${index + 1} ("${maze.sentence}")`;
    const words = mazeWords(maze.sentence);
    if (words.length < 4 || words.length > 9) {
      warn(`${label}: ${words.length} words; 4-9 fits the grid and the child best`);
    }
    if (/,/.test(maze.sentence)) {
      warn(`${label}: commas stay attached to a word in the grid`);
    }
    if (!maze.picture.trim()) {
      warn(`${label}: no picture description, so the Hint is empty`);
    }
    if (!buildMaze(week, index)) {
      error(`${label}: cannot be built (needs 2-16 words)`);
    }
    if (!words.some((word) => seen.has(word.toLowerCase()))) {
      warn(`${label}: uses none of this week's spelling words`);
    }
  });

  console.log(`${where}: ${week.words.length} words, ${week.mazes.length} mazes`);
}

console.log(`${WEEKS.length} week(s), ${errors} error(s), ${warnings} warning(s)`);
process.exit(errors > 0 ? 1 : 0);
