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
  /**
   * Moved out of the way, not removed: an archived bank still works if
   * ticked, and can still be copied into a typed list, but it sits in the
   * collapsed Archive on the Configurations page instead of out front.
   */
  archived?: boolean;
  words: readonly SpellingWord[];
};
