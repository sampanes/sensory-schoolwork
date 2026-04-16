export type SpellingWord = {
  word: string;
  sentence?: string;
};

export const SPELLING_WORDS: readonly SpellingWord[] = [
  { word: "cat", sentence: "The cat took a nap on the warm step." },
  { word: "dog", sentence: "The dog ran fast to catch the ball." },
  { word: "sun", sentence: "The sun made the sidewalk hot and bright." },
  { word: "hat", sentence: "She put on her red hat before going outside." },
  { word: "bed", sentence: "I jumped onto my bed after school." },
  { word: "fish", sentence: "The fish swam under the little bridge." },
  { word: "frog", sentence: "A green frog hopped by the pond." },
  { word: "tree", sentence: "We sat under the big tree for shade." },
  { word: "book", sentence: "I opened my book and read the first page." },
  { word: "milk", sentence: "He poured milk into the blue cup." },
  { word: "cake", sentence: "We ate cake after dinner for dessert." },
  { word: "hand", sentence: "Raise your hand if you know the answer." },
  { word: "star", sentence: "One bright star was easy to see tonight." },
  { word: "duck", sentence: "The duck splashed in the water." },
  { word: "kite", sentence: "Her kite flew high above the park." },
  { word: "sock", sentence: "I found one sock under the couch." },
  { word: "apple", sentence: "I ate a crunchy red apple for lunch." },
  { word: "green", sentence: "My backpack is green with a yellow zipper." },
  { word: "smile", sentence: "A big smile spread across her face." },
  { word: "water", sentence: "Please drink water after you run outside." },
] as const;

export const TOTAL_LETTERS = SPELLING_WORDS.reduce(
  (total, entry) => total + entry.word.length,
  0
);
