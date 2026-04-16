import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'wordMazeGameState';
const CONFIG_KEY = 'wordMazeConfig';

interface GameState {
  currentPuzzleIndex: number;
  completedPuzzles: Set<number>;
  timestamp: number;
}

interface GameConfig {
  useMasterData: boolean;
  startingPuzzle: number;
}

export function usePersistentGameState(totalPuzzles: number) {
  const [currentPuzzleIndex, setCurrentPuzzleIndex] = useState(0);
  const [completedPuzzles, setCompletedPuzzles] = useState<Set<number>>(new Set());
  const [isLoaded, setIsLoaded] = useState(false);

  // Load state from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const state: Omit<GameState, 'timestamp'> & { completedPuzzles: number[] } = JSON.parse(saved);
        setCurrentPuzzleIndex(state.currentPuzzleIndex);
        setCompletedPuzzles(new Set(state.completedPuzzles || []));
      }
    } catch (e) {
      console.error('Failed to load game state:', e);
    }
    setIsLoaded(true);
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...state,
        completedPuzzles: Array.from(state.completedPuzzles),
      }));
    } catch (e) {
      console.error('Failed to save game state:', e);
    }
  }, [currentPuzzleIndex, completedPuzzles, isLoaded]);

  const markPuzzleComplete = useCallback((index: number) => {
    setCompletedPuzzles((prev) => new Set([...prev, index]));
  }, []);

  const resetAll = useCallback(() => {
    setCurrentPuzzleIndex(0);
    setCompletedPuzzles(new Set());
    localStorage.removeItem(STORAGE_KEY);
  }, []);

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
    useMasterData: false,
    startingPuzzle: 0,
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(CONFIG_KEY);
      if (saved) {
        setConfig(JSON.parse(saved));
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
