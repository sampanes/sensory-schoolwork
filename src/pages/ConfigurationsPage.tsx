import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { generateMathProblems, type MathProblemConfig } from "../apps/math/mathProblems";
import {
  getStoredMathDebugBiasFoursEnabled,
  getStoredMathDebugCaptureAllEnabled,
  getStoredMathDebugCaptureRunLength,
  getStoredMathDebugEnabled,
  getStoredSpellingVoiceURI,
  setStoredMathDebugBiasFoursEnabled,
  setStoredMathDebugCaptureAllEnabled,
  setStoredMathDebugCaptureRunLength,
  setStoredMathDebugEnabled,
  setStoredSpellingVoiceURI,
} from "../utils/speechPreferences";
import { getStoredMathProblemConfig, setStoredMathProblemConfig } from "../utils/mathPreferences";
import {
  formatSpellingCustomListEntry,
  getStoredSpellingCustomListEnabled,
  getStoredSpellingCustomListText,
  parseSpellingCustomList,
  serializeSpellingCustomList,
  setStoredSpellingCustomListEnabled,
  setStoredSpellingCustomListText,
} from "../utils/spellingPreferences";
import { cn } from "../utils/cn";

type ConfigRow = {
  app: string;
  description: string;
  defaultPath?: string;
  future: string[];
};

type RangeValue = {
  min: number;
  max: number;
};

type SliderDragState = {
  pointerId: number;
  startValue: number;
  startClientX: number;
  startClientY: number;
  trackWidth: number;
  precisionStartValue: number | null;
  precisionStartClientX: number | null;
};

type MathSectionKey = "operandA" | "operations" | "operandB" | "problemCount" | null;

const rows: ConfigRow[] = [
  {
    app: "Spelling",
    description: "Word lists, pacing, and audio options live here.",
    defaultPath: "/spelling",
    future: ["core word packs", "speech pacing", "voice practice options"],
  },
  {
    app: "A-maze-ing sentences",
    description: "Maze layout and sentence packs will be configurable once the web UI exists.",
    future: ["sentence packs", "maze size", "import JSON"],
  },
];

const OPERAND_RANGE = { min: 0, max: 100 } as const;
const PROBLEM_COUNT_RANGE = { min: 6, max: 30 } as const;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatRangeSummary(range: RangeValue) {
  return `${range.min} to ${range.max}`;
}

function formatOperatorSummary(config: MathProblemConfig) {
  if (config.includeAddition && config.includeSubtraction) {
    return "+ and -";
  }

  if (config.includeAddition) {
    return "+ only";
  }

  if (config.includeSubtraction) {
    return "- only";
  }

  return "none";
}

function CompactToggle({
  active,
  activeLabel,
  inactiveLabel,
  onClick,
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-2 text-xs font-semibold transition",
        active ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
      )}
    >
      {active ? activeLabel : inactiveLabel}
    </button>
  );
}

function SliderField({
  title,
  value,
  min,
  max,
  presets,
  onChange,
}: {
  title: string;
  value: number;
  min: number;
  max: number;
  presets: number[];
  onChange: (value: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragState, setDragState] = useState<SliderDragState | null>(null);
  const safeValue = clamp(value, min, max);
  const range = max - min;

  const toPercent = (n: number) => ((n - min) / (max - min)) * 100;

  const fromClientX = (clientX: number) => {
    const track = trackRef.current;
    if (!track) {
      return safeValue;
    }

    const rect = track.getBoundingClientRect();
    const relativeX = clamp(clientX - rect.left, 0, rect.width);
    const fraction = rect.width === 0 ? 0 : relativeX / rect.width;
    return Math.round(min + fraction * (max - min));
  };

  const getCoarseDragValue = (state: SliderDragState, clientX: number) => {
    if (state.trackWidth <= 0 || range <= 0) {
      return state.startValue;
    }

    const deltaX = clientX - state.startClientX;
    const valueDelta = (deltaX / state.trackWidth) * range;
    return Math.round(clamp(state.startValue + valueDelta, min, max));
  };

  return (
    <section className="rounded-[1.6rem] border border-zinc-200 bg-white p-5 shadow-[0_18px_50px_-40px_rgba(0,0,0,0.35)]">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-zinc-950">{title}</h3>
          <p className="mt-1 text-sm text-zinc-500">
            {min} to {max}
          </p>
          <p className="mt-1 text-xs text-zinc-400">Drag side to side. Lift up while dragging for slower control.</p>
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-3xl font-semibold tabular-nums text-zinc-950">
          {safeValue}
        </div>
      </div>

      <div
        ref={trackRef}
        className="relative mt-6 h-14 touch-none"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          const rect = event.currentTarget.getBoundingClientRect();
          setDragState({
            pointerId: event.pointerId,
            startValue: safeValue,
            startClientX: event.clientX,
            startClientY: event.clientY,
            trackWidth: rect.width,
            precisionStartValue: null,
            precisionStartClientX: null,
          });
          onChange(fromClientX(event.clientX));
        }}
        onPointerMove={(event) => {
          if (!dragState || dragState.pointerId !== event.pointerId) {
            return;
          }

          const liftedDistance = Math.max(0, dragState.startClientY - event.clientY);

          if (liftedDistance >= 28) {
            const precisionStartValue = dragState.precisionStartValue ?? getCoarseDragValue(dragState, event.clientX);
            const precisionStartClientX = dragState.precisionStartClientX ?? event.clientX;

            if (dragState.precisionStartValue === null || dragState.precisionStartClientX === null) {
              setDragState({
                ...dragState,
                precisionStartValue,
                precisionStartClientX,
              });
            }

            const precisionDelta = ((event.clientX - precisionStartClientX) / dragState.trackWidth) * range * 0.22;
            onChange(Math.round(clamp(precisionStartValue + precisionDelta, min, max)));
            return;
          }

          if (dragState.precisionStartValue !== null || dragState.precisionStartClientX !== null) {
            setDragState({
              ...dragState,
              precisionStartValue: null,
              precisionStartClientX: null,
            });
          }

          onChange(getCoarseDragValue(dragState, event.clientX));
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          setDragState(null);
        }}
        onPointerCancel={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          setDragState(null);
        }}
      >
        <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-zinc-200" />
        <div
          className="absolute left-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-zinc-950"
          style={{ width: `${toPercent(safeValue)}%` }}
        />
        <div
          className="absolute top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${toPercent(safeValue)}%` }}
        >
          <div className="flex h-full w-full items-center justify-center rounded-full border-2 border-zinc-950 bg-white shadow-sm">
            <div className="h-4 w-1 rounded-full bg-zinc-950" />
          </div>
        </div>
        <div className="absolute left-0 top-full mt-2 text-xs text-zinc-400">{min}</div>
        <div className="absolute right-0 top-full mt-2 text-xs text-zinc-400">{max}</div>
      </div>

      <div className="mt-8 flex flex-wrap gap-2">
        {presets
          .filter((preset) => preset >= min && preset <= max)
          .map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onChange(preset)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-medium transition",
                preset === safeValue
                  ? "border-zinc-950 bg-zinc-950 text-white"
                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
              )}
            >
              {preset}
            </button>
          ))}
      </div>
    </section>
  );
}

function CollapsibleSection({
  title,
  summary,
  expanded,
  onToggleExpanded,
  children,
}: {
  title: string;
  summary: string;
  expanded: boolean;
  onToggleExpanded: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[1.6rem] border border-zinc-200 bg-white p-5 shadow-[0_18px_50px_-40px_rgba(0,0,0,0.35)]">
      <button
        type="button"
        onClick={onToggleExpanded}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={expanded}
      >
        <div>
          <h3 className="text-base font-semibold tracking-tight text-zinc-950">{title}</h3>
          <div className="mt-2 rounded-2xl bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
            <span className="font-medium text-zinc-900">Using:</span> {summary}
          </div>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-zinc-50 text-zinc-600">
          <svg
            viewBox="0 0 24 24"
            className={cn("h-5 w-5 transition-transform", expanded ? "rotate-180" : "")}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </button>

      {expanded ? <div className="mt-4">{children}</div> : null}
    </section>
  );
}

function OperatorSection({
  config,
  expanded,
  onToggleExpanded,
  onSetOperators,
}: {
  config: MathProblemConfig;
  expanded: boolean;
  onToggleExpanded: () => void;
  onSetOperators: (operators: Array<"addition" | "subtraction">) => void;
}) {
  const activeAddition = config.includeAddition;
  const activeSubtraction = config.includeSubtraction;

  return (
    <CollapsibleSection
      title="Operations"
      summary={formatOperatorSummary(config)}
      expanded={expanded}
      onToggleExpanded={onToggleExpanded}
    >
      <p className="text-sm leading-relaxed text-zinc-500">
        Subtraction automatically keeps operand B less than or equal to operand A.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <button
          type="button"
          onClick={() => {
            if (activeAddition && activeSubtraction) {
              onSetOperators(["subtraction"]);
              return;
            }

            if (!activeAddition && activeSubtraction) {
              onSetOperators(["addition", "subtraction"]);
              return;
            }

            onSetOperators(["addition"]);
          }}
          className={cn(
            "rounded-2xl border px-4 py-4 text-left text-sm font-semibold transition",
            activeAddition ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200 bg-zinc-50 text-zinc-500"
          )}
        >
          <div className="text-xl font-black">+</div>
          <div className="mt-1">Addition</div>
        </button>
        <button
          type="button"
          onClick={() => {
            if (activeAddition && activeSubtraction) {
              onSetOperators(["addition"]);
              return;
            }

            if (activeAddition && !activeSubtraction) {
              onSetOperators(["addition", "subtraction"]);
              return;
            }

            onSetOperators(["subtraction"]);
          }}
          className={cn(
            "rounded-2xl border px-4 py-4 text-left text-sm font-semibold transition",
            activeSubtraction ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-200 bg-zinc-50 text-zinc-500"
          )}
        >
          <div className="text-xl font-black">-</div>
          <div className="mt-1">Subtraction</div>
        </button>
        <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-400">
          <div className="text-xl font-black">×</div>
          <div className="mt-1">Future</div>
        </div>
        <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-4 text-sm text-zinc-400">
          <div className="text-xl font-black">÷</div>
          <div className="mt-1">Future</div>
        </div>
      </div>
    </CollapsibleSection>
  );
}

function OperandRangeSection({
  title,
  range,
  expanded,
  onToggleExpanded,
  onChange,
}: {
  title: string;
  range: RangeValue;
  expanded: boolean;
  onToggleExpanded: () => void;
  onChange: (range: RangeValue) => void;
}) {
  return (
    <CollapsibleSection
      title={title}
      summary={formatRangeSummary(range)}
      expanded={expanded}
      onToggleExpanded={onToggleExpanded}
    >
      <div className="grid gap-4">
        <SliderField
          title={`${title} minimum`}
          value={range.min}
          min={OPERAND_RANGE.min}
          max={OPERAND_RANGE.max}
          presets={[0, 1, 5, 10, 20, 50]}
          onChange={(value) => onChange({ min: value, max: range.max })}
        />
        <SliderField
          title={`${title} maximum`}
          value={range.max}
          min={OPERAND_RANGE.min}
          max={OPERAND_RANGE.max}
          presets={[9, 10, 20, 50, 100]}
          onChange={(value) => onChange({ min: range.min, max: value })}
        />
      </div>
    </CollapsibleSection>
  );
}

function ProblemCountSection({
  value,
  expanded,
  onToggleExpanded,
  onChange,
}: {
  value: number;
  expanded: boolean;
  onToggleExpanded: () => void;
  onChange: (value: number) => void;
}) {
  return (
    <CollapsibleSection
      title="Problems per round"
      summary={`${clamp(value, PROBLEM_COUNT_RANGE.min, PROBLEM_COUNT_RANGE.max)}`}
      expanded={expanded}
      onToggleExpanded={onToggleExpanded}
    >
      <SliderField
        title="Problems per round"
        value={value}
        min={PROBLEM_COUNT_RANGE.min}
        max={PROBLEM_COUNT_RANGE.max}
        presets={[8, 12, 20, 30]}
        onChange={onChange}
      />
    </CollapsibleSection>
  );
}

export default function ConfigurationsPage() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState("");
  const [speechSupported, setSpeechSupported] = useState(false);
  const [mathDebugEnabled, setMathDebugEnabled] = useState(false);
  const [mathDebugCaptureAllEnabled, setMathDebugCaptureAllEnabled] = useState(false);
  const [mathDebugBiasFoursEnabled, setMathDebugBiasFoursEnabled] = useState(false);
  const [mathDebugCaptureRunLength, setMathDebugCaptureRunLengthState] = useState(12);
  const [mathConfig, setMathConfig] = useState<MathProblemConfig>(getStoredMathProblemConfig);
  const [mathSetupExpanded, setMathSetupExpanded] = useState(false);
  const [spellingSetupExpanded, setSpellingSetupExpanded] = useState(false);
  const [spellingCustomListEnabled, setSpellingCustomListEnabled] = useState(false);
  const [spellingCustomListEntries, setSpellingCustomListEntries] = useState(parseSpellingCustomList(getStoredSpellingCustomListText()));
  const [spellingCustomListDraft, setSpellingCustomListDraft] = useState("");
  const [expandedSection, setExpandedSection] = useState<MathSectionKey>(null);
  const spellingCustomListInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setMathDebugEnabled(getStoredMathDebugEnabled());
    setMathDebugCaptureAllEnabled(getStoredMathDebugCaptureAllEnabled());
    setMathDebugBiasFoursEnabled(getStoredMathDebugBiasFoursEnabled());
    setMathDebugCaptureRunLengthState(getStoredMathDebugCaptureRunLength());
    const storedSpellingEntries = parseSpellingCustomList(getStoredSpellingCustomListText());
    const storedSpellingEnabled = getStoredSpellingCustomListEnabled();

    setSpellingCustomListEntries(storedSpellingEntries);

    if (storedSpellingEntries.length > 0) {
      setSpellingCustomListEnabled(true);
      setStoredSpellingCustomListEnabled(true);
    } else {
      setSpellingCustomListEnabled(storedSpellingEnabled);
    }
  }, []);

  useEffect(() => {
    if (!("speechSynthesis" in window)) {
      setSpeechSupported(false);
      return;
    }

    setSpeechSupported(true);
    const synthesis = window.speechSynthesis;

    const refreshVoices = () => {
      const availableVoices = synthesis.getVoices();
      setVoices(availableVoices);
      setSelectedVoiceURI(getStoredSpellingVoiceURI());
    };

    refreshVoices();
    synthesis.addEventListener("voiceschanged", refreshVoices);

    return () => {
      synthesis.removeEventListener("voiceschanged", refreshVoices);
    };
  }, []);

  const englishVoices = useMemo(
    () => voices.filter((voice) => voice.lang.toLowerCase().startsWith("en")),
    [voices]
  );

  const selectedVoiceLabel = useMemo(() => {
    if (!selectedVoiceURI) {
      return "Browser default";
    }

    const voice = englishVoices.find((entry) => entry.voiceURI === selectedVoiceURI);
    return voice ? `${voice.name} (${voice.lang})` : "Saved voice not available on this device";
  }, [englishVoices, selectedVoiceURI]);

  const parsedCustomSpellingWords = spellingCustomListEntries;

  const commitSpellingCustomListEntries = (entries: typeof spellingCustomListEntries) => {
    setSpellingCustomListEntries(entries);
    setStoredSpellingCustomListText(serializeSpellingCustomList(entries));

    if (entries.length > 0) {
      setSpellingCustomListEnabled(true);
      setStoredSpellingCustomListEnabled(true);
    }
  };

  const commitSpellingCustomListDraft = () => {
    const nextEntry = parseSpellingCustomList(spellingCustomListDraft)[0];
    if (!nextEntry) {
      return false;
    }

    commitSpellingCustomListEntries([...parsedCustomSpellingWords, nextEntry]);
    setSpellingCustomListDraft("");
    window.setTimeout(() => {
      spellingCustomListInputRef.current?.focus();
    }, 0);
    return true;
  };

  const generatedMathProblems = useMemo(() => generateMathProblems(mathConfig), [mathConfig]);

  const difficultyCounts = useMemo(
    () =>
      generatedMathProblems.reduce(
        (counts, problem) => {
          counts[problem.difficulty] += 1;
          return counts;
        },
        { easy: 0, medium: 0, hard: 0 }
      ),
    [generatedMathProblems]
  );

  const operandARange = useMemo(
    () => ({ min: mathConfig.operandAMin, max: mathConfig.operandAMax }),
    [mathConfig.operandAMax, mathConfig.operandAMin]
  );
  const operandBRange = useMemo(
    () => ({ min: mathConfig.operandBMin, max: mathConfig.operandBMax }),
    [mathConfig.operandBMax, mathConfig.operandBMin]
  );

  const updateMathConfig = (nextConfig: MathProblemConfig) => {
    const normalizedConfig = {
      ...nextConfig,
      operandAMin: Math.min(nextConfig.operandAMin, nextConfig.operandAMax),
      operandAMax: Math.max(nextConfig.operandAMin, nextConfig.operandAMax),
      operandBMin: Math.min(nextConfig.operandBMin, nextConfig.operandBMax),
      operandBMax: Math.max(nextConfig.operandBMin, nextConfig.operandBMax),
    };

    setMathConfig(normalizedConfig);
    setStoredMathProblemConfig(normalizedConfig);
  };

  const setMathPreset = (preset: "within10" | "within20" | "nineFactFamily" | "wideOpen") => {
    if (preset === "within10") {
      updateMathConfig({
        ...mathConfig,
        operandAMin: 0,
        operandAMax: 10,
        operandBMin: 0,
        operandBMax: 10,
        includeAddition: true,
        includeSubtraction: true,
        problemCount: 12,
      });
      return;
    }

    if (preset === "within20") {
      updateMathConfig({
        ...mathConfig,
        operandAMin: 0,
        operandAMax: 20,
        operandBMin: 0,
        operandBMax: 20,
        includeAddition: true,
        includeSubtraction: true,
        problemCount: 12,
      });
      return;
    }

    if (preset === "nineFactFamily") {
      updateMathConfig({
        ...mathConfig,
        operandAMin: 9,
        operandAMax: 9,
        operandBMin: 0,
        operandBMax: 9,
        includeAddition: true,
        includeSubtraction: true,
        problemCount: 12,
      });
      return;
    }

    updateMathConfig({
      ...mathConfig,
      operandAMin: 0,
      operandAMax: 100,
      operandBMin: 0,
      operandBMax: 100,
      includeAddition: true,
      includeSubtraction: true,
      problemCount: 12,
    });
  };

  return (
    <div className="min-h-screen bg-[#f7f7f5] text-zinc-900">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-x-0 top-0 h-[42vh] bg-gradient-to-b from-zinc-100 to-transparent" />
      </div>

      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <div className="mb-8 flex items-center justify-between gap-3">
          <Link to="/" className="text-sm font-semibold text-zinc-600 underline-offset-4 hover:text-zinc-950 hover:underline">
            Back to home
          </Link>
          <Link
            to="/math"
            className="rounded-full border border-zinc-950 bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-black"
          >
            Open math
          </Link>
        </div>

        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-950">Configurations</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-500">
            Keep the activity screens clean. Set the rules here.
          </p>
        </header>

        <section className="mb-6 rounded-[2rem] border border-zinc-200 bg-white p-5 shadow-[0_20px_60px_-45px_rgba(0,0,0,0.35)] sm:p-6">
          <button
            type="button"
            onClick={() => setMathSetupExpanded((current) => !current)}
            className="flex w-full items-start justify-between gap-4 text-left"
            aria-expanded={mathSetupExpanded}
          >
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-zinc-950">Math setup</h2>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-zinc-500">
                Pick the top-number range, the operator mix, and the bottom-number range.
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-500">
                <span className="rounded-full bg-zinc-100 px-3 py-1 font-medium text-zinc-700">
                  {formatRangeSummary(operandARange)} top
                </span>
                <span className="rounded-full bg-zinc-100 px-3 py-1 font-medium text-zinc-700">
                  {formatOperatorSummary(mathConfig)}
                </span>
                <span className="rounded-full bg-zinc-100 px-3 py-1 font-medium text-zinc-700">
                  {formatRangeSummary(operandBRange)} bottom
                </span>
                <span className="rounded-full bg-zinc-100 px-3 py-1 font-medium text-zinc-700">
                  {mathConfig.problemCount} problems
                </span>
              </div>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-zinc-50 text-zinc-600">
              <svg
                viewBox="0 0 24 24"
                className={cn("h-5 w-5 transition-transform", mathSetupExpanded ? "rotate-180" : "")}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
          </button>

          {mathSetupExpanded ? (
            <>

          <div className="mt-5 flex flex-wrap gap-2">
            <CompactToggle
              active={mathDebugEnabled}
              activeLabel="Debug on"
              inactiveLabel="Debug off"
              onClick={() => {
                const nextValue = !mathDebugEnabled;
                setMathDebugEnabled(nextValue);
                setStoredMathDebugEnabled(nextValue);
              }}
            />
            <CompactToggle
              active={mathDebugCaptureAllEnabled}
              activeLabel="Capture all"
              inactiveLabel="Capture normal"
              onClick={() => {
                const nextValue = !mathDebugCaptureAllEnabled;
                setMathDebugCaptureAllEnabled(nextValue);
                setStoredMathDebugCaptureAllEnabled(nextValue);
              }}
            />
            <CompactToggle
              active={mathDebugBiasFoursEnabled}
              activeLabel="Prefer 4s"
              inactiveLabel="Normal mix"
              onClick={() => {
                const nextValue = !mathDebugBiasFoursEnabled;
                setMathDebugBiasFoursEnabled(nextValue);
                setStoredMathDebugBiasFoursEnabled(nextValue);
              }}
            />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {[
              { id: "within10", label: "Within 10" },
              { id: "within20", label: "Within 20" },
              { id: "nineFactFamily", label: "9 ± x" },
              { id: "wideOpen", label: "Wide open" },
            ].map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setMathPreset(preset.id as "within10" | "within20" | "nineFactFamily" | "wideOpen")}
                className="rounded-full border border-zinc-300 bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:border-zinc-950 hover:bg-white"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="grid gap-4">
              <OperandRangeSection
                title="Operand A"
                range={operandARange}
                expanded={expandedSection === "operandA"}
                onToggleExpanded={() => setExpandedSection((current) => (current === "operandA" ? null : "operandA"))}
                onChange={(range) => updateMathConfig({ ...mathConfig, operandAMin: range.min, operandAMax: range.max })}
              />

              <OperatorSection
                config={mathConfig}
                expanded={expandedSection === "operations"}
                onToggleExpanded={() => setExpandedSection((current) => (current === "operations" ? null : "operations"))}
                onSetOperators={(operators) =>
                  updateMathConfig({
                    ...mathConfig,
                    includeAddition: operators.includes("addition"),
                    includeSubtraction: operators.includes("subtraction"),
                  })
                }
              />

              <OperandRangeSection
                title="Operand B"
                range={operandBRange}
                expanded={expandedSection === "operandB"}
                onToggleExpanded={() => setExpandedSection((current) => (current === "operandB" ? null : "operandB"))}
                onChange={(range) => updateMathConfig({ ...mathConfig, operandBMin: range.min, operandBMax: range.max })}
              />
            </div>

            <div className="grid gap-4">
              <ProblemCountSection
                value={mathConfig.problemCount}
                expanded={expandedSection === "problemCount"}
                onToggleExpanded={() => setExpandedSection((current) => (current === "problemCount" ? null : "problemCount"))}
                onChange={(value) => updateMathConfig({ ...mathConfig, problemCount: value })}
              />

              <section className="rounded-[1.6rem] border border-zinc-200 bg-zinc-950 p-5 text-white shadow-[0_18px_50px_-40px_rgba(0,0,0,0.5)]">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-base font-semibold tracking-tight">Current batch</h3>
                  <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-medium text-white/80">
                    {generatedMathProblems.length} generated
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="rounded-2xl bg-white/6 px-3 py-3 text-center">
                    <div className="text-xs uppercase tracking-[0.18em] text-white/45">Easy</div>
                    <div className="mt-1 text-2xl font-semibold tabular-nums">{difficultyCounts.easy}</div>
                  </div>
                  <div className="rounded-2xl bg-white/6 px-3 py-3 text-center">
                    <div className="text-xs uppercase tracking-[0.18em] text-white/45">Medium</div>
                    <div className="mt-1 text-2xl font-semibold tabular-nums">{difficultyCounts.medium}</div>
                  </div>
                  <div className="rounded-2xl bg-white/6 px-3 py-3 text-center">
                    <div className="text-xs uppercase tracking-[0.18em] text-white/45">Hard</div>
                    <div className="mt-1 text-2xl font-semibold tabular-nums">{difficultyCounts.hard}</div>
                  </div>
                </div>

                <div className="mt-4 space-y-2 text-sm text-white/70">
                  <div>Easy: all three numbers stay one digit.</div>
                  <div>Medium: one of the three numbers becomes multi-digit.</div>
                  <div>Hard: two or more numbers become multi-digit.</div>
                </div>

                <div className="mt-5 border-t border-white/10 pt-4 space-y-2 text-sm text-white/70">
                  <div>
                    <span className="text-white/45">Operand A:</span> {formatRangeSummary(operandARange)}
                  </div>
                  <div>
                    <span className="text-white/45">Operand B:</span> {formatRangeSummary(operandBRange)}
                  </div>
                  <div>
                    <span className="text-white/45">Operations:</span> {formatOperatorSummary(mathConfig)}
                  </div>
                </div>
              </section>
            </div>
          </div>

          {mathDebugEnabled ? (
            <section className="mt-4 rounded-[1.6rem] border border-zinc-200 bg-zinc-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold tracking-tight text-zinc-950">Debug collection</h3>
                  <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                    Private collection helpers only. Normal play stays unchanged.
                  </p>
                </div>
                <div className="flex items-center gap-1 rounded-full border border-zinc-200 bg-white p-1">
                  {[12, 50, 100].map((length) => {
                    const active = mathDebugCaptureRunLength === length;
                    return (
                      <button
                        key={length}
                        type="button"
                        onClick={() => {
                          setMathDebugCaptureRunLengthState(length);
                          setStoredMathDebugCaptureRunLength(length);
                        }}
                        className={cn(
                          "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                          active ? "bg-zinc-950 text-white" : "text-zinc-600 hover:bg-zinc-100"
                        )}
                        aria-pressed={active}
                      >
                        {length}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 grid gap-2 text-sm text-zinc-600 sm:grid-cols-3">
                <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-3">
                  Capture mode
                  <div className="mt-1 font-semibold text-zinc-950">
                    {mathDebugCaptureAllEnabled ? "Accepted + misses" : "Misses only"}
                  </div>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-3">
                  Session length
                  <div className="mt-1 font-semibold text-zinc-950">{mathDebugCaptureRunLength} problems</div>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-3">
                  Digit bias
                  <div className="mt-1 font-semibold text-zinc-950">
                    {mathDebugBiasFoursEnabled ? "Prefer answers with 4" : "Normal distribution"}
                  </div>
                </div>
              </div>
            </section>
          ) : null}

            </>
          ) : null}
        </section>

        <section className="mb-6 rounded-[2rem] border border-zinc-200 bg-white p-5 shadow-[0_20px_60px_-45px_rgba(0,0,0,0.35)]">
          <button
            type="button"
            onClick={() => setSpellingSetupExpanded((current) => !current)}
            className="flex w-full items-start justify-between gap-4 text-left"
            aria-expanded={spellingSetupExpanded}
          >
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-zinc-950">Spelling setup</h2>
              <p className="mt-1 max-w-xl text-sm leading-relaxed text-zinc-500">
                Keep spelling audio and future controls together in one collapsible section.
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-zinc-500">
                <span className="rounded-full bg-zinc-100 px-3 py-1 font-medium text-zinc-700">
                  Voice: {speechSupported ? selectedVoiceLabel : "Unavailable"}
                </span>
                <span className="rounded-full bg-zinc-100 px-3 py-1 font-medium text-zinc-700">
                  {spellingCustomListEnabled && parsedCustomSpellingWords.length > 0
                    ? `Custom list: ${parsedCustomSpellingWords.length} words`
                    : "Built-in list"}
                </span>
                <span className="rounded-full bg-zinc-100 px-3 py-1 font-medium text-zinc-700">Bubbles save instantly</span>
              </div>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-zinc-50 text-zinc-600">
              <svg
                viewBox="0 0 24 24"
                className={cn("h-5 w-5 transition-transform", spellingSetupExpanded ? "rotate-180" : "")}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
          </button>

          {spellingSetupExpanded ? (
            <>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  to="/spelling"
                  className="rounded-full border border-zinc-950 bg-zinc-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-black"
                >
                  Open spelling
                </Link>
                <span className="rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-600">
                  One line per word, optional `; sentence` on the same line
                </span>
              </div>

              <div className="mt-5 rounded-[1.6rem] border border-zinc-200 bg-zinc-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold tracking-tight text-zinc-950">Custom spelling list</h3>
                    <p className="mt-1 text-sm text-zinc-600">
                      Type one word per line. Add an optional sentence after `; ` on the same line.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700">
                    {parsedCustomSpellingWords.length} words saved
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <CompactToggle
                    active={spellingCustomListEnabled}
                    activeLabel="Custom list on"
                    inactiveLabel="Built-in list"
                    onClick={() => {
                      const nextValue = !spellingCustomListEnabled;
                      setSpellingCustomListEnabled(nextValue);
                      setStoredSpellingCustomListEnabled(nextValue);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setSpellingCustomListDraft("");
                      commitSpellingCustomListEntries([]);
                      setSpellingCustomListEnabled(false);
                      setStoredSpellingCustomListEnabled(false);
                    }}
                    className="rounded-full border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50"
                  >
                    Reset custom list
                  </button>
                </div>

                <label className="mt-4 block text-sm font-semibold text-zinc-700" htmlFor="spelling-custom-list">
                  Words and optional sentences
                </label>
                <div className="mt-2 rounded-2xl border border-zinc-300 bg-white px-3 py-3 transition focus-within:border-zinc-950">
                  {parsedCustomSpellingWords.length > 0 ? (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {parsedCustomSpellingWords.map((entry, index) => (
                        <button
                          key={`${entry.word}-${index}-${entry.sentence ?? ""}`}
                          type="button"
                          onClick={() => {
                            const nextEntries = parsedCustomSpellingWords.filter((_, entryIndex) => entryIndex !== index);
                            setSpellingCustomListDraft(formatSpellingCustomListEntry(entry));
                            commitSpellingCustomListEntries(nextEntries);
                          }}
                          className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-left text-xs font-medium text-violet-800 transition hover:border-violet-300 hover:bg-violet-100"
                          title="Click to bring this entry back into the editor"
                        >
                          {formatSpellingCustomListEntry(entry)}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <div className="flex items-center gap-2">
                    <input
                      ref={spellingCustomListInputRef}
                      id="spelling-custom-list"
                      type="text"
                      value={spellingCustomListDraft}
                      onChange={(event) => {
                        setSpellingCustomListDraft(event.target.value);
                      }}
                      onKeyDown={(event) => {
                        event.stopPropagation();

                        if (event.key === "Enter") {
                          event.preventDefault();
                          void commitSpellingCustomListDraft();
                          return;
                        }

                        if (event.key === "Backspace" && !spellingCustomListDraft && parsedCustomSpellingWords.length > 0) {
                          event.preventDefault();
                          const nextEntries = parsedCustomSpellingWords.slice(0, -1);
                          const poppedEntry = parsedCustomSpellingWords[parsedCustomSpellingWords.length - 1];
                          setSpellingCustomListDraft(formatSpellingCustomListEntry(poppedEntry));
                          commitSpellingCustomListEntries(nextEntries);
                        }
                      }}
                      placeholder="Type a word, or word; sentence, then press Enter"
                      className="block w-full border-0 bg-transparent px-1 py-1 text-sm text-zinc-900 outline-none"
                      spellCheck={false}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        void commitSpellingCustomListDraft();
                      }}
                      className="shrink-0 rounded-xl border border-zinc-300 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:border-zinc-400 hover:bg-zinc-100"
                    >
                      Add
                    </button>
                  </div>
                </div>

                <div className="mt-3 text-sm text-zinc-500">
                  {parsedCustomSpellingWords.length > 0
                    ? `Saved ${parsedCustomSpellingWords.length} custom word${parsedCustomSpellingWords.length === 1 ? "" : "s"}.`
                    : spellingCustomListDraft
                      ? "Press Enter to turn the current line into a saved bubble."
                      : "No custom words saved yet."}
                </div>
              </div>

              {!speechSupported ? (
                <p className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-700">
                  This browser does not support speech synthesis here.
                </p>
              ) : (
                <>
                  <label className="mt-4 block text-sm font-semibold text-zinc-700" htmlFor="spelling-voice">
                    Voice
                  </label>
                  <select
                    id="spelling-voice"
                    value={selectedVoiceURI}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setSelectedVoiceURI(nextValue);
                      setStoredSpellingVoiceURI(nextValue);
                    }}
                    className="mt-2 block w-full rounded-2xl border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 outline-none transition focus:border-zinc-950"
                  >
                    <option value="">Browser default</option>
                    {englishVoices.map((voice) => (
                      <option key={voice.voiceURI} value={voice.voiceURI}>
                        {voice.name} ({voice.lang})
                      </option>
                    ))}
                  </select>

                  <p className="mt-3 text-sm text-zinc-500">
                    Current selection: <span className="font-semibold text-zinc-900">{selectedVoiceLabel}</span>
                  </p>
                </>
              )}

              <div className="mt-5 flex flex-wrap gap-2">
                {["one word per line", "optional ; sentence", "stored on this device"].map((item) => (
                  <span key={item} className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-600">
                    {item}
                  </span>
                ))}
              </div>
            </>
          ) : null}
        </section>

        <ul className="space-y-4">
          {rows.filter((row) => row.app !== "Spelling").map((row) => (
            <li key={row.app} className="rounded-[1.6rem] border border-zinc-200 bg-white p-5 shadow-[0_18px_50px_-40px_rgba(0,0,0,0.35)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight text-zinc-950">{row.app}</h2>
                  <p className="mt-1 text-sm text-zinc-500">{row.description}</p>
                </div>
                {row.defaultPath ? (
                  <Link
                    to={row.defaultPath}
                    className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-800 transition hover:border-zinc-950 hover:bg-zinc-50"
                  >
                    Open
                  </Link>
                ) : (
                  <span className="rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-semibold text-zinc-500">
                    Coming soon
                  </span>
                )}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {row.future.map((item) => (
                  <span key={item} className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-600">
                    {item}
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

