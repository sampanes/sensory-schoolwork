import { PACK_1 } from "./pack-1";
import { PACK_2 } from "./pack-2";
import { PACK_3 } from "./pack-3";
import { PACK_4 } from "./pack-4";
import { PACK_5 } from "./pack-5";
import { PACK_6 } from "./pack-6";
import { CONTRACTIONS } from "./contractions";
import { STARTER } from "./starter";
import type { Grade } from "../../../utils/gradePreferences";
import { isAvailableAtGrade } from "../../../utils/gradePreferences";
import type { SpellingWord } from "../spellingWords";
import type { SpellingBank } from "./types";

export type { SpellingBank };
export { STARTER };

export const BUILTIN_BANKS: readonly SpellingBank[] = [
  STARTER,
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
 * What gets picked when nothing has been chosen yet.
 *
 * Spelled out per grade rather than derived from the banks. Which list a child
 * should practice by default is a teaching choice, not something to compute:
 * "the newest bank at this level" would silently swap grade 1 from the starter
 * words to Pack 5. Add a line here when a new grade gets its own default.
 */
const DEFAULT_PACK_IDS_BY_GRADE: Record<Grade, readonly string[]> = {
  0: [STARTER.id],
  1: [STARTER.id],
  2: [PACK_6.id],
};

export function getDefaultPackIds(grade: Grade): readonly string[] {
  return DEFAULT_PACK_IDS_BY_GRADE[grade];
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
  const available = getBanksForGrade(grade);
  const wanted = new Set(packIds);
  const selected = available.filter((bank) => wanted.has(bank.id));

  if (selected.length > 0) {
    return selected;
  }

  const fallback = new Set(getDefaultPackIds(grade));
  return available.filter((bank) => fallback.has(bank.id));
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
