import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  getInkPlacement,
  loadHandwritingModel,
  recognizeCanvas,
} from "./handwritingModel";
import { SPELLING_WORDS } from "./spellingWords";
import { generateTemplateSentence } from "./sentenceGen/templates";
import WritingCanvas, { type WritingCanvasHandle } from "../../components/WritingCanvas";
import { cn } from "../../utils/cn";
import { getPreferredSpellingVoice } from "../../utils/speechPreferences";
import { getStoredSpellingCustomListEnabled, getStoredSpellingCustomListText, parseSpellingCustomList } from "../../utils/spellingPreferences";

type FeedbackState = "idle" | "success" | "wrong" | "sloppy" | "word";

type PlaylistWord = {
  word: string;
  sentence: string;
  originalIndex: number;
};

const CONFIDENCE_THRESHOLD = 0.35;
const MARGIN_THRESHOLD = 0.05;
// TODO: bug found by a tester — a single dot can sometimes pass MIN_INK_RATIO
// and the model still recognizes it as 's' (and a few other letters) with
// enough confidence to auto-advance. Need a stricter ink-shape check (stroke
// length, bounding-box aspect ratio, or required minimum stroke count) before
// running the recognizer.
const MIN_INK_RATIO = 0.0005;

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function buildPlaylist(): PlaylistWord[] {
  const customWords = parseSpellingCustomList(getStoredSpellingCustomListText());
  const baseWords = customWords.length > 0 ? customWords : [...SPELLING_WORDS];
  const playlist: PlaylistWord[] = baseWords.map((entry, originalIndex) => ({
    word: entry.word,
    sentence:
      entry.sentence && entry.sentence.trim().length > 0
        ? entry.sentence
        : generateTemplateSentence(entry.word),
    originalIndex,
  }));

  for (let i = playlist.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [playlist[i], playlist[j]] = [playlist[j], playlist[i]];
  }

  return playlist;
}

export default function App() {
  const [modelReady, setModelReady] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [wordIndex, setWordIndex] = useState(0);
  const [letterIndex, setLetterIndex] = useState(0);
  const [feedbackState, setFeedbackState] = useState<FeedbackState>("idle");
  const [feedbackText, setFeedbackText] = useState(
    "Tap play, then write the next letter."
  );
  const [isFinished, setIsFinished] = useState(false);
  const [penOnly, setPenOnly] = useState(false);

  const modelRef = useRef<Awaited<ReturnType<typeof loadHandwritingModel>> | null>(null);
  const canvasHandleRef = useRef<WritingCanvasHandle | null>(null);
  const analysisTimerRef = useRef<number | null>(null);
  const advanceTimerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastSpokenAtRef = useRef(0);
  const userUnlockedAudioRef = useRef(false);
  const [activeWords, setActiveWords] = useState<PlaylistWord[]>(buildPlaylist);
  const totalLetters = useMemo(
    () => activeWords.reduce((total, entry) => total + entry.word.length, 0),
    [activeWords]
  );

  const currentWordEntry = activeWords[wordIndex] ?? activeWords[activeWords.length - 1];
  const currentWord = currentWordEntry.word;
  const currentSentence = currentWordEntry.sentence ?? "";
  const currentLetter = currentWord[letterIndex]?.toUpperCase() ?? "";

  const solvedLetters = useMemo(() => {
    if (isFinished) {
      return totalLetters;
    }

    return activeWords.slice(0, wordIndex).reduce((total, entry) => total + entry.word.length, 0) + letterIndex;
  }, [activeWords, isFinished, letterIndex, totalLetters, wordIndex]);

  const progressValue = totalLetters > 0 ? Math.round((solvedLetters / totalLetters) * 100) : 0;

  const completedOriginalIndices = useMemo(
    () => new Set(activeWords.slice(0, wordIndex).map((entry) => entry.originalIndex)),
    [activeWords, wordIndex]
  );
  const currentOriginalIndex = isFinished ? -1 : currentWordEntry.originalIndex;

  const clearCanvas = useCallback(() => {
    canvasHandleRef.current?.clear();
  }, []);

  const ensureAudioContext = useCallback(async () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }

    if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }

    userUnlockedAudioRef.current = true;
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
    void playTone([
      { at: 0, duration: 0.11, frequency: 784, gain: 0.04, type: "triangle" },
      { at: 0.09, duration: 0.16, frequency: 1175, gain: 0.05, type: "triangle" },
    ]);
  }, [playTone]);

  const playErrorSound = useCallback(
    (kind: "wrong" | "sloppy") => {
      if (navigator.vibrate) {
        navigator.vibrate(kind === "wrong" ? [36, 28, 42] : [18, 20, 18]);
      }

      void playTone([
        {
          at: 0,
          duration: kind === "wrong" ? 0.14 : 0.1,
          frequency: kind === "wrong" ? 180 : 150,
          gain: 0.04,
          type: "sawtooth",
        },
        {
          at: 0.08,
          duration: kind === "wrong" ? 0.14 : 0.1,
          frequency: kind === "wrong" ? 140 : 110,
          gain: 0.025,
          type: "square",
        },
      ]);
    },
    [playTone]
  );

  const speakText = useCallback((text: string, force = false) => {
    if (!("speechSynthesis" in window)) {
      setFeedbackText("Your browser cannot speak out loud here, but you can still test letters.");
      return;
    }

    const now = Date.now();
    const synthesis = window.speechSynthesis;

    if (!force) {
      if (synthesis.speaking) {
        return;
      }

      if (now - lastSpokenAtRef.current < 1200) {
        return;
      }
    } else if (synthesis.speaking) {
      synthesis.cancel();
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.8;
    utterance.pitch = 1.05;
    utterance.volume = 1;

    const preferredVoice = getPreferredSpellingVoice();
    if (preferredVoice) {
      utterance.voice = preferredVoice;
      utterance.lang = preferredVoice.lang;
    }

    lastSpokenAtRef.current = now;
    synthesis.speak(utterance);
  }, []);

  const cancelTimers = useCallback(() => {
    if (analysisTimerRef.current) {
      window.clearTimeout(analysisTimerRef.current);
      analysisTimerRef.current = null;
    }

    if (advanceTimerRef.current) {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }
  }, []);

  const acceptLetter = useCallback(
    (successMessage: string) => {
      const nextLetterIndex = letterIndex + 1;

      setFeedbackState("success");
      setFeedbackText(successMessage);
      setLetterIndex(nextLetterIndex);
      playSuccessSound();
      clearCanvas();

      if (navigator.vibrate) {
        navigator.vibrate(18);
      }

      if (nextLetterIndex >= currentWord.length) {
        setFeedbackState("word");
        setFeedbackText(`Great job! ${currentWord.toUpperCase()} is complete.`);

        advanceTimerRef.current = window.setTimeout(() => {
          const nextWordIndex = wordIndex + 1;

          if (nextWordIndex >= activeWords.length) {
            setIsFinished(true);
            setFeedbackState("success");
            setFeedbackText(`You finished all ${activeWords.length} words. Play again anytime.`);
            return;
          }

          setWordIndex(nextWordIndex);
          setLetterIndex(0);
          setFeedbackState("idle");
          setFeedbackText("Fresh word. Tap play, then write the first letter.");
          clearCanvas();

          if (userUnlockedAudioRef.current) {
            window.setTimeout(() => speakText(activeWords[nextWordIndex]?.word ?? "", true), 280);
          }
        }, 1100);
      }
    },
    [activeWords, clearCanvas, currentWord, letterIndex, playSuccessSound, speakText, wordIndex]
  );

  const analyzeDrawing = useCallback(async () => {
    if (isFinished || feedbackState === "word") {
      return;
    }

    const canvas = canvasHandleRef.current?.getCanvas() ?? null;
    if (!canvas) {
      setFeedbackText("The handwriting brain is still waking up. Give it one more second.");
      return;
    }

    if (currentLetter === "'") {
      const placement = getInkPlacement(canvas);

      if (!placement.hasInk || placement.inkRatio < MIN_INK_RATIO) {
        setFeedbackState("sloppy");
        setFeedbackText("Make a small mark up high for the apostrophe.");
        playErrorSound("sloppy");
        clearCanvas();
        return;
      }

      if (placement.centroidYRatio > 0.45) {
        setFeedbackState("sloppy");
        setFeedbackText("The apostrophe goes up high, near the tops of the letters.");
        playErrorSound("sloppy");
        clearCanvas();
        return;
      }

      acceptLetter("Nice! That's the apostrophe.");
      return;
    }

    if (!modelRef.current) {
      setFeedbackText("The handwriting brain is still waking up. Give it one more second.");
      return;
    }

    const result = await recognizeCanvas(modelRef.current, canvas);

    if (!result.hasInk || result.inkRatio < MIN_INK_RATIO) {
      setFeedbackState("sloppy");
      setFeedbackText("Too little ink to read. Make the letter larger and darker.");
      playErrorSound("sloppy");
      clearCanvas();
      return;
    }

    const isConfident = result.confidence >= CONFIDENCE_THRESHOLD && result.margin >= MARGIN_THRESHOLD;
    const guessedLetter = result.guess ?? "?";

    if (isConfident && guessedLetter === currentLetter) {
      acceptLetter(`Nice! ${guessedLetter} is correct.`);
      return;
    }

    if (!isConfident) {
      setFeedbackState("sloppy");
      setFeedbackText(`Messy read. Best guess: ${guessedLetter} at ${percent(result.confidence)}.`);
      playErrorSound("sloppy");
      clearCanvas();
      return;
    }

    setFeedbackState("wrong");
    setFeedbackText(`That looked like ${guessedLetter}, but that is not the next letter.`);
    playErrorSound("wrong");
    clearCanvas();
  }, [acceptLetter, clearCanvas, currentLetter, feedbackState, isFinished, playErrorSound]);

  const scheduleAnalysis = useCallback(() => {
    if (analysisTimerRef.current) {
      window.clearTimeout(analysisTimerRef.current);
    }

    analysisTimerRef.current = window.setTimeout(() => {
      void analyzeDrawing();
    }, 450);
  }, [analyzeDrawing]);

  useEffect(() => {
    let active = true;

    loadHandwritingModel()
      .then((model) => {
        if (!active) {
          return;
        }

        modelRef.current = model;
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

  useEffect(() => {
    return () => {
      cancelTimers();
      window.speechSynthesis?.cancel();
      audioContextRef.current?.close().catch(() => undefined);
    };
  }, [cancelTimers]);

  const handleCanvasStrokeStart = useCallback(() => {
    void ensureAudioContext();
    if (analysisTimerRef.current) {
      window.clearTimeout(analysisTimerRef.current);
      analysisTimerRef.current = null;
    }
    setFeedbackState("idle");
  }, [ensureAudioContext]);

  const restart = () => {
    cancelTimers();
    setActiveWords(buildPlaylist());
    setWordIndex(0);
    setLetterIndex(0);
    setIsFinished(false);
    setFeedbackState("idle");
    setFeedbackText("Fresh shuffle. Tap play, then write the next letter.");
    clearCanvas();
  };

  const statusClasses: Record<FeedbackState, string> = {
    idle: "border-slate-200 bg-white text-slate-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    wrong: "border-rose-200 bg-rose-50 text-rose-800",
    sloppy: "border-amber-200 bg-amber-50 text-amber-900",
    word: "border-violet-200 bg-violet-50 text-violet-900",
  };

  return (
    <div
      className="h-[100svh] overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(167,139,250,0.22),_transparent_35%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_48%,_#f8fafc_100%)] text-slate-900"
      style={{ touchAction: penOnly ? "none" : "manipulation" }}
    >
      <div className="mx-auto flex h-full w-full max-w-md flex-col gap-3 px-3 py-3 sm:max-w-lg sm:px-4">
        <nav className="touch-auto flex items-center justify-between gap-3 text-sm font-semibold">
          <Link to="/" className="text-violet-800 underline-offset-2 hover:underline">
            Home
          </Link>
          <div className="min-w-0 flex-1">
            <div className="h-2 overflow-hidden rounded-full bg-white/70">
              <div
                className="h-full rounded-full bg-gradient-to-r from-fuchsia-500 via-violet-500 to-indigo-500 transition-[width] duration-500"
                style={{ width: `${progressValue}%` }}
              />
            </div>
          </div>
          <Link to="/configurations" className="text-slate-600 underline-offset-2 hover:text-slate-800 hover:underline">
            Config
          </Link>
        </nav>

        <section className="rounded-[1.6rem] border border-white/70 bg-white/90 p-3 shadow-[0_20px_60px_-45px_rgba(76,29,149,0.55)]">
          <div className="touch-auto flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                void ensureAudioContext();
                speakText(currentWord);
              }}
              className="group relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-300"
              aria-label="Play the current word"
            >
              <span className="absolute inset-0 rounded-full bg-violet-300/45 blur-xl transition duration-300 group-hover:scale-110" />
              <span className="absolute inset-1 rounded-full border border-white/80 bg-white/40 backdrop-blur-sm" />
              <span className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 via-violet-500 to-indigo-600 text-white shadow-[0_18px_45px_-18px_rgba(109,40,217,0.9)] transition duration-200 group-active:scale-95">
                <svg viewBox="0 0 24 24" className="ml-1 h-8 w-8 fill-current" aria-hidden="true">
                  <path d="M8 6.5c0-1.2 1.32-1.93 2.34-1.3l8.65 5.5a1.54 1.54 0 0 1 0 2.6l-8.65 5.5A1.53 1.53 0 0 1 8 17.5v-11Z" />
                </svg>
              </span>
            </button>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-500">
                <span>{wordIndex + 1}/{activeWords.length}</span>
                <span>{Math.max(letterIndex, 0)}/{currentWord.length}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Pack progress">
                {activeWords.map((_, originalIdx) => {
                  const completed = isFinished || completedOriginalIndices.has(originalIdx);
                  const isCurrent = originalIdx === currentOriginalIndex;
                  return (
                    <span
                      key={originalIdx}
                      className={cn(
                        "h-2 w-2 rounded-full transition-colors",
                        completed
                          ? "bg-violet-500"
                          : isCurrent
                            ? "bg-violet-200 ring-2 ring-violet-400"
                            : "bg-slate-200"
                      )}
                    />
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {currentWord.split("").map((letter, index) => {
                  const revealed = index < letterIndex;
                  const active = index === letterIndex && !isFinished;

                  return (
                    <div
                      key={`${letter}-${index}`}
                      className={[
                        "flex h-10 w-9 items-center justify-center rounded-xl border text-base font-black uppercase transition",
                        revealed
                          ? "border-slate-900 bg-slate-900 text-white"
                          : active
                            ? "border-violet-300 bg-violet-50 text-violet-500"
                            : "border-slate-200 bg-slate-50 text-slate-300",
                      ].join(" ")}
                    >
                      {revealed ? letter : "•"}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="touch-auto mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                if (!currentSentence) {
                  setFeedbackState("idle");
                  setFeedbackText("No sentence was added for this word.");
                  return;
                }

                void ensureAudioContext();
                speakText(currentSentence, true);
              }}
              className={cn(
                "flex-1 rounded-2xl border px-3 py-2 text-sm font-bold transition",
                currentSentence
                  ? "border-violet-200 bg-violet-50 text-violet-700 hover:border-violet-300 hover:bg-violet-100"
                  : "border-slate-200 bg-slate-100 text-slate-400"
              )}
              disabled={!currentSentence}
            >
              Sentence
            </button>
            <button
              type="button"
              onClick={() => setPenOnly((prev) => !prev)}
              className={cn(
                "rounded-2xl border px-3 py-2 text-sm font-bold transition",
                penOnly
                  ? "border-violet-300 bg-violet-50 text-violet-700 hover:bg-violet-100"
                  : "border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200"
              )}
            >
              {penOnly ? "Pen only" : "Touch on"}
            </button>
          </div>

          <div className={`mt-3 rounded-2xl border px-3 py-2 text-sm font-medium ${statusClasses[feedbackState]}`}>
            {feedbackText}
          </div>

          {modelError ? (
            <div className="mt-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800">
              Model error: {modelError}
            </div>
          ) : null}

          {!modelReady && !modelError ? (
            <div className="mt-2 text-xs font-semibold text-slate-500">Loading handwriting model...</div>
          ) : null}
        </section>

        <section className="flex min-h-0 flex-1 flex-col rounded-[1.6rem] border border-white/70 bg-white/90 p-3 shadow-[0_20px_60px_-45px_rgba(15,23,42,0.35)]">
          <div className="relative min-h-0 flex-1 overflow-hidden rounded-[1.4rem] border border-slate-200 bg-gradient-to-b from-white to-slate-50">
            <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 shadow-sm">
              Write here
            </div>
            <div className="h-full min-h-[220px] w-full">
              <WritingCanvas
                ref={canvasHandleRef}
                penOnly={penOnly}
                disabled={isFinished || feedbackState === "word"}
                guideStyle="primary-lines"
                minLineWidth={5}
                maxLineWidth={10}
                lineWidthFraction={0.025}
                onStrokeStart={handleCanvasStrokeStart}
                onStrokeEnd={scheduleAnalysis}
                ariaLabel="Handwriting canvas"
              />
            </div>
          </div>

          <div className="touch-auto mt-3 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => {
                clearCanvas();
                setFeedbackState("idle");
                setFeedbackText("Canvas cleared. Try that same letter again.");
              }}
              className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                void ensureAudioContext();
                void analyzeDrawing();
              }}
              className="rounded-2xl border border-violet-200 bg-violet-50 px-3 py-2.5 text-sm font-bold text-violet-700 transition hover:border-violet-300 hover:bg-violet-100"
            >
              Check
            </button>
            <button
              type="button"
              onClick={restart}
              className="rounded-2xl border border-slate-900 bg-slate-900 px-3 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800"
            >
              Restart
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
