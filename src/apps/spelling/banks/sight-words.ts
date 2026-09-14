import type { SpellingBank } from "./types";

/**
 * Dolch pre-primer sight words, the first list a new reader meets.
 *
 * These sit at grade 0 alongside Sound It Out rather than duplicating it. Most
 * of these words cannot be sounded out -- "said", "one", "where" all break the
 * rules a decoding deck teaches -- so they have to be learned as whole shapes,
 * and spelling them letter by letter is the drill that does it. The decodable
 * ones scattered through (red, big, run) are deliberate breathers between the
 * irregular ones.
 *
 * Sentences are spoken, not read, so they may use words a five-year-old cannot
 * yet decode. They are kept short anyway: the point is to hear the word doing
 * its job in a sentence, not to parse the sentence.
 */
export const SIGHT_WORDS: SpellingBank = {
  id: "sight-words",
  label: "Sight words",
  grade: 0,
  words: [
    { word: "I", sentence: "I can write my own name." },
    { word: "a", sentence: "She ate a pear after school." },
    { word: "the", sentence: "The dog waited by the door." },
    { word: "and", sentence: "I had milk and toast for breakfast." },
    { word: "to", sentence: "We walked to the park together." },
    { word: "is", sentence: "My favorite color is blue." },
    { word: "it", sentence: "Put it back on the shelf, please." },
    { word: "in", sentence: "The socks are in the top drawer." },
    { word: "you", sentence: "Can you hold this for me?" },
    { word: "we", sentence: "We are going to the library today." },
    { word: "go", sentence: "Let us go outside before it rains." },
    { word: "see", sentence: "I see a rainbow over the trees." },
    { word: "look", sentence: "Look at how tall that sunflower grew." },
    { word: "come", sentence: "Come and sit next to me." },
    { word: "play", sentence: "We play tag at recess every day." },
    { word: "run", sentence: "I can run all the way to the fence." },
    { word: "jump", sentence: "Watch me jump over the puddle." },
    { word: "help", sentence: "Can you help me carry these books?" },
    { word: "make", sentence: "Let us make a card for grandma." },
    { word: "find", sentence: "I cannot find my other shoe." },
    { word: "big", sentence: "That is a big pile of leaves." },
    { word: "little", sentence: "A little bird landed on the railing." },
    { word: "red", sentence: "She picked the red apple." },
    { word: "blue", sentence: "The sky is bright blue today." },
    { word: "yellow", sentence: "I drew a yellow sun in the corner." },
    { word: "funny", sentence: "That was a funny story about a cat." },
    { word: "said", sentence: "Mom said we can have one more turn." },
    { word: "here", sentence: "Put your backpack here by the wall." },
    { word: "where", sentence: "Where did you leave your mittens?" },
    { word: "one", sentence: "I only need one more sticker." },
    { word: "two", sentence: "She has two library books to return." },
    { word: "three", sentence: "We counted three ducks on the pond." },
  ],
};
