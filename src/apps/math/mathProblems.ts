export type MathDifficulty = "easy" | "medium" | "hard";
export type MathCategory = "addition" | "subtraction";

export type MathProblem = {
  id: string;
  top: number;
  bottom: number;
  operator: "+" | "-";
  prompt: string;
  answer: string;
  difficulty: MathDifficulty;
  category: MathCategory;
};

export type MathProblemConfig = {
  operandAMin: number;
  operandAMax: number;
  operandBMin: number;
  operandBMax: number;
  includeAddition: boolean;
  includeSubtraction: boolean;
  problemCount: number;
};

export type MathProblemGenerationOptions = {
  preferredAnswerDigits?: number[];
};

export const DEFAULT_MATH_PROBLEM_CONFIG: MathProblemConfig = {
  operandAMin: 0,
  operandAMax: 20,
  operandBMin: 0,
  operandBMax: 10,
  includeAddition: true,
  includeSubtraction: true,
  problemCount: 12,
};

function getPreferredDigitScore(problem: MathProblem, preferredAnswerDigits: Set<number>) {
  const answerDigits = problem.answer.split("").map((digit) => Number(digit));
  return answerDigits.some((digit) => preferredAnswerDigits.has(digit)) ? 1 : 0;
}

function buildNumberRange(min: number, max: number) {
  const values: number[] = [];

  for (let value = min; value <= max; value += 1) {
    values.push(value);
  }

  return values;
}

function getDifficulty(top: number, bottom: number, answer: number): MathDifficulty {
  const multiDigitCount = [top, bottom, answer].filter((value) => value.toString().length > 1).length;

  if (multiDigitCount === 0) {
    return "easy";
  }

  if (multiDigitCount === 1) {
    return "medium";
  }

  return "hard";
}

function buildProblem(category: MathCategory, top: number, bottom: number, answer: number): MathProblem {
  const operator = category === "addition" ? "+" : "-";

  return {
    id: `${category}-${top}-${operator}-${bottom}-${answer}`,
    top,
    bottom,
    operator,
    prompt: `${top} ${operator} ${bottom} = ?`,
    answer: answer.toString(),
    difficulty: getDifficulty(top, bottom, answer),
    category,
  };
}

function buildAdditionProblems(config: MathProblemConfig) {
  const topNumbers = buildNumberRange(config.operandAMin, config.operandAMax);
  const bottomNumbers = buildNumberRange(config.operandBMin, config.operandBMax);
  const problems: MathProblem[] = [];

  for (const top of topNumbers) {
    for (const bottom of bottomNumbers) {
      problems.push(buildProblem("addition", top, bottom, top + bottom));
    }
  }

  return problems;
}

function buildSubtractionProblems(config: MathProblemConfig) {
  const topNumbers = buildNumberRange(config.operandAMin, config.operandAMax);
  const bottomNumbers = buildNumberRange(config.operandBMin, config.operandBMax);
  const problems: MathProblem[] = [];

  for (const top of topNumbers) {
    for (const bottom of bottomNumbers) {
      if (top < bottom) {
        continue;
      }

      problems.push(buildProblem("subtraction", top, bottom, top - bottom));
    }
  }

  return problems;
}

function shuffle<T>(items: T[]) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const current = copy[index];
    copy[index] = copy[swapIndex];
    copy[swapIndex] = current;
  }

  return copy;
}

export function generateMathProblems(config: MathProblemConfig, options: MathProblemGenerationOptions = {}) {
  const additionProblems =
    config.includeAddition
      ? buildAdditionProblems(config)
      : [];
  const subtractionProblems =
    config.includeSubtraction
      ? buildSubtractionProblems(config)
      : [];
  const allProblems = [...additionProblems, ...subtractionProblems];

  if (allProblems.length === 0) {
    return shuffle([
      ...buildAdditionProblems(DEFAULT_MATH_PROBLEM_CONFIG),
      ...buildSubtractionProblems(DEFAULT_MATH_PROBLEM_CONFIG),
    ]).slice(0, DEFAULT_MATH_PROBLEM_CONFIG.problemCount);
  }

  const preferredAnswerDigits = new Set(options.preferredAnswerDigits ?? []);

  // Group by last digit of answer to ensure a balanced distribution of 0-9
  const buckets: Record<string, MathProblem[]> = {};
  for (const p of allProblems) {
    const lastDigit = p.answer[p.answer.length - 1];
    if (!buckets[lastDigit]) buckets[lastDigit] = [];
    buckets[lastDigit].push(p);
  }

  const selected: MathProblem[] = [];
  const digitKeys = shuffle(Object.keys(buckets));
  let bucketIndex = 0;

  while (selected.length < config.problemCount && selected.length < allProblems.length) {
    const key = digitKeys[bucketIndex % digitKeys.length];
    const bucket = buckets[key];
    if (bucket && bucket.length > 0) {
      const weightedBucket = preferredAnswerDigits.size > 0
        ? [...bucket].sort(
            (first, second) =>
              getPreferredDigitScore(second, preferredAnswerDigits) -
              getPreferredDigitScore(first, preferredAnswerDigits)
          )
        : bucket;
      const preferredSliceSize = preferredAnswerDigits.size > 0 ? Math.min(4, weightedBucket.length) : weightedBucket.length;
      const pIndex = Math.floor(Math.random() * preferredSliceSize);
      const selectedProblem = weightedBucket[pIndex];
      selected.push(selectedProblem);
      const originalIndex = bucket.findIndex((problem) => problem.id === selectedProblem.id);
      if (originalIndex >= 0) {
        bucket.splice(originalIndex, 1);
      }
    }
    bucketIndex += 1;
  }

  return shuffle(selected);
}
