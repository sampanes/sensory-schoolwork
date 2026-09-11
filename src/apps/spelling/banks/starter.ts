import { SPELLING_WORDS } from "../spellingWords";
import type { SpellingBank } from "./types";

/**
 * The original 20 CVC words, wrapped as a bank so every word list in the app
 * is the same kind of thing. Before this, the starter list was a special case
 * the picker could not see, which is why "use a pack" used to mean "paste its
 * words over the top of whatever was there".
 */
export const STARTER: SpellingBank = {
  id: "starter",
  label: "Starter words",
  grade: 0,
  words: SPELLING_WORDS,
};
