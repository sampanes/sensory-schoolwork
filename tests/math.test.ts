import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_MATH_PROBLEM_CONFIG, generateMathProblems, type MathProblem, type MathProblemConfig } from "../src/apps/math/mathProblems";
import { normalizeMathProblemConfig } from "../src/utils/mathPreferences";

function assertSound(problems: MathProblem[], config: MathProblemConfig) {
  const ids = problems.map((problem) => problem.id);
  assert.equal(new Set(ids).size, ids.length, "a problem repeats within one round");
  for (const problem of problems) {
    const expected = problem.operator === "+" ? problem.top + problem.bottom : problem.top - problem.bottom;
    assert.equal(problem.answer, String(expected), problem.prompt);
    assert.ok(expected >= 0, `negative answer: ${problem.prompt}`);
    assert.ok(problem.top >= config.operandAMin && problem.top <= config.operandAMax, `top out of range: ${problem.prompt}`);
    assert.ok(problem.bottom >= config.operandBMin && problem.bottom <= config.operandBMax, `bottom out of range: ${problem.prompt}`);
    assert.equal(problem.prompt, `${problem.top} ${problem.operator} ${problem.bottom} = ?`);
  }
}

test("the default round is twelve sound, distinct, in-range problems", () => {
  for (let round = 0; round < 50; round += 1) {
    const problems = generateMathProblems(DEFAULT_MATH_PROBLEM_CONFIG);
    assert.equal(problems.length, DEFAULT_MATH_PROBLEM_CONFIG.problemCount);
    assertSound(problems, DEFAULT_MATH_PROBLEM_CONFIG);
  }
});

test("addition only and subtraction only are honored", () => {
  const plus = { ...DEFAULT_MATH_PROBLEM_CONFIG, includeSubtraction: false };
  assert.ok(generateMathProblems(plus).every((problem) => problem.operator === "+"));
  const minus = { ...DEFAULT_MATH_PROBLEM_CONFIG, includeAddition: false };
  assert.ok(generateMathProblems(minus).every((problem) => problem.operator === "-"));
});

test("a tiny range gives every problem it has, once, instead of hanging", () => {
  const tiny: MathProblemConfig = {
    operandAMin: 0,
    operandAMax: 1,
    operandBMin: 0,
    operandBMax: 1,
    includeAddition: true,
    includeSubtraction: true,
    problemCount: 30,
  };
  const problems = generateMathProblems(tiny);
  // 4 additions, plus 3 subtractions (1-1, 1-0, 0-0) that do not go negative.
  assert.equal(problems.length, 7);
  assertSound(problems, tiny);
});

test("with both operations off, a round still comes from the defaults", () => {
  const none = { ...DEFAULT_MATH_PROBLEM_CONFIG, includeAddition: false, includeSubtraction: false };
  const problems = generateMathProblems(none);
  assert.equal(problems.length, DEFAULT_MATH_PROBLEM_CONFIG.problemCount);
  assertSound(problems, DEFAULT_MATH_PROBLEM_CONFIG);
});

test("preferred answer digits never break a round", () => {
  const problems = generateMathProblems(DEFAULT_MATH_PROBLEM_CONFIG, { preferredAnswerDigits: [4] });
  assert.equal(problems.length, DEFAULT_MATH_PROBLEM_CONFIG.problemCount);
  assertSound(problems, DEFAULT_MATH_PROBLEM_CONFIG);
});

test("saved math settings are normalized: swapped ranges, clamps, round length cap", () => {
  const normalized = normalizeMathProblemConfig({ operandAMin: 30, operandAMax: 5, operandBMin: -4, operandBMax: 500, problemCount: 99 });
  assert.equal(normalized.operandAMin, 5);
  assert.equal(normalized.operandAMax, 30);
  assert.equal(normalized.operandBMin, 0);
  assert.equal(normalized.operandBMax, 100);
  assert.equal(normalized.problemCount, 30);

  assert.deepEqual(normalizeMathProblemConfig(null), DEFAULT_MATH_PROBLEM_CONFIG);
  assert.deepEqual(normalizeMathProblemConfig({}), DEFAULT_MATH_PROBLEM_CONFIG);
});
