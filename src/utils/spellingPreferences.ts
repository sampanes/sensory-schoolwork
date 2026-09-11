import type { SpellingWord } from "../apps/spelling/spellingWords";

/** @deprecated Superseded by SPELLING_SOURCE_STORAGE_KEY; read only to migrate. */
export const SPELLING_CUSTOM_LIST_ENABLED_STORAGE_KEY = "spelling.customList.enabled";
export const SPELLING_CUSTOM_LIST_TEXT_STORAGE_KEY = "spelling.customList.text";
export const SPELLING_SOURCE_STORAGE_KEY = "spelling.source";
export const SPELLING_PACK_IDS_STORAGE_KEY = "spelling.packIds";
export const SPELLING_ROUND_LENGTH_STORAGE_KEY = "spelling.roundLength";

/**
 * Where a session gets its words. "packs" is the everyday path; "typed" is the
 * list hand-entered in a pinch off a sheet of paper.
 *
 * These are stored separately, so choosing packs does not destroy a typed list
 * and typing one does not forget which packs were ticked.
 */
export type SpellingSource = "packs" | "typed";

export const DEFAULT_SPELLING_ROUND_LENGTH = 15;
export const MIN_SPELLING_ROUND_LENGTH = 5;
export const MAX_SPELLING_ROUND_LENGTH = 50;

export function getStoredSpellingSource(): SpellingSource {
  if (typeof window === "undefined") {
    return "packs";
  }

  const stored = window.localStorage.getItem(SPELLING_SOURCE_STORAGE_KEY);
  if (stored === "packs" || stored === "typed") {
    return stored;
  }

  /*
   * Migration for phones that predate this key. The old toggle was decorative
   * -- the playlist used the typed text whenever it was non-empty, whatever
   * the toggle said -- so an explicit "off" is honoured as intent to use the
   * built-in list, and otherwise a saved list means it was in use.
   */
  if (window.localStorage.getItem(SPELLING_CUSTOM_LIST_ENABLED_STORAGE_KEY) === "false") {
    return "packs";
  }

  return window.localStorage.getItem(SPELLING_CUSTOM_LIST_TEXT_STORAGE_KEY)?.trim() ? "typed" : "packs";
}

export function setStoredSpellingSource(source: SpellingSource) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(SPELLING_SOURCE_STORAGE_KEY, source);
}

/** Ticked pack ids. An empty list means "whatever this grade defaults to". */
export function getStoredSpellingPackIds(): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  const raw = window.localStorage.getItem(SPELLING_PACK_IDS_STORAGE_KEY);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function setStoredSpellingPackIds(packIds: readonly string[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(SPELLING_PACK_IDS_STORAGE_KEY, JSON.stringify([...packIds]));
}

export function getStoredSpellingRoundLength(): number {
  if (typeof window === "undefined") {
    return DEFAULT_SPELLING_ROUND_LENGTH;
  }

  const parsed = Number.parseInt(window.localStorage.getItem(SPELLING_ROUND_LENGTH_STORAGE_KEY) ?? "", 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SPELLING_ROUND_LENGTH;
  }

  return Math.min(Math.max(parsed, MIN_SPELLING_ROUND_LENGTH), MAX_SPELLING_ROUND_LENGTH);
}

export function setStoredSpellingRoundLength(length: number) {
  if (typeof window === "undefined") {
    return;
  }

  const bounded = Math.min(Math.max(Math.floor(length), MIN_SPELLING_ROUND_LENGTH), MAX_SPELLING_ROUND_LENGTH);
  window.localStorage.setItem(SPELLING_ROUND_LENGTH_STORAGE_KEY, String(bounded));
}

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
