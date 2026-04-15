export const SPELLING_VOICE_STORAGE_KEY = "spelling.voiceURI";
export const MATH_DEBUG_STORAGE_KEY = "math.debug";
export const MATH_DEBUG_CAPTURE_ALL_STORAGE_KEY = "math.debug.captureAll";
export const MATH_TOUCH_ENABLED_STORAGE_KEY = "math.touchEnabled";
export const MATH_DEBUG_BIAS_FOURS_STORAGE_KEY = "math.debug.biasFours";
export const MATH_DEBUG_CAPTURE_RUN_LENGTH_STORAGE_KEY = "math.debug.captureRunLength";

const DEFAULT_MATH_DEBUG_CAPTURE_RUN_LENGTH = 12;
const ALLOWED_MATH_DEBUG_CAPTURE_RUN_LENGTHS = new Set([12, 50, 100]);

export function getStoredSpellingVoiceURI() {
  if (typeof window === "undefined") {
    return "";
  }

  return window.localStorage.getItem(SPELLING_VOICE_STORAGE_KEY) ?? "";
}

export function setStoredSpellingVoiceURI(voiceURI: string) {
  if (typeof window === "undefined") {
    return;
  }

  if (!voiceURI) {
    window.localStorage.removeItem(SPELLING_VOICE_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(SPELLING_VOICE_STORAGE_KEY, voiceURI);
}

export function getPreferredSpellingVoice() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return null;
  }

  const voiceURI = getStoredSpellingVoiceURI();
  if (!voiceURI) {
    return null;
  }

  return window.speechSynthesis.getVoices().find((voice) => voice.voiceURI === voiceURI) ?? null;
}

export function getStoredMathDebugEnabled() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(MATH_DEBUG_STORAGE_KEY) === "true";
}

export function setStoredMathDebugEnabled(enabled: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(MATH_DEBUG_STORAGE_KEY, enabled ? "true" : "false");
}

export function getStoredMathDebugCaptureAllEnabled() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(MATH_DEBUG_CAPTURE_ALL_STORAGE_KEY) === "true";
}

export function setStoredMathDebugCaptureAllEnabled(enabled: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(MATH_DEBUG_CAPTURE_ALL_STORAGE_KEY, enabled ? "true" : "false");
}

export function getStoredMathTouchEnabled() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(MATH_TOUCH_ENABLED_STORAGE_KEY) === "true";
}

export function setStoredMathTouchEnabled(enabled: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(MATH_TOUCH_ENABLED_STORAGE_KEY, enabled ? "true" : "false");
}

export function getStoredMathDebugBiasFoursEnabled() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(MATH_DEBUG_BIAS_FOURS_STORAGE_KEY) === "true";
}

export function setStoredMathDebugBiasFoursEnabled(enabled: boolean) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(MATH_DEBUG_BIAS_FOURS_STORAGE_KEY, enabled ? "true" : "false");
}

export function getStoredMathDebugCaptureRunLength() {
  if (typeof window === "undefined") {
    return DEFAULT_MATH_DEBUG_CAPTURE_RUN_LENGTH;
  }

  const rawValue = Number(window.localStorage.getItem(MATH_DEBUG_CAPTURE_RUN_LENGTH_STORAGE_KEY));
  return ALLOWED_MATH_DEBUG_CAPTURE_RUN_LENGTHS.has(rawValue)
    ? rawValue
    : DEFAULT_MATH_DEBUG_CAPTURE_RUN_LENGTH;
}

export function setStoredMathDebugCaptureRunLength(length: number) {
  if (typeof window === "undefined") {
    return;
  }

  const normalizedLength = ALLOWED_MATH_DEBUG_CAPTURE_RUN_LENGTHS.has(length)
    ? length
    : DEFAULT_MATH_DEBUG_CAPTURE_RUN_LENGTH;

  window.localStorage.setItem(
    MATH_DEBUG_CAPTURE_RUN_LENGTH_STORAGE_KEY,
    String(normalizedLength)
  );
}
