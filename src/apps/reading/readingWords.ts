export type ReadingWord = {
  word: string;
  /** A bundled image URL, or null when no suitable picture is available. */
  image: string | null;
  /** Optional text and voice hints for words that need language-specific speech. */
  speechText?: string;
  speechLanguage?: string;
  speechRate?: number;
};

export type WordLength = 3 | 4;

export type ReadingDeckDefinition = {
  id: string;
  label: string;
  words: ReadingWord[];
};

export type WordFamily = ReadingDeckDefinition & {
  wordLength: WordLength;
};

export const READING_WORD_LENGTHS: readonly WordLength[] = [3, 4];

const BASE_URL = import.meta.env.BASE_URL ?? "/";

function withBaseUrl(path: string) {
  const normalizedBase = BASE_URL.endsWith("/") ? BASE_URL : `${BASE_URL}/`;
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return `${normalizedBase}${normalizedPath}`;
}

/**
 * Every word below has a matching PNG in public/reading/arasaac/, picked by
 * hand so the picture shows the intended noun (bat the animal, tap the
 * faucet, log the piece of wood). See that directory's manifest.json for the
 * ARASAAC pictogram ID behind each file.
 */
const arasaacWords = (...entries: string[]): ReadingWord[] =>
  entries.map((word) => ({ word, image: withBaseUrl(`reading/arasaac/${word}.png`) }));

/**
 * Order within a family is deliberate: the stable ending is repeated while the
 * initial consonant changes.
 *
 * Families are split by word length so the chooser can show one 3x3 grid at a
 * time. Three-letter families are all short-vowel CVC. Four-letter families
 * each introduce one new mechanic -- a vowel team (_OAT), an ending blend
 * (_AMP, _EST), an ending digraph (_OCK) or a split digraph (_AKE) -- so a
 * child works through a single new idea per family rather than meeting several
 * at once.
 *
 * A family only earns a place if at least two of its words have a pictogram
 * that unambiguously shows that exact noun. That rules out several otherwise
 * tempting families; see public/reading/arasaac/README.md for which and why.
 */
export const READING_FAMILIES: WordFamily[] = [
  { id: "at", label: "_AT", wordLength: 3, words: arasaacWords("bat", "cat", "hat", "mat", "rat") },
  { id: "an", label: "_AN", wordLength: 3, words: arasaacWords("can", "fan", "man", "pan", "van") },
  { id: "ap", label: "_AP", wordLength: 3, words: arasaacWords("cap", "map", "nap", "tap") },
  { id: "am", label: "_AM", wordLength: 3, words: arasaacWords("ham", "jam", "ram", "yam") },
  { id: "in", label: "_IN", wordLength: 3, words: arasaacWords("bin", "fin", "pin", "tin") },
  { id: "ug", label: "_UG", wordLength: 3, words: arasaacWords("bug", "jug", "mug", "rug") },
  { id: "et", label: "_ET", wordLength: 3, words: arasaacWords("jet", "net", "pet", "vet") },
  { id: "ig", label: "_IG", wordLength: 3, words: arasaacWords("fig", "pig", "wig") },
  { id: "og", label: "_OG", wordLength: 3, words: arasaacWords("dog", "hog", "log") },

  { id: "oat", label: "_OAT", wordLength: 4, words: arasaacWords("boat", "coat", "goat") },
  { id: "amp", label: "_AMP", wordLength: 4, words: arasaacWords("camp", "lamp", "ramp") },
  { id: "est", label: "_EST", wordLength: 4, words: arasaacWords("nest", "vest") },
  { id: "ock", label: "_OCK", wordLength: 4, words: arasaacWords("lock", "sock") },
  { id: "ake", label: "_AKE", wordLength: 4, words: arasaacWords("cake", "rake") },
];

const advancedImage = (filename: string) => withBaseUrl(`reading/advanced/${filename}.png`);

export const ADVANCED_READING_DECK: ReadingDeckDefinition = {
  id: "very-advanced",
  label: "Very advanced",
  words: [
    { word: "osteichthyes", image: advancedImage("osteichthyes"), speechRate: 0.72 },
    { word: "nucleotide", image: advancedImage("nucleotide"), speechRate: 0.72 },
    { word: "planetesimal", image: advancedImage("planetesimal"), speechRate: 0.72 },
    {
      word: "parangaricutirimícuaro",
      image: advancedImage("parangaricutirimicuaro"),
      speechText: "Parangaricutirimícuaro",
      speechLanguage: "es-MX",
      speechRate: 0.68,
    },
    { word: "axolotl", image: advancedImage("axolotl"), speechRate: 0.72 },
  ],
};

const READING_DECKS: ReadingDeckDefinition[] = [...READING_FAMILIES, ADVANCED_READING_DECK];

export function getReadingDeck(id: string | undefined) {
  return READING_DECKS.find((deck) => deck.id === id);
}

export function getReadingFamilies(wordLength: WordLength) {
  return READING_FAMILIES.filter((family) => family.wordLength === wordLength);
}
