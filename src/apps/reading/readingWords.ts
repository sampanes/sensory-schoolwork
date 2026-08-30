export type ReadingWord = {
  word: string;
  /** A local Mulberry SVG path, or null when no suitable symbol is available. */
  image: string | null;
};

export type WordFamily = {
  id: string;
  label: string;
  words: ReadingWord[];
};

const words = (...entries: string[]): ReadingWord[] =>
  entries.map((word) => ({ word, image: null }));

/**
 * V1 curriculum. Order is deliberate: the stable ending is repeated while the
 * initial consonant changes. Image mappings are explicit so missing artwork is
 * safe and future symbols can be added without changing the deck.
 */
export const READING_FAMILIES: WordFamily[] = [
  { id: "at", label: "_AT", words: words("bat", "cat", "hat", "mat", "rat") },
  { id: "an", label: "_AN", words: words("can", "fan", "man", "pan", "van") },
  { id: "ap", label: "_AP", words: words("cap", "map", "nap", "tap") },
  { id: "am", label: "_AM", words: words("ham", "jam", "ram", "yam") },
  { id: "in", label: "_IN", words: words("bin", "fin", "pin", "tin") },
  { id: "ug", label: "_UG", words: words("bug", "jug", "mug", "rug") },
  { id: "et", label: "_ET", words: words("jet", "net", "pet", "vet") },
  { id: "ig", label: "_IG", words: words("fig", "pig", "wig") },
  { id: "og", label: "_OG", words: words("dog", "hog", "log") },
];

export function getReadingFamily(id: string | undefined) {
  return READING_FAMILIES.find((family) => family.id === id);
}
