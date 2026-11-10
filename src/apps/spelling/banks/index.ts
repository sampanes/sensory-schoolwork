import { PACK_1 } from "./pack-1";
import { PACK_2 } from "./pack-2";
import { PACK_3 } from "./pack-3";
import { PACK_4 } from "./pack-4";
import { PACK_5 } from "./pack-5";
import { PACK_6 } from "./pack-6";
import { CONTRACTIONS } from "./contractions";
import { SIGHT_WORDS } from "./sight-words";
import { STARTER } from "./starter";
import type { Grade } from "../../../utils/gradePreferences";
import { isAvailableAtGrade } from "../../../utils/gradePreferences";
import type { SpellingWord } from "../spellingWords";
import type { SpellingBank } from "./types";
import { CURRENT_WEEK, WEEKS, weekLabel } from "../../../weekly";

export type { SpellingBank };
export { SIGHT_WORDS, STARTER };

/*
 * The Monday-night lists, newest first. Each week in src/weekly/ becomes a
 * bank here. They are grade 0 so they show at every level: the week's words
 * are chosen for the child in front of you, not for a grade.
 */
export const WEEKLY_BANKS: readonly SpellingBank[] = WEEKS.map((week) => ({
  id: week.id,
  label: weekLabel(week),
  grade: 0,
  words: week.words,
}));

/**
 * A selection that follows the calendar: ticking "This week" means whatever
 * the newest week is, so the Monday list takes over without anyone touching
 * the Configurations page. Ticking a dated week pins that week instead.
 */
export const THIS_WEEK_ID = "this-week";

export const CURRENT_WEEK_BANK: SpellingBank | null = WEEKLY_BANKS[0] ?? null;

export const BUILTIN_BANKS: readonly SpellingBank[] = [
  SIGHT_WORDS,
  STARTER,
  PACK_1,
  PACK_2,
  CONTRACTIONS,
  PACK_3,
  PACK_4,
  PACK_5,
  PACK_6,
] as const;

/**
 * The banks a child working at `grade` can use, weekly lists first, then the
 * built-in ones in their listed order. Archived banks are included: they are
 * still selectable, just shown apart.
 */
export function getBanksForGrade(grade: Grade): readonly SpellingBank[] {
  return [...WEEKLY_BANKS, ...BUILTIN_BANKS].filter((bank) => isAvailableAtGrade(bank.grade, grade));
}

/**
 * What gets picked when nothing has been chosen yet.
 *
 * Spelled out per grade rather than derived from the banks. Which list a child
 * should practice by default is a teaching choice, not something to compute:
 * "the newest bank at this level" would silently swap grade 1 from the starter
 * words to Pack 5. Add a line here when a new grade gets its own default.
 */
const DEFAULT_PACK_IDS_BY_GRADE: Record<Grade, readonly string[]> = {
  /*
   * Sight words rather than the starter list, which is CVC words that Sound It
   * Out already drills. These are the ones a decoding deck cannot teach.
   */
  0: [SIGHT_WORDS.id],
  1: [STARTER.id],
  2: [PACK_6.id],
};

/**
 * Once there is a weekly list, it is the default at every grade: the Monday
 * words are the teaching choice now. The per-grade table only covers the time
 * before the first week is added.
 */
export function getDefaultPackIds(grade: Grade): readonly string[] {
  return CURRENT_WEEK ? [THIS_WEEK_ID] : DEFAULT_PACK_IDS_BY_GRADE[grade];
}

/**
 * The banks behind a saved selection, in the order they appear in
 * BUILTIN_BANKS rather than the order they were ticked, so the label reads the
 * same every time.
 *
 * Ids that name no bank, or a bank above the active grade, are dropped: a
 * selection made at grade 2 must not smuggle Pack 6 into a grade 1 session.
 * If nothing survives, the grade default stands in, so a session always has
 * words even after a bank is renamed or removed.
 */
export function resolveSelectedBanks(packIds: readonly string[], grade: Grade): readonly SpellingBank[] {
  const pick = (ids: readonly string[]) => {
    const wanted = new Set(ids);
    if (wanted.has(THIS_WEEK_ID) && CURRENT_WEEK_BANK) {
      wanted.add(CURRENT_WEEK_BANK.id);
    }
    return getBanksForGrade(grade).filter((bank) => wanted.has(bank.id));
  };

  const selected = pick(packIds);
  return selected.length > 0 ? selected : pick(getDefaultPackIds(grade));
}

/**
 * Every word from the selected banks, with duplicates removed. Packs overlap
 * on common words, and drilling the same word twice in one round reads as a
 * bug to a child who just spelled it.
 */
export function resolveSelectedWords(packIds: readonly string[], grade: Grade): SpellingWord[] {
  const seen = new Set<string>();
  const words: SpellingWord[] = [];

  for (const bank of resolveSelectedBanks(packIds, grade)) {
    for (const entry of bank.words) {
      const key = entry.word.trim().toLowerCase();
      if (key && !seen.has(key)) {
        seen.add(key);
        words.push(entry);
      }
    }
  }

  return words;
}

/** A short name for the current selection, for the spelling screen's header. */
export function describeSelection(packIds: readonly string[], grade: Grade): string {
  const banks = resolveSelectedBanks(packIds, grade);

  if (banks.length === 0) {
    return "No list";
  }

  if (banks.length <= 2) {
    return banks.map((bank) => bank.label).join(" + ");
  }

  return `${banks.length} packs`;
}
