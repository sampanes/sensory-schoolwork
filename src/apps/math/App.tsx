import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type * as tf from "@tensorflow/tfjs";
import {
  canvasHasInk,
  type DigitModel,
  getLoadedHandwritingModelInfo,
  loadHandwritingModel,
  recognizeCanvas,
  type LoadedModelInfo,
  type RecognitionResult,
} from "./handwritingModel";
import { saveDebugEntry } from "./debugSaver";
import { appendDebugSessionEntry, clearDebugSession, exportDebugSessionBundle, getDebugSessionCount } from "./debugSession";
import { generateMathProblems } from "./mathProblems";
import { cn } from "../../utils/cn";
import WritingCanvas, { type WritingCanvasHandle } from "../../components/WritingCanvas";
import {
  getStoredMathDebugBiasFoursEnabled,
  getStoredMathDebugCaptureAllEnabled,
  getStoredMathDebugCaptureRunLength,
  getStoredMathDebugEnabled,
  getStoredMathTouchEnabled,
  setStoredMathTouchEnabled,
} from "../../utils/speechPreferences";
import { getStoredMathProblemConfig } from "../../utils/mathPreferences";

type FeedbackState = "idle" | "success" | "wrong" | "retry" | "done";

type SlotName = "left" | "right";

type DebugSlotResult = {
  expected: string | null;
  hasInk: boolean;
  result: RecognitionResult | null;
};

type SlotEvaluation = {
  name: SlotName;
  expected: string | null;
  hasInk: boolean;
  recognition: RecognitionResult | null;
};

const MIN_INK_RATIO = 0.0005;
const LOW_CONFIDENCE_THRESHOLD = 0.35;
const RUNNER_UP_MARGIN_THRESHOLD = 0.20;
const EXPECTED_FOUR_OPEN_SHAPE_CONFIDENCE_MAX = 0.10;
const EXPECTED_RAW_TOPOLOGY_OVERRIDE_SCORE_MIN = 0.85;

function parsePrompt(prompt: string) {
  const match = prompt.match(/^\s*(\d+)\s*([+-])\s*(\d+)/);
  if (!match) {
    return { top: prompt, bottom: "", operator: "" };
  }

  return {
    top: match[1],
    operator: match[2],
    bottom: match[3],
  };
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function getExpectedAnswerSlots(answer: string): [string | null, string] {
  const digits = answer.replace(/\D/g, "");

  if (digits.length <= 1) {
    return [null, digits || "0"];
  }

  return [digits[digits.length - 2] ?? null, digits[digits.length - 1] ?? "0"];
}

function getSlotFeedbackLabel(slot: SlotName) {
  return slot === "left" ? "left box" : "right box";
}

function shouldAcceptExpectedFourOpenShape(expected: string | null, result: RecognitionResult) {
  return (
    expected === "4" &&
    result.guess === "7" &&
    result.preprocessMeta?.holeCount === 0 &&
    result.confidence <= EXPECTED_FOUR_OPEN_SHAPE_CONFIDENCE_MAX
  );
}

function getRawTopScore(result: RecognitionResult) {
  return result.allScores[0] ?? null;
}

function getRawScoreForDigit(result: RecognitionResult, digit: string | null) {
  if (!digit) {
    return null;
  }

  return result.allScores.find((score) => score.digit === digit) ?? null;
}

function shouldAcceptStrongRawTopologyOverride(expected: string | null, result: RecognitionResult) {
  const rawTop = getRawTopScore(result);
  const expectedRaw = getRawScoreForDigit(result, expected);

  return (
    expected !== null &&
    result.preprocessMeta?.topologyFiltered === true &&
    rawTop?.digit === expected &&
    expectedRaw !== null &&
    expectedRaw.score >= EXPECTED_RAW_TOPOLOGY_OVERRIDE_SCORE_MIN &&
    result.guess !== expected
  );
}

function shouldAllowTouchTarget(target: EventTarget | null) {
  return target instanceof Element && target.closest("[data-allow-touch='true']") !== null;
}

export default function App() {
  const [sessionNonce, setSessionNonce] = useState(0);
  const problems = useMemo(() => {
    const debugEnabled = getStoredMathDebugEnabled();
    const debugCaptureAllEnabled = getStoredMathDebugCaptureAllEnabled();
    const debugBiasFoursEnabled = getStoredMathDebugBiasFoursEnabled();
    const baseConfig = getStoredMathProblemConfig();
    const effectiveConfig =
      debugEnabled && debugCaptureAllEnabled
        ? {
            ...baseConfig,
            problemCount: getStoredMathDebugCaptureRunLength(),
          }
        : baseConfig;

    return generateMathProblems(effectiveConfig, {
      preferredAnswerDigits: debugEnabled && debugCaptureAllEnabled && debugBiasFoursEnabled ? [4] : [],
    });
  }, [sessionNonce]);
  const [modelReady, setModelReady] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [problemIndex, setProblemIndex] = useState(0);
  const [feedbackState, setFeedbackState] = useState<FeedbackState>("idle");
  const [feedbackText, setFeedbackText] = useState("Write one digit per box, then press Check.");
  const [isFinished, setIsFinished] = useState(false);
  const [penOnly, setPenOnly] = useState(!getStoredMathTouchEnabled());
  const [debugEnabled, setDebugEnabled] = useState(false);
  const [debugCaptureAllEnabled, setDebugCaptureAllEnabled] = useState(false);
  const [debugSessionCount, setDebugSessionCount] = useState(0);
  const [modelInfo, setModelInfo] = useState<LoadedModelInfo | null>(null);
  const [leftHasInk, setLeftHasInk] = useState(false);
  const [rightHasInk, setRightHasInk] = useState(false);
  const [debugSlotResults, setDebugSlotResults] = useState<Record<SlotName, DebugSlotResult>>({
    left: { expected: null, hasInk: false, result: null },
    right: { expected: null, hasInk: false, result: null },
  });

  const modelRef = useRef<DigitModel | null>(null);
  const leftCanvasRef = useRef<WritingCanvasHandle | null>(null);
  const rightCanvasRef = useRef<WritingCanvasHandle | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const autoCheckInFlightRef = useRef(false);

  const currentProblem = problems[problemIndex] ?? problems[problems.length - 1];
  const progressValue = isFinished ? 100 : Math.round((problemIndex / problems.length) * 100);
  const progressCount = isFinished ? problems.length : Math.min(problemIndex + 1, problems.length);
  const problemLayout = useMemo(() => parsePrompt(currentProblem.prompt), [currentProblem.prompt]);
  const expectedSlots = useMemo(() => getExpectedAnswerSlots(currentProblem.answer), [currentProblem.answer]);
  const leftShouldStayBlank = expectedSlots[0] === null;
  const idlePrompt = leftShouldStayBlank
    ? "Leave the tens box empty. Write the answer in the ones box, then press Check."
    : "Write one digit per box, then press Check.";

  const syncInkState = useCallback(() => {
    const leftCanvas = leftCanvasRef.current?.getCanvas();
    const rightCanvas = rightCanvasRef.current?.getCanvas();
    setLeftHasInk(leftCanvas ? canvasHasInk(leftCanvas) : false);
    setRightHasInk(rightCanvas ? canvasHasInk(rightCanvas) : false);
  }, []);

  const clearLeft = useCallback(() => {
    leftCanvasRef.current?.clear();
    setLeftHasInk(false);
  }, []);

  const clearRight = useCallback(() => {
    rightCanvasRef.current?.clear();
    setRightHasInk(false);
  }, []);

  const clearBoth = useCallback(() => {
    leftCanvasRef.current?.clear();
    rightCanvasRef.current?.clear();
    setLeftHasInk(false);
    setRightHasInk(false);
  }, []);

  const ensureAudioContext = useCallback(async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }

    return audioContextRef.current;
  }, []);

  const playTone = useCallback(
    async (steps: Array<{ at: number; duration: number; frequency: number; gain: number; type?: OscillatorType }>) => {
      const audioContext = await ensureAudioContext();
      const start = audioContext.currentTime + 0.01;

      steps.forEach((step) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.type = step.type ?? "sine";
        oscillator.frequency.setValueAtTime(step.frequency, start + step.at);

        gainNode.gain.setValueAtTime(0.0001, start + step.at);
        gainNode.gain.exponentialRampToValueAtTime(step.gain, start + step.at + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, start + step.at + step.duration);

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.start(start + step.at);
        oscillator.stop(start + step.at + step.duration + 0.02);
      });
    },
    [ensureAudioContext]
  );

  const playSuccessSound = useCallback(() => {
    if (navigator.vibrate) {
      navigator.vibrate(18);
    }

    void playTone([
      { at: 0, duration: 0.1, frequency: 740, gain: 0.035, type: "triangle" },
      { at: 0.08, duration: 0.15, frequency: 988, gain: 0.045, type: "triangle" },
    ]);
  }, [playTone]);

  const playCompletionSound = useCallback(() => {
    if (navigator.vibrate) {
      navigator.vibrate([24, 18, 28, 18, 36]);
    }

    void playTone([
      { at: 0, duration: 0.11, frequency: 740, gain: 0.04, type: "triangle" },
      { at: 0.1, duration: 0.12, frequency: 988, gain: 0.05, type: "triangle" },
      { at: 0.22, duration: 0.18, frequency: 1318, gain: 0.055, type: "triangle" },
    ]);
  }, [playTone]);

  const playErrorSound = useCallback(
    (kind: "wrong" | "retry") => {
      if (navigator.vibrate) {
        navigator.vibrate(kind === "wrong" ? [40, 30, 50] : [18, 18, 18]);
      }

      void playTone([
        {
          at: 0,
          duration: kind === "wrong" ? 0.14 : 0.09,
          frequency: kind === "wrong" ? 180 : 170,
          gain: 0.04,
          type: "sawtooth",
        },
        {
          at: 0.07,
          duration: kind === "wrong" ? 0.12 : 0.08,
          frequency: kind === "wrong" ? 132 : 145,
          gain: 0.022,
          type: "square",
        },
      ]);
    },
    [playTone]
  );

  const resetDebugSlotResults = useCallback(() => {
    setDebugSlotResults({
      left: { expected: expectedSlots[0], hasInk: false, result: null },
      right: { expected: expectedSlots[1], hasInk: false, result: null },
    });
  }, [expectedSlots]);

  useEffect(() => {
    setDebugEnabled(getStoredMathDebugEnabled());
    setDebugCaptureAllEnabled(getStoredMathDebugCaptureAllEnabled());
    setDebugSessionCount(getDebugSessionCount());
  }, []);

  useEffect(() => {
    resetDebugSlotResults();
  }, [resetDebugSlotResults]);

  useEffect(() => {
    if (feedbackState === "idle") {
      setFeedbackText(idlePrompt);
    }
  }, [feedbackState, idlePrompt, problemIndex]);

  useEffect(() => {
    let active = true;

    loadHandwritingModel()
      .then((model) => {
        if (!active) {
          return;
        }

        modelRef.current = model;
        setModelInfo(getLoadedHandwritingModelInfo());
        setModelReady(true);
      })
      .catch((error: unknown) => {
        if (!active) {
          return;
        }

        setModelError(error instanceof Error ? error.message : "Model failed to load.");
      });

    return () => {
      active = false;
    };
  }, []);

  const advanceToNextProblem = useCallback(() => {
    const nextIndex = problemIndex + 1;

    clearBoth();

    if (nextIndex >= problems.length) {
      setIsFinished(true);
      setFeedbackState("done");
      setFeedbackText("Round finished. Great work!");
      playCompletionSound();
      return;
    }

    setProblemIndex(nextIndex);
    setFeedbackState("success");
    setFeedbackText("Correct! Moving to the next problem.");
    playSuccessSound();
  }, [clearBoth, playCompletionSound, playSuccessSound, problemIndex, problems.length]);

  const restartRound = useCallback(() => {
    clearBoth();
    setProblemIndex(0);
    setIsFinished(false);
    setFeedbackState("idle");
    setFeedbackText("Write one digit per box, then press Check.");
    setSessionNonce((current) => current + 1);
  }, [clearBoth]);

  const bufferDebugEntry = useCallback((entry: Parameters<typeof saveDebugEntry>[0]) => {
    void appendDebugSessionEntry(entry).then((count) => {
      setDebugSessionCount(count);
    });
  }, []);

  const persistDebugEntry = useCallback((entry: Parameters<typeof saveDebugEntry>[0]) => {
    bufferDebugEntry(entry);
    void saveDebugEntry(entry);
  }, [bufferDebugEntry]);

  const evaluateCurrentAnswer = useCallback(async () => {
    if (isFinished) {
      return null;
    }

    const model = modelRef.current;
    const leftCanvas = leftCanvasRef.current?.getCanvas() ?? null;
    const rightCanvas = rightCanvasRef.current?.getCanvas() ?? null;

    if (!model || !leftCanvas || !rightCanvas) {
      return null;
    }

    const slots: Array<{ name: SlotName; canvas: HTMLCanvasElement; expected: string | null }> = [
      { name: "left", canvas: leftCanvas, expected: expectedSlots[0] },
      { name: "right", canvas: rightCanvas, expected: expectedSlots[1] },
    ];

    const nextDebugResults: Record<SlotName, DebugSlotResult> = {
      left: { expected: expectedSlots[0], hasInk: false, result: null },
      right: { expected: expectedSlots[1], hasInk: false, result: null },
    };

    const evaluations: SlotEvaluation[] = [];

    for (const slot of slots) {
      const hasInk = canvasHasInk(slot.canvas);
      let recognition: RecognitionResult | null = null;

      if (hasInk) {
        recognition = await recognizeCanvas(model, slot.canvas);
      }

      nextDebugResults[slot.name] = {
        expected: slot.expected,
        hasInk,
        result: recognition,
      };

      evaluations.push({
        name: slot.name,
        expected: slot.expected,
        hasInk,
        recognition,
      });
    }

    setDebugSlotResults(nextDebugResults);
    setLeftHasInk(evaluations[0]?.hasInk ?? false);
    setRightHasInk(evaluations[1]?.hasInk ?? false);

    return evaluations;
  }, [expectedSlots, isFinished]);

  const checkAnswer = useCallback(async () => {
    if (isFinished) {
      return;
    }

    const evaluations = await evaluateCurrentAnswer();
    if (!evaluations) {
      setFeedbackState("retry");
      setFeedbackText("The digit model is still loading. Please try again in a moment.");
      playErrorSound("retry");
      return;
    }

    for (const evaluation of evaluations) {
      const slotLabel = getSlotFeedbackLabel(evaluation.name);

      if (evaluation.expected === null) {
        if (evaluation.hasInk) {
          if (evaluation.recognition) {
            persistDebugEntry({
              timestamp: new Date(),
              expected: null,
              slotName: evaluation.name,
              outcome: "wrong",
              reason: "blank_box_has_ink",
              result: evaluation.recognition,
            });
          }

          setFeedbackState("wrong");
          setFeedbackText(`The ${slotLabel} should stay blank for this answer.`);
          playErrorSound("wrong");
          return;
        }

        continue;
      }

      if (!evaluation.hasInk) {
        setFeedbackState("retry");
        setFeedbackText(`Please write in the ${slotLabel}.`);
        playErrorSound("retry");
        return;
      }

      const result = evaluation.recognition;
      if (!result || !result.hasInk || !result.guess) {
        setFeedbackState("retry");
        setFeedbackText(`I couldn't read the ${slotLabel}. Try that one again more carefully.`);
        playErrorSound("retry");
        return;
      }

      if (result.inkRatio < MIN_INK_RATIO) {
        setFeedbackState("retry");
        setFeedbackText(`Try the ${slotLabel} again a little slower and more carefully.`);
        playErrorSound("retry");
        return;
      }

      if (result.guess !== evaluation.expected) {
        if (shouldAcceptStrongRawTopologyOverride(evaluation.expected, result)) {
          persistDebugEntry({
            timestamp: new Date(),
            expected: evaluation.expected,
            slotName: evaluation.name,
            outcome: "accepted_expected_shape",
            reason: "expected_strong_raw_topology_override",
            result,
          });
          continue;
        }

        if (shouldAcceptExpectedFourOpenShape(evaluation.expected, result)) {
          persistDebugEntry({
            timestamp: new Date(),
            expected: evaluation.expected,
            slotName: evaluation.name,
            outcome: "accepted_expected_shape",
            reason: "expected_four_open_shape_accept",
            result,
          });
          continue;
        }

        const runnerUpMatches = result.runnerUp === evaluation.expected;
        const marginIsLow = result.margin < RUNNER_UP_MARGIN_THRESHOLD;

        if (runnerUpMatches && marginIsLow) {
          persistDebugEntry({
            timestamp: new Date(),
            expected: evaluation.expected,
            slotName: evaluation.name,
            outcome: "accepted_runner_up",
            reason: "wrong_digit_runner_up_accept",
            result,
          });
          // Model was on the fence and the correct digit was runner-up â€” accept it.
        } else if (result.confidence < LOW_CONFIDENCE_THRESHOLD) {
          persistDebugEntry({
            timestamp: new Date(),
            expected: evaluation.expected,
            slotName: evaluation.name,
            outcome: "retry",
            reason: "wrong_digit_low_confidence",
            result,
          });
          setFeedbackState("retry");
          setFeedbackText(`I couldn't read the ${slotLabel} clearly. Try that one again a little slower.`);
          playErrorSound("retry");
          return;
        } else {
          persistDebugEntry({
            timestamp: new Date(),
            expected: evaluation.expected,
            slotName: evaluation.name,
            outcome: "wrong",
            reason: "wrong_digit_confident",
            result,
          });
          setFeedbackState("wrong");
          setFeedbackText(`That didn't look right in the ${slotLabel}. Try it again carefully.`);
          playErrorSound("wrong");
          return;
        }
      } else if (debugEnabled && debugCaptureAllEnabled) {
        bufferDebugEntry({
          timestamp: new Date(),
          expected: evaluation.expected,
          slotName: evaluation.name,
          outcome: "accepted_correct_top_guess",
          reason: "correct_top_guess",
          result,
        });
      }
    }

    advanceToNextProblem();
  }, [advanceToNextProblem, bufferDebugEntry, debugCaptureAllEnabled, debugEnabled, evaluateCurrentAnswer, isFinished, persistDebugEntry, playErrorSound]);

  const tryAutoAcceptAnswer = useCallback(async () => {
    if (isFinished || autoCheckInFlightRef.current) {
      return;
    }

    autoCheckInFlightRef.current = true;

    try {
      const evaluations = await evaluateCurrentAnswer();
      if (!evaluations) {
        return;
      }

      for (const evaluation of evaluations) {
        if (evaluation.expected === null) {
          if (evaluation.hasInk) {
            return;
          }

          continue;
        }

        if (!evaluation.hasInk) {
          return;
        }

        const result = evaluation.recognition;
        if (!result || !result.hasInk || !result.guess || result.inkRatio < MIN_INK_RATIO) {
          return;
        }

        if (result.guess === evaluation.expected) {
          continue;
        }

        if (shouldAcceptStrongRawTopologyOverride(evaluation.expected, result)) {
          continue;
        }

        if (shouldAcceptExpectedFourOpenShape(evaluation.expected, result)) {
          continue;
        }

        if (result.runnerUp === evaluation.expected && result.margin < RUNNER_UP_MARGIN_THRESHOLD) {
          continue;
        }

        return;
      }

      for (const evaluation of evaluations) {
        if (evaluation.expected === null || !evaluation.recognition) {
          continue;
        }

        const result = evaluation.recognition;

        if (result.guess === evaluation.expected) {
          if (debugEnabled && debugCaptureAllEnabled) {
            bufferDebugEntry({
              timestamp: new Date(),
              expected: evaluation.expected,
              slotName: evaluation.name,
              outcome: "accepted_correct_top_guess",
              reason: "correct_top_guess",
              result,
            });
          }
          continue;
        }

        if (shouldAcceptStrongRawTopologyOverride(evaluation.expected, result)) {
          persistDebugEntry({
            timestamp: new Date(),
            expected: evaluation.expected,
            slotName: evaluation.name,
            outcome: "accepted_expected_shape",
            reason: "expected_strong_raw_topology_override",
            result,
          });
          continue;
        }

        if (shouldAcceptExpectedFourOpenShape(evaluation.expected, result)) {
          persistDebugEntry({
            timestamp: new Date(),
            expected: evaluation.expected,
            slotName: evaluation.name,
            outcome: "accepted_expected_shape",
            reason: "expected_four_open_shape_accept",
            result,
          });
          continue;
        }

        if (result.runnerUp === evaluation.expected && result.margin < RUNNER_UP_MARGIN_THRESHOLD) {
          persistDebugEntry({
            timestamp: new Date(),
            expected: evaluation.expected,
            slotName: evaluation.name,
            outcome: "accepted_runner_up",
            reason: "wrong_digit_runner_up_accept",
            result,
          });
        }
      }

      advanceToNextProblem();
    } finally {
      autoCheckInFlightRef.current = false;
    }
  }, [
    advanceToNextProblem,
    bufferDebugEntry,
    debugCaptureAllEnabled,
    debugEnabled,
    evaluateCurrentAnswer,
    isFinished,
    persistDebugEntry,
  ]);

  const blockTouchWhenPenOnly = useCallback(
    (event: { preventDefault: () => void; stopPropagation: () => void; target: EventTarget | null }) => {
      if (!penOnly) {
        return;
      }

      if (shouldAllowTouchTarget(event.target)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    },
    [penOnly]
  );

  return (
    <div
      onPointerDownCapture={(event) => {
        if (event.pointerType === "touch") {
          blockTouchWhenPenOnly(event);
        }
      }}
      onPointerMoveCapture={(event) => {
        if (event.pointerType === "touch") {
          blockTouchWhenPenOnly(event);
        }
      }}
      onPointerUpCapture={(event) => {
        if (event.pointerType === "touch") {
          blockTouchWhenPenOnly(event);
        }
      }}
      onTouchStartCapture={blockTouchWhenPenOnly}
      onTouchMoveCapture={blockTouchWhenPenOnly}
      onTouchEndCapture={blockTouchWhenPenOnly}
      className={cn(
        debugEnabled || feedbackState !== "idle" ? "min-h-screen overflow-y-auto" : "h-[100svh] overflow-hidden",
        "bg-[radial-gradient(circle_at_top,_rgba(125,211,252,0.25),_transparent_38%),linear-gradient(180deg,_#f8fafc_0%,_#ecfeff_46%,_#f8fafc_100%)] text-slate-900"
      )}
      style={{ touchAction: penOnly ? "none" : "manipulation" }}
    >
      <div
        className={cn(
          "mx-auto flex w-full max-w-md flex-col gap-3 px-3 py-3 sm:max-w-lg sm:px-4",
          debugEnabled ? "min-h-screen" : "h-full"
        )}
      >
        <nav className="touch-auto flex items-center justify-between gap-3 text-sm font-semibold">
          <Link to="/" className="text-cyan-800 underline-offset-2 hover:underline">
            Home
          </Link>
          <div className="min-w-0 flex-1">
            <div className="h-2 overflow-hidden rounded-full bg-white/70">
              <div
                className="h-full rounded-full bg-gradient-to-r from-cyan-500 via-sky-500 to-indigo-500 transition-[width] duration-500"
                style={{ width: `${progressValue}%` }}
              />
            </div>
          </div>
          <Link
            to="/configurations"
            className="text-slate-600 underline-offset-2 hover:text-slate-800 hover:underline"
          >
            Config
          </Link>
        </nav>

        <section className="relative rounded-[1.6rem] border border-white/70 bg-white/90 p-2.5 shadow-[0_20px_60px_-45px_rgba(14,116,144,0.45)]">
          <div className="touch-auto absolute left-3 top-3 z-10 flex flex-col gap-2">
            <div className="w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
              {progressCount}/{problems.length}
            </div>
            {debugEnabled ? (
              <>
                <div className="w-fit rounded-full border border-cyan-100 bg-cyan-50 px-3 py-1 text-xs font-semibold capitalize text-cyan-800">
                  {currentProblem.category} * {currentProblem.difficulty}
                </div>
                <div className="w-fit rounded-full border border-amber-100 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                  Answer: {currentProblem.answer}
                </div>
              </>
            ) : null}
            <button
              type="button"
              data-allow-touch="true"
              onClick={() =>
                setPenOnly((prev) => {
                  const nextValue = !prev;
                  setStoredMathTouchEnabled(!nextValue);
                  return nextValue;
                })
              }
              className={cn(
                "rounded-2xl border px-3 py-2 text-sm font-bold transition",
                penOnly
                  ? "border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"
                  : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              )}
            >
              {penOnly ? (
                <>
                  <span className="mr-1 line-through">Touch</span>
                  <span aria-hidden="true">🔒</span>
                </>
              ) : (
                <>
                  <span className="mr-1">Touch</span>
                  <span aria-hidden="true">🔓</span>
                </>
              )}
            </button>
          </div>

          <div className="flex justify-center pt-7">
            {isFinished ? (
              <div className="math-finish-panel relative w-full overflow-hidden rounded-[1.8rem] border border-amber-200 bg-[linear-gradient(180deg,_#fff7ed_0%,_#fefce8_100%)] px-6 py-7 text-center shadow-sm">
                <div className="math-finish-spark math-finish-spark-a" aria-hidden="true" />
                <div className="math-finish-spark math-finish-spark-b" aria-hidden="true" />
                <div className="math-finish-spark math-finish-spark-c" aria-hidden="true" />
                <div className="math-finish-spark math-finish-spark-d" aria-hidden="true" />
                <div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-amber-200 bg-white/80 px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-amber-700">
                  <span aria-hidden="true">★</span>
                  Round Finished
                </div>
                <div className="mt-4 text-5xl font-black tracking-tight text-slate-950">Great job!</div>
                <div className="mt-2 text-sm font-semibold text-slate-600">
                  You finished all {problems.length} problems.
                </div>
                <div className="mt-5 flex items-center justify-center gap-2 text-3xl" aria-hidden="true">
                  <span className="math-finish-bounce" style={{ animationDelay: "0s" }}>★</span>
                  <span className="math-finish-bounce" style={{ animationDelay: "0.12s" }}>★</span>
                  <span className="math-finish-bounce" style={{ animationDelay: "0.24s" }}>★</span>
                </div>
              </div>
            ) : (
              <div className="rounded-[1.8rem] border border-slate-200 bg-white px-10 py-5 shadow-sm">
                <div className="flex justify-end text-7xl font-black tracking-tight text-slate-950">
                  <span className="min-w-[2ch] text-right">{problemLayout.top}</span>
                </div>
                <div className="mt-3 flex items-end justify-end gap-4 text-7xl font-black tracking-tight text-slate-950">
                  <span>{problemLayout.operator}</span>
                  <span className="min-w-[2ch] text-right">{problemLayout.bottom}</span>
                </div>
                <div className="mt-3 border-t-[6px] border-slate-900" />
              </div>
            )}
          </div>

          <div className="touch-auto mt-2 flex items-center gap-2">
            {!modelReady && !modelError ? (
              <span className="text-xs font-semibold text-slate-500">Loading digit model...</span>
            ) : null}
            {modelError ? <span className="text-xs font-semibold text-rose-700">{modelError}</span> : null}
          </div>

          {debugEnabled ? (
            <div className="touch-auto mt-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <div className="font-semibold text-slate-800">Mobile debug session: {debugSessionCount} captures</div>
              <div className="mt-1">{debugCaptureAllEnabled ? "accepted attempts + retries" : "retries / wrong reads only"} | {debugEnabled && debugCaptureAllEnabled && getStoredMathDebugBiasFoursEnabled() ? "prefer answers containing 4" : "normal"}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    exportDebugSessionBundle();
                  }}
                  className="rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-1.5 font-semibold text-cyan-700 transition hover:border-cyan-300 hover:bg-cyan-100"
                >
                  Export session
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDebugSessionCount(clearDebugSession());
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
                >
                  Clear session
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="flex min-h-0 flex-1 flex-col rounded-[1.6rem] border border-white/70 bg-white/90 p-3 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.35)]">
          {isFinished ? (
            <div className="touch-auto mt-1 grid gap-2">
              <button
                type="button"
                data-allow-touch="true"
                onClick={() => {
                  void ensureAudioContext();
                  restartRound();
                }}
                className="rounded-2xl border border-cyan-300 bg-cyan-50 px-4 py-3 text-sm font-black text-cyan-800 transition hover:border-cyan-400 hover:bg-cyan-100"
              >
                Play another round
              </button>
              <Link
                to="/configurations"
                data-allow-touch="true"
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-center text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Change settings
              </Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="relative min-h-0 overflow-hidden rounded-[1.4rem] border border-slate-200 bg-gradient-to-b from-white to-slate-50">
                  <button
                    type="button"
                    data-allow-touch="true"
                    onClick={clearLeft}
                    className={cn(
                      "touch-auto absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-300",
                      leftHasInk
                        ? "border-slate-300 bg-white/90 text-slate-500 opacity-100 shadow-sm hover:bg-slate-50"
                        : "pointer-events-none border-transparent text-slate-300 opacity-0"
                    )}
                    aria-label="Clear left digit"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                  <div
                    className={cn(
                      "pointer-events-none absolute left-3 top-3 z-10 rounded-full border bg-white/90 px-3 py-1 text-xs font-bold uppercase tracking-wide",
                      leftShouldStayBlank
                        ? "border-emerald-200 text-emerald-700"
                        : "border-slate-200 text-slate-500"
                    )}
                  >
                    {leftShouldStayBlank ? "Leave blank" : "Tens"}
                  </div>
                  <div className="aspect-[7/10] w-full">
                    <WritingCanvas
                      ref={leftCanvasRef}
                      penOnly={penOnly}
                      disabled={isFinished}
                      guideStyle="primary-lines"
                      minLineWidth={8}
                      maxLineWidth={20}
                      lineWidthFraction={0.05}
                      onStrokeStart={() => {
                        void ensureAudioContext();
                        setFeedbackState("idle");
                        setLeftHasInk(true);
                      }}
                      onStrokeEnd={syncInkState}
                      ariaLabel="Left answer digit canvas"
                    />
                  </div>
                </div>

                <div className="relative min-h-0 overflow-hidden rounded-[1.4rem] border border-slate-200 bg-gradient-to-b from-white to-slate-50">
                  <button
                    type="button"
                    data-allow-touch="true"
                    onClick={clearRight}
                    className={cn(
                      "touch-auto absolute right-2 top-2 z-20 flex h-8 w-8 items-center justify-center rounded-full border transition-all duration-300",
                      rightHasInk
                        ? "border-slate-300 bg-white/90 text-slate-500 opacity-100 shadow-sm hover:bg-slate-50"
                        : "pointer-events-none border-transparent text-slate-300 opacity-0"
                    )}
                    aria-label="Clear right digit"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current stroke-2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                  <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                    Ones
                  </div>
                  <div className="aspect-[7/10] w-full">
                    <WritingCanvas
                      ref={rightCanvasRef}
                      penOnly={penOnly}
                      disabled={isFinished}
                      guideStyle="primary-lines"
                      minLineWidth={8}
                      maxLineWidth={20}
                      lineWidthFraction={0.05}
                      onStrokeStart={() => {
                        void ensureAudioContext();
                        setFeedbackState("idle");
                        setRightHasInk(true);
                      }}
                      onStrokeEnd={() => {
                        syncInkState();
                        void tryAutoAcceptAnswer();
                      }}
                      ariaLabel="Right answer digit canvas"
                    />
                  </div>
                </div>
              </div>

              <div className="touch-auto mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  data-allow-touch="true"
                  onClick={() => {
                    clearBoth();
                    resetDebugSlotResults();
                    setFeedbackState("idle");
                    setFeedbackText(idlePrompt);
                  }}
                  className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  Clear both
                </button>
                <button
                  type="button"
                  data-allow-touch="true"
                  onClick={() => {
                    void ensureAudioContext();
                    void checkAnswer();
                  }}
                  className="rounded-2xl border border-cyan-200 bg-cyan-50 px-3 py-2.5 text-sm font-bold text-cyan-700 transition hover:border-cyan-300 hover:bg-cyan-100"
                >
                  Check
                </button>
              </div>
            </>
          )}

          {feedbackState !== "idle" ? (
            <div
              className={cn(
                "touch-auto mt-2 rounded-2xl border px-3 py-2 text-center text-sm font-bold transition",
                feedbackState === "success" || feedbackState === "done"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : feedbackState === "wrong"
                    ? "border-rose-200 bg-rose-50 text-rose-800"
                    : "border-amber-200 bg-amber-50 text-amber-900"
              )}
            >
              {feedbackText}
            </div>
          ) : null}

          {debugEnabled ? (
            <div className="mt-2 grid gap-2 text-xs font-mono text-slate-700 sm:grid-cols-2">
              {(["left", "right"] as const).map((slot) => {
                const info = debugSlotResults[slot];
                const expected = info.expected ?? "(blank)";
                const guess = info.expected === null && !info.hasInk ? "(blank)" : info.result?.guess ?? "(none)";
                const confidence = info.expected === null && !info.hasInk ? "100%" : info.result ? percent(info.result.confidence) : "0%";
                const margin = info.expected === null && !info.hasInk ? "100%" : info.result ? percent(info.result.margin) : "0%";
                const rawTop = info.result ? getRawTopScore(info.result) : null;

                return (
                  <div
                    key={slot}
                    className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3"
                  >
                    <div className="font-bold uppercase text-slate-500">{slot} box</div>
                    <div className="mt-1">Expected: {expected}</div>
                    <div>Has ink: {info.hasInk ? "yes" : "no"}</div>
                    <div>Guess: {guess}</div>
                    <div>Confidence: {confidence}</div>
                    <div>Raw top: {rawTop ? `${rawTop.digit} (${percent(rawTop.score)})` : "(none)"}</div>
                    <div>Runner-up: {info.result?.runnerUp ?? "(none)"}</div>
                    <div>Runner-up conf: {info.result ? percent(info.result.runnerUpConfidence) : "0%"}</div>
                    <div>Margin: {margin}</div>
                    <div>Holes: {info.result?.preprocessMeta?.holeCount ?? "â€”"}</div>
                    <div>Topo changed: {info.result?.preprocessMeta ? (info.result.preprocessMeta.topologyFiltered ? "yes" : "no") : "â€”"}</div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

