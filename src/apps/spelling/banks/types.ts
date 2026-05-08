import type { SpellingWord } from "../spellingWords";

export type SpellingBank = {
  id: string;
  label: string;
  words: readonly SpellingWord[];
};
