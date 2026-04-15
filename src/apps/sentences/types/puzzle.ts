export interface SolutionCell {
  row: number;
  col: number;
}

export interface Puzzle {
  puzzle_id: string;
  pdf_page: number;
  image_description: string;
  grid: string[][];
  solution_sentence: string;
  solution_words: string[];
  solution_cells: SolutionCell[];
}

export interface PuzzleData {
  document_type: string;
  puzzles: Puzzle[];
  summary: {
    total_puzzles: number;
  };
}
