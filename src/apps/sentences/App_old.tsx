import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { useNavigate } from 'react-router-dom';
import { PuzzleData } from './types/puzzle';
import puzzleDataRaw from './data/puzzles.json';
import { usePersistentGameState, useGameConfig } from './hooks/usePersistentGameState';

const defaultPuzzleData = puzzleDataRaw as unknown as PuzzleData;

/* ------------------------------------------------------------------ */
/*  SVG connector overlay                                              */
/* ------------------------------------------------------------------ */
interface ConnectorsProps {
  selectedIndices: number[];
  gridRefs: React.MutableRefObject<(HTMLButtonElement | null)[]>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  isWon: boolean;
}

const Connectors: React.FC<ConnectorsProps> = ({ selectedIndices, gridRefs, containerRef, isWon }) => {
  const [coords, setCoords] = useState<{ x: number; y: number }[]>([]);

  const measure = useCallback(() => {
    const parent = containerRef.current;
    if (!parent) return;
    const parentRect = parent.getBoundingClientRect();
    const newCoords = selectedIndices.map((index) => {
      const el = gridRefs.current[index];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: r.left + r.width / 2 - parentRect.left,
        y: r.top + r.height / 2 - parentRect.top,
      };
    }).filter((c): c is { x: number; y: number } => c !== null);
    setCoords(newCoords);
  }, [selectedIndices, gridRefs, containerRef]);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  const segments: { from: { x: number; y: number }; to: { x: number; y: number }; key: string }[] = [];
  for (let i = 0; i < selectedIndices.length - 1; i++) {
    const a = selectedIndices[i];
    const b = selectedIndices[i + 1];
    const r1 = Math.floor(a / 4), c1 = a % 4;
    const r2 = Math.floor(b / 4), c2 = b % 4;
    const adjacent = Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
    if (adjacent && coords[i] && coords[i + 1]) {
      segments.push({ from: coords[i], to: coords[i + 1], key: `${a}-${b}` });
    }
  }

  const connectedNodeIndices = new Set<number>();
  for (let i = 0; i < selectedIndices.length - 1; i++) {
    const a = selectedIndices[i];
    const b = selectedIndices[i + 1];
    const r1 = Math.floor(a / 4), c1 = a % 4;
    const r2 = Math.floor(b / 4), c2 = b % 4;
    if (Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1) {
      connectedNodeIndices.add(i);
      connectedNodeIndices.add(i + 1);
    }
  }

  const accentColor = isWon ? '#10b981' : '#8b5cf6';
  const accentLight = isWon ? '#6ee7b7' : '#c4b5fd';

  return (
    <svg className="absolute inset-0 pointer-events-none w-full h-full z-10 overflow-visible">
      <defs>
        <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="7" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
        <linearGradient id="lg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={accentColor} />
          <stop offset="100%" stopColor={accentLight} />
        </linearGradient>
      </defs>
      {segments.map((seg) => {
        const d = `M ${seg.from.x} ${seg.from.y} L ${seg.to.x} ${seg.to.y}`;
        return (
          <g key={seg.key}>
            <path d={d} stroke={accentColor} strokeWidth="14" strokeLinecap="round" className="opacity-15" filter="url(#glow)" />
            <path d={d} stroke="white" strokeWidth="10" strokeLinecap="round" className="opacity-[0.07]" />
            <path d={d} stroke="url(#lg)" strokeWidth="4.5" strokeLinecap="round" />
            <path d={d} stroke="white" strokeWidth="1.5" strokeLinecap="round" className="opacity-30" style={{ transform: 'translate(0.8px, -0.8px)' }} />
          </g>
        );
      })}
      {selectedIndices.map((_, i) => {
        if (!connectedNodeIndices.has(i) || !coords[i]) return null;
        const isTerminal = i === 0 || i === selectedIndices.length - 1;
        return (
          <g key={`n-${i}`}>
            <circle cx={coords[i].x} cy={coords[i].y} r={isTerminal ? 7 : 4.5} fill={accentColor} className="opacity-30" filter="url(#glow)" />
            <circle cx={coords[i].x} cy={coords[i].y} r={isTerminal ? 5 : 3} fill={accentLight} />
          </g>
        );
      })}
    </svg>
  );
};

/* ------------------------------------------------------------------ */
/*  Main App                                                           */
/* ------------------------------------------------------------------ */
const SentencesApp: React.FC = () => {
  const navigate = useNavigate();
  const { config } = useGameConfig();
  const {
    currentPuzzleIndex,
    setCurrentPuzzleIndex,
    completedPuzzles,
    markPuzzleComplete,
    resetAll,
    jumpToPuzzle,
    isLoaded,
  } = usePersistentGameState(defaultPuzzleData.puzzles.length);

  const [puzzleData, setPuzzleData] = useState<PuzzleData>(defaultPuzzleData);
  const [selectedIndices, setSelectedIndices] = useState<number[]>([]);
  const [isWon, setIsWon] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [jumpToPuzzleValue, setJumpToPuzzleValue] = useState('');

  // Load master data if configured
  useEffect(() => {
    if (config.useMasterData) {
      fetch('/puzzles-master.json')
        .then((res) => res.json())
        .then((data) => setPuzzleData(data as PuzzleData))
        .catch((err) => console.error('Failed to load master puzzles:', err));
    }
  }, [config.useMasterData]);

  const currentPuzzle = puzzleData.puzzles[currentPuzzleIndex];
  const gridRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const solutionSet = useMemo(
    () => currentPuzzle?.solution_cells.map((c) => (c.row - 1) * 4 + (c.col - 1)) || [],
    [currentPuzzle],
  );

  const toggleCell = (index: number) => {
    if (isWon) return;
    setSelectedIndices((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index],
    );
  };

  useEffect(() => {
    if (selectedIndices.length === solutionSet.length && selectedIndices.length > 0) {
      const selectedSet = new Set(selectedIndices);
      const solutionSetObj = new Set(solutionSet);
      const match = [...selectedSet].every((v) => solutionSetObj.has(v));
      if (match) {
        setIsWon(true);
        markPuzzleComplete(currentPuzzleIndex);
        const burst = () =>
          confetti({ particleCount: 80, spread: 60, origin: { y: 0.55 }, colors: ['#8b5cf6', '#10b981', '#f59e0b', '#3b82f6'] });
        burst();
        setTimeout(burst, 250);
      }
    }
  }, [selectedIndices, solutionSet, currentPuzzleIndex, markPuzzleComplete]);

  const resetPuzzle = () => {
    setSelectedIndices([]);
    setIsWon(false);
    setShowHint(false);
  };

  const nextPuzzle = () => {
    if (currentPuzzleIndex < puzzleData.puzzles.length - 1) {
      setCurrentPuzzleIndex(currentPuzzleIndex + 1);
      resetPuzzle();
    }
  };

  const prevPuzzle = () => {
    if (currentPuzzleIndex > 0) {
      setCurrentPuzzleIndex(currentPuzzleIndex - 1);
      resetPuzzle();
    }
  };

  const handleJumpToPuzzle = () => {
    const num = parseInt(jumpToPuzzleValue, 10);
    if (!isNaN(num)) {
      jumpToPuzzle(num - 1); // Convert to 0-indexed
      resetPuzzle();
      setJumpToPuzzleValue('');
    }
  };

  const isComplete = isWon && currentPuzzleIndex === puzzleData.puzzles.length - 1;
  const progressPercent = ((currentPuzzleIndex + 1) / puzzleData.puzzles.length) * 100;
  const completedCount = completedPuzzles.size;

  if (!isLoaded || !currentPuzzle) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 flex items-center justify-center text-white">
        <p className="text-lg">Loading...</p>
      </div>
    );
  }

  if (isComplete) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-950 flex flex-col items-center justify-center p-6 text-white font-sans">
        <div className="max-w-md w-full text-center space-y-8">
          <div className="text-8xl mb-2">🏆</div>
          <h1 className="text-5xl font-black bg-clip-text text-transparent bg-gradient-to-r from-amber-300 to-emerald-400">
            All Done!
          </h1>
          <p className="text-lg text-slate-300 leading-relaxed">
            You traced every sentence through the maze. {completedCount === puzzleData.puzzles.length ? 'All puzzles solved!' : `${completedCount} puzzles completed!`}
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => { resetAll(); setCurrentPuzzleIndex(0); resetPuzzle(); }}
              className="px-10 py-4 bg-white text-slate-900 rounded-2xl font-bold text-lg hover:scale-105 active:scale-95 transition-all shadow-xl"
            >
              🔄 Start Over
            </button>
            <button
              onClick={() => navigate('/')}
              className="px-10 py-4 bg-slate-800 text-slate-300 rounded-2xl font-bold text-lg hover:scale-105 active:scale-95 transition-all"
            >
              ← Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950/50 to-slate-950 text-slate-100 p-3 md:p-8 font-sans flex flex-col items-center">
      {/* Header */}
      <header className="w-full max-w-xl flex flex-col items-center mb-5 space-y-2.5 sm:space-y-3">
        <div className="w-full flex justify-between items-center">
          <button
            onClick={() => navigate('/')}
            className="text-slate-400 hover:text-white text-sm transition-colors border border-slate-700 px-3 py-1.5 rounded-lg bg-slate-900/60 backdrop-blur-sm"
          >
            ← Home
          </button>
          <div className="text-center">
            <p className="text-amber-400 font-bold tracking-widest text-[11px] uppercase">
              Puzzle {currentPuzzleIndex + 1} / {puzzleData.puzzles.length}
            </p>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight">Word Maze</h1>
          </div>
          <button
            onClick={() => setShowHint((h) => !h)}
            className="text-slate-400 hover:text-white text-sm transition-colors border border-slate-700 px-3 py-1.5 rounded-lg bg-slate-900/60 backdrop-blur-sm"
          >
            {showHint ? 'Hide' : '💡 Hint'}
          </button>
        </div>

        {/* Progress */}
        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-amber-500 to-orange-400 transition-all duration-500"
            style={{ width: `${(currentPuzzleIndex / puzzleData.puzzles.length) * 100}%` }}
          />
        </div>
      </header>

      {/* Content */}
      <main className="w-full max-w-xl flex flex-col items-center gap-4 sm:gap-5">
        {/* Hint */}
        <div className={`w-full transition-all duration-300 overflow-hidden ${showHint ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'}`}>
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl px-5 py-4 text-center">
            <p className="text-amber-200 italic text-lg">🖼️ "{currentPuzzle.image_description}"</p>
          </div>
        </div>

        {/* Grid */}
        <div
          ref={containerRef}
          className="relative p-3 sm:p-4 bg-slate-900/60 border border-slate-800 rounded-3xl shadow-2xl backdrop-blur-sm"
        >
          <Connectors
            selectedIndices={selectedIndices}
            gridRefs={gridRefs}
            containerRef={containerRef}
            isWon={isWon}
          />

          <div className="grid grid-cols-4 gap-2 sm:gap-2.5 relative z-20">
            {currentPuzzle.grid.flat().map((word, idx) => {
              const isSelected = selectedIndices.includes(idx);
              const selectionOrder = selectedIndices.indexOf(idx);
              const startIdx = (currentPuzzle.solution_cells[0].row - 1) * 4 + (currentPuzzle.solution_cells[0].col - 1);
              const isStart = idx === startIdx;

              return (
                <button
                  key={idx}
                  ref={(el) => { gridRefs.current[idx] = el; }}
                  onClick={() => toggleCell(idx)}
                  className={`
                    relative w-[4.5rem] h-[4.5rem] sm:w-[5.5rem] sm:h-[5.5rem] md:w-24 md:h-24
                    flex flex-col items-center justify-center rounded-2xl
                    font-bold transition-all duration-200 select-none
                    ${isSelected
                      ? isWon
                        ? 'bg-emerald-500/90 text-white shadow-lg shadow-emerald-500/30 scale-105'
                        : 'bg-purple-600/90 text-white shadow-lg shadow-purple-500/25 scale-105'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/90 hover:text-white hover:scale-[1.03] active:scale-[0.97]'
                    }
                  `}
                >
                  <span className="text-base sm:text-lg md:text-xl leading-none">{word}</span>
                  {isSelected && (
                    <span className="absolute top-1 right-1.5 text-[10px] font-mono opacity-50">
                      {selectionOrder + 1}
                    </span>
                  )}
                  {isStart && !isSelected && (
                    <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 px-2 py-[2px] bg-indigo-500 text-[9px] rounded-full text-white uppercase tracking-wide font-bold animate-pulse shadow-lg shadow-indigo-500/40">
                      Start
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            onClick={resetPuzzle}
            disabled={isWon}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors disabled:opacity-30 text-sm font-medium"
          >
            Clear All
          </button>
          <div className="px-5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-slate-400 text-sm font-mono">
            <span className={selectedIndices.length > 0 ? 'text-purple-400' : ''}>{selectedIndices.length}</span>
            <span className="mx-1">/</span>
            <span>{solutionSet.length}</span>
            <span className="ml-1 text-slate-600">words</span>
          </div>
        </div>

        {/* Sentence preview */}
        {selectedIndices.length > 0 && !isWon && (
          <div className="w-full bg-slate-900/40 border border-slate-800/60 rounded-2xl px-5 py-3 text-center">
            <p className="text-slate-400 text-xs uppercase tracking-widest mb-1 font-bold">Your sentence</p>
            <p className="text-slate-200 text-lg italic leading-relaxed">
              {selectedIndices.map((i) => currentPuzzle.grid.flat()[i]).join(' ')}
            </p>
          </div>
        )}

        {/* Win card */}
        <div className={`w-full transition-all duration-500 ${isWon ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
          <div className="bg-emerald-500/10 border border-emerald-500/25 rounded-3xl p-5 sm:p-6 text-center space-y-3 sm:space-y-4">
            <p className="text-emerald-400 text-sm font-bold uppercase tracking-widest">✨ Maze Solved!</p>
            <p className="text-white text-lg sm:text-xl font-bold leading-relaxed">
              "{currentPuzzle.solution_sentence}"
            </p>
            {currentPuzzleIndex < puzzleData.puzzles.length - 1 && (
              <button
                onClick={nextPuzzle}
                className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-900 font-black rounded-2xl transition-all hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-emerald-500/20 text-lg"
              >
                Next Puzzle →
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default SentencesApp;
