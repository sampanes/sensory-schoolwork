import type { Grade } from "../../../utils/gradePreferences";
import type { SpellingWord } from "../spellingWords";

export type SpellingBank = {
  id: string;
  label: string;
  /**
   * The grade this bank is introduced in. Banks above the active grade are
   * hidden on the Configurations page; earlier ones stay, because review is
   * the point. See utils/gradePreferences.ts for the cumulative rule.
   */
  grade: Grade;
  words: readonly SpellingWord[];
};
