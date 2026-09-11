/**
 * The active grade level, shared by every activity.
 *
 * Content is tagged with the grade it is *introduced* in, and the rule is
 * cumulative: at grade 2 a child still gets everything from grade 0 and 1.
 * That is deliberate. September is review season, and a word list that
 * vanishes the day she moves up is a list she can no longer practice.
 *
 * Grade 0 is kindergarten level. Sound It Out lives there: it is CVC decoding
 * practice, so it stays available at every grade rather than aging out.
 */
export type Grade = 0 | 1 | 2;

export const GRADE_STORAGE_KEY = "app.grade";

export const GRADES: readonly Grade[] = [0, 1, 2] as const;

/**
 * Grade 1 rather than the grade she is actually in, so a fresh phone opens on
 * exactly what this site showed before grades existed. Tap the switch on the
 * home page to move up; the choice sticks.
 */
export const DEFAULT_GRADE: Grade = 1;

/** Full name, for labels that have room. */
export function gradeLabel(grade: Grade) {
  return grade === 0 ? "Kindergarten" : `Grade ${grade}`;
}

/** One or two characters, for the home page switch. */
export function gradeShortLabel(grade: Grade) {
  return grade === 0 ? "K" : String(grade);
}

/**
 * Whether content introduced in `introducedGrade` should be shown to a child
 * working at `activeGrade`. The one place the cumulative rule is written down.
 */
export function isAvailableAtGrade(introducedGrade: number, activeGrade: Grade) {
  return introducedGrade <= activeGrade;
}

function normalizeGrade(value: unknown): Grade {
  /*
   * Check for "nothing stored" before converting. Number(null) is 0, and 0 is
   * a valid grade, so a missing key would otherwise normalize to kindergarten
   * and hide every activity but Sound It Out on a fresh phone.
   */
  if (value === null || value === undefined || value === "") {
    return DEFAULT_GRADE;
  }

  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : Number(value);
  return GRADES.includes(parsed as Grade) ? (parsed as Grade) : DEFAULT_GRADE;
}

export function getStoredGrade(): Grade {
  if (typeof window === "undefined") {
    return DEFAULT_GRADE;
  }

  return normalizeGrade(window.localStorage.getItem(GRADE_STORAGE_KEY));
}

export function setStoredGrade(grade: Grade) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(GRADE_STORAGE_KEY, String(grade));
}
