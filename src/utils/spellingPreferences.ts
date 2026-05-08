import type { SpellingWord } from "../apps/spelling/spellingWords";

export const SPELLING_CUSTOM_LIST_ENABLED_STORAGE_KEY = "spelling.customList.enabled";
export const SPELLING_CUSTOM_LIST_TEXT_STORAGE_KEY = "spelling.customList.text";

export function getStoredSpellingCustomListEnabled() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(SPELLING_CUSTOM_LIST_ENABLED_STORAGE_KEY) === "true";
}

export function setStoredSpellingCustomListEnabled(enabled: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(SPELLING_CUSTOM_LIST_ENABLED_STORAGE_KEY, enabled ? "true" : "false");
}

export function getStoredSpellingCustomListText() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(SPELLING_CUSTOM_LIST_TEXT_STORAGE_KEY) ?? "";
}

export function setStoredSpellingCustomListText(text: string) {
  if (typeof window === "undefined") {
    return;
  }

  if (!text.trim()) {
    window.localStorage.removeItem(SPELLING_CUSTOM_LIST_TEXT_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(SPELLING_CUSTOM_LIST_TEXT_STORAGE_KEY, text);
}

export function parseSpellingCustomList(text: string): SpellingWord[] {
  const entries: SpellingWord[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const separator = line.indexOf(";");
    if (separator >= 0) {
      const wordPart = line.slice(0, separator).trim();
      const sentencePart = line.slice(separator + 1).trim();
      const normalizedWord = wordPart.replace(/\s+/g, " ").trim();
      if (normalizedWord) {
        entries.push({ word: normalizedWord, sentence: sentencePart });
      }
      continue;
    }

    for (const token of line.split(/[\s,]+/)) {
      const word = token.trim();
      if (word) {
        entries.push({ word, sentence: "" });
      }
    }
  }

  return entries;
}

export function formatSpellingCustomListEntry(entry: SpellingWord) {
  const word = entry.word.replace(/\s+/g, " ").trim();
  const sentence = (entry.sentence ?? "").replace(/\s+/g, " ").trim();

  if (!sentence) {
    return word;
  }

  return `${word}; ${sentence}`;
}

export function serializeSpellingCustomList(entries: SpellingWord[]) {
  return entries
    .map((entry) => formatSpellingCustomListEntry(entry))
    .filter(Boolean)
    .join("\n");
}
