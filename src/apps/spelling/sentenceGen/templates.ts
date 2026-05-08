const FRAMES: readonly string[] = [
  "I see a {word} at school today.",
  "She has a small {word} in her bag.",
  "We found a {word} near the door.",
  "Look at that {word} over there.",
  "My friend showed me a {word} yesterday.",
  "The {word} is right on the table.",
  "A big {word} is hard to miss.",
  "I gave the {word} to my dad.",
  "We can play with the {word} together.",
  "He likes the new {word} a lot.",
  "Mom packed a {word} in my lunchbox.",
  "Please put the {word} back where it goes.",
] as const;

function hashWord(word: string): number {
  let hash = 0;
  for (let index = 0; index < word.length; index += 1) {
    hash = (hash * 31 + word.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function startsWithVowelSound(word: string): boolean {
  const first = word.trim().charAt(0).toLowerCase();
  return first === "a" || first === "e" || first === "i" || first === "o" || first === "u";
}

export function generateTemplateSentence(word: string): string {
  const trimmed = word.trim();
  if (!trimmed) {
    return "";
  }

  const frame = FRAMES[hashWord(trimmed.toLowerCase()) % FRAMES.length];
  const article = startsWithVowelSound(trimmed) ? "an" : "a";
  return frame.replace(/\ba (\{word\})/g, `${article} $1`).replace("{word}", trimmed);
}
