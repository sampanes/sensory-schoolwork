import { PACK_1 } from "./pack-1";
import { PACK_2 } from "./pack-2";
import { PACK_3 } from "./pack-3";
import { CONTRACTIONS } from "./contractions";
import type { SpellingBank } from "./types";

export type { SpellingBank };

export const BUILTIN_BANKS: readonly SpellingBank[] = [
  PACK_1,
  PACK_2,
  CONTRACTIONS,
  PACK_3,
] as const;
