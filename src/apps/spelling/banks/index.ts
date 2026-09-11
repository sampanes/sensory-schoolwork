import { PACK_1 } from "./pack-1";
import { PACK_2 } from "./pack-2";
import { PACK_3 } from "./pack-3";
import { PACK_4 } from "./pack-4";
import { PACK_5 } from "./pack-5";
import { PACK_6 } from "./pack-6";
import { CONTRACTIONS } from "./contractions";
import type { Grade } from "../../../utils/gradePreferences";
import { isAvailableAtGrade } from "../../../utils/gradePreferences";
import { SPELLING_WORDS, type SpellingWord } from "../spellingWords";
import type { SpellingBank } from "./types";

export type { SpellingBank };

export const BUILTIN_BANKS: readonly SpellingBank[] = [
  PACK_1,
  PACK_2,
  CONTRACTIONS,
  PACK_3,
  PACK_4,
  PACK_5,
  PACK_6,
] as const;

/** The banks a child working at `grade` should see, in their listed order. */
export function getBanksForGrade(grade: Grade): readonly SpellingBank[] {
  return BUILTIN_BANKS.filter((bank) => isAvailableAtGrade(bank.grade, grade));
}

/**
 * The list the spelling app drills when no custom list is saved.
 *
 * Spelled out per grade rather than derived from the banks. Which list a child
 * should practice by default is a teaching choice, not something to compute:
 * "the newest bank at this level" would silently swap grade 1 from the starter
 * words to Pack 5. Grades 0 and 1 keep the CVC starter list the app shipped
 * with. Add a line here when a new grade gets its own default.
 */
const DEFAULT_WORDS_BY_GRADE: Record<Grade, readonly SpellingWord[]> = {
  0: SPELLING_WORDS,
  1: SPELLING_WORDS,
  2: PACK_6.words,
};

export function getDefaultSpellingWords(grade: Grade): readonly SpellingWord[] {
  return DEFAULT_WORDS_BY_GRADE[grade];
}
