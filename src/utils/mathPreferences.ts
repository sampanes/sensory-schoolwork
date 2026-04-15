import {
  DEFAULT_MATH_PROBLEM_CONFIG,
  type MathProblemConfig,
} from "../apps/math/mathProblems";

export const MATH_PROBLEM_CONFIG_STORAGE_KEY = "math.problemConfig";
export type MathOperandKey = "operandA" | "operandB";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function normalizeRange(min: unknown, max: unknown, fallbackMin: number, fallbackMax: number) {
  const safeMin = typeof min === "number" ? Math.floor(min) : fallbackMin;
  const safeMax = typeof max === "number" ? Math.floor(max) : fallbackMax;
  const boundedMin = clamp(safeMin, 0, 100);
  const boundedMax = clamp(safeMax, 0, 100);

  return {
    min: Math.min(boundedMin, boundedMax),
    max: Math.max(boundedMin, boundedMax),
  };
}

function normalizeDigits(input: unknown) {
  if (!Array.isArray(input)) {
    return [];
  }

  const filteredDigits = input
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 0 && value <= 9)
    .sort((left, right) => left - right);

  return [...new Set(filteredDigits)];
}

function legacyDigitsToRange(digits: number[]) {
  if (digits.length === 0) {
    return null;
  }

  return {
    min: digits[0],
    max: digits[digits.length - 1],
  };
}

export function normalizeMathProblemConfig(input: Partial<MathProblemConfig> | null | undefined): MathProblemConfig {
  const legacyAdditionDigits = normalizeDigits((input as { additionDigits?: unknown } | null | undefined)?.additionDigits);
  const legacySubtractionDigits = normalizeDigits((input as { subtractionDigits?: unknown } | null | undefined)?.subtractionDigits);
  const legacyMaxNumber = typeof (input as { maxNumber?: unknown } | null | undefined)?.maxNumber === "number"
    ? clamp(Math.floor((input as { maxNumber: number }).maxNumber), 0, 100)
    : null;

  const legacyOperandA = legacyDigitsToRange(legacyAdditionDigits);
  const legacyOperandB = legacyDigitsToRange(legacySubtractionDigits);

  const operandARange = normalizeRange(
    input?.operandAMin,
    input?.operandAMax,
    legacyOperandA?.min ?? DEFAULT_MATH_PROBLEM_CONFIG.operandAMin,
    legacyMaxNumber ?? legacyOperandA?.max ?? DEFAULT_MATH_PROBLEM_CONFIG.operandAMax
  );

  const operandBRange = normalizeRange(
    input?.operandBMin,
    input?.operandBMax,
    legacyOperandB?.min ?? DEFAULT_MATH_PROBLEM_CONFIG.operandBMin,
    legacyOperandB?.max ?? DEFAULT_MATH_PROBLEM_CONFIG.operandBMax
  );

  return {
    operandAMin: operandARange.min,
    operandAMax: operandARange.max,
    operandBMin: operandBRange.min,
    operandBMax: operandBRange.max,
    includeAddition:
      typeof input?.includeAddition === "boolean"
        ? input.includeAddition
        : legacyAdditionDigits.length > 0 || legacySubtractionDigits.length === 0,
    includeSubtraction:
      typeof input?.includeSubtraction === "boolean"
        ? input.includeSubtraction
        : legacySubtractionDigits.length > 0 || legacyAdditionDigits.length === 0,
    problemCount:
      typeof input?.problemCount === "number" && input.problemCount > 0
        ? Math.min(Math.floor(input.problemCount), 30)
        : DEFAULT_MATH_PROBLEM_CONFIG.problemCount,
  };
}

export function getStoredMathProblemConfig() {
  if (typeof window === "undefined") {
    return DEFAULT_MATH_PROBLEM_CONFIG;
  }

  const raw = window.localStorage.getItem(MATH_PROBLEM_CONFIG_STORAGE_KEY);
  if (!raw) {
    return DEFAULT_MATH_PROBLEM_CONFIG;
  }

  try {
    return normalizeMathProblemConfig(JSON.parse(raw) as Partial<MathProblemConfig>);
  } catch {
    return DEFAULT_MATH_PROBLEM_CONFIG;
  }
}

export function setStoredMathProblemConfig(config: MathProblemConfig) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    MATH_PROBLEM_CONFIG_STORAGE_KEY,
    JSON.stringify(normalizeMathProblemConfig(config))
  );
}
