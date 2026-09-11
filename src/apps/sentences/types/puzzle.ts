export interface SolutionCell {
  row: number;
  col: number;
}

export interface Puzzle {
  puzzle_id: string;
  /**
   * The grade this puzzle is introduced in. Absent means grade 1, which is
   * every puzzle imported from the original workbook.
   *
   * IMPORTANT: append new puzzles of a higher grade to the END of the array.
   * Progress is persisted as indices into the filtered list, so inserting a
   * grade-2 puzzle in the middle would shift every later index and scramble
   * which puzzles a child has already completed. Appending keeps the
   * grade-1 indices identical whether or not the tail is filtered out.
   */
  grade?: number;
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
