import { PACK_1 } from "./pack-1";
import { PACK_2 } from "./pack-2";
import { PACK_3 } from "./pack-3";
import { PACK_4 } from "./pack-4";
import { PACK_5 } from "./pack-5";
import { PACK_6 } from "./pack-6";
import { CONTRACTIONS } from "./contractions";
import type { Grade } from "../../../utils/gradePreferences";
import { isAvailableAtGrade } from "../../../utils/gradePreferences";
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
