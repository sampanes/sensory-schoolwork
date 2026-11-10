import type { Week } from "./types";

export type { Week, WeeklyMaze } from "./types";

/*
 * Every week's words, one import per week. Order here does not matter; WEEKS
 * is sorted newest first below, and the newest is "this week".
 *
 * To add a week: copy the newest file, rename it to the new Monday's date,
 * and add it to this list.
 */
const ALL_WEEKS: readonly Week[] = [];

export const WEEKS: readonly Week[] = [...ALL_WEEKS].sort((a, b) => b.weekOf.localeCompare(a.weekOf));

/** The newest week, or null before the first one is added. */
export const CURRENT_WEEK: Week | null = WEEKS[0] ?? null;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/**
 * "Week of Nov 16". Built by hand rather than with Date: weekOf is a calendar
 * date, and parsing it as a Date reads it as UTC midnight, which is the
 * previous day anywhere west of Greenwich.
 */
export function weekLabel(week: Week): string {
  const [, month, day] = week.weekOf.split("-").map((part) => Number.parseInt(part, 10));
  return `Week of ${MONTHS[month - 1] ?? "?"} ${day}`;
}
