import { useState, useEffect, useCallback } from 'react';

/** The workbook set's key. Weekly sets pass their own, so each week starts at puzzle 1. */
export const WORKBOOK_STORAGE_KEY = 'wordMazeGameState';
const CONFIG_KEY = 'wordMazeConfig';

interface GameState {
  currentPuzzleIndex: number;
  completedPuzzles: Set<number>;
  timestamp: number;
}

interface GameConfig {
  startingPuzzle: number;
}

export function usePersistentGameState(totalPuzzles: number, storageKey: string = WORKBOOK_STORAGE_KEY) {
  const [currentPuzzleIndex, setCurrentPuzzleIndex] = useState(0);
  const [completedPuzzles, setCompletedPuzzles] = useState<Set<number>>(new Set());
  const [isLoaded, setIsLoaded] = useState(false);

  // Load state from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const state: Omit<GameState, 'timestamp'> & { completedPuzzles: number[] } = JSON.parse(saved);
        // A set can shrink (a maze removed from a week); landing past the end would leave the screen on Loading.
        const index = Number.isInteger(state.currentPuzzleIndex) ? state.currentPuzzleIndex : 0;
        setCurrentPuzzleIndex(Math.min(Math.max(index, 0), Math.max(totalPuzzles - 1, 0)));
        setCompletedPuzzles(new Set(state.completedPuzzles || []));
      }
    } catch (e) {
      console.error('Failed to load game state:', e);
    }
    setIsLoaded(true);
    // Read once per mount; a different set is a different mount (see the key on MazePlayer).
  }, []);

  // Save state to localStorage whenever it changes
  useEffect(() => {
    if (!isLoaded) return;
    try {
      const state: GameState = {
        currentPuzzleIndex,
        completedPuzzles,
        timestamp: Date.now(),
      };
      localStorage.setItem(storageKey, JSON.stringify({
        ...state,
        completedPuzzles: Array.from(state.completedPuzzles),
      }));
    } catch (e) {
      console.error('Failed to save game state:', e);
    }
  }, [currentPuzzleIndex, completedPuzzles, isLoaded, storageKey]);

  const markPuzzleComplete = useCallback((index: number) => {
    setCompletedPuzzles((prev) => new Set([...prev, index]));
  }, []);

  const resetAll = useCallback(() => {
    setCurrentPuzzleIndex(0);
    setCompletedPuzzles(new Set());
    localStorage.removeItem(storageKey);
  }, [storageKey]);

  const jumpToPuzzle = useCallback((index: number) => {
    if (index >= 0 && index < totalPuzzles) {
      setCurrentPuzzleIndex(index);
    }
  }, [totalPuzzles]);

  return {
    currentPuzzleIndex,
    setCurrentPuzzleIndex,
    completedPuzzles,
    markPuzzleComplete,
    resetAll,
    jumpToPuzzle,
    isLoaded,
  };
}

export function useGameConfig() {
  const [config, setConfig] = useState<GameConfig>({
    startingPuzzle: 0,
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CONFIG_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<GameConfig> & { useMasterData?: boolean };
        setConfig({
          startingPuzzle:
            typeof parsed.startingPuzzle === 'number' && Number.isFinite(parsed.startingPuzzle)
              ? parsed.startingPuzzle
              : 0,
        });
      }
    } catch (e) {
      console.error('Failed to load config:', e);
    }
  }, []);

  const updateConfig = (newConfig: Partial<GameConfig>) => {
    const updated = { ...config, ...newConfig };
    setConfig(updated);
    try {
      localStorage.setItem(CONFIG_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save config:', e);
    }
  };

  return { config, updateConfig };
}
