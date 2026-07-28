/**
 * Date formatting shared by every screen.
 *
 * All clinical timestamps render in the Uganda locale, so the option sets live
 * here rather than being re-declared per screen.
 */

const LOCALE = "en-UG";

/** "12 Mar 2025" style — short month, day and year. */
export function fmtDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString(LOCALE, { month: "short", day: "numeric", year: "numeric" });
}

/** "12 Mar" — compact list/card variant without the year. */
export function fmtShortDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString(LOCALE, { month: "short", day: "numeric" });
}

/** "12 Mar, 14:05" — compact date with time, used on screening cards. */
export function fmtShortDateTime(iso: string | Date): string {
  return new Date(iso).toLocaleDateString(LOCALE, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** "12 Mar 2025, 14:05" — full timestamp for detail screens. */
export function fmtDateTime(iso: string | Date): string {
  return new Date(iso).toLocaleString(LOCALE, { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** "Wednesday, 12 March 2025" — appointment headers. */
export function fmtFullDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString(LOCALE, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

/** "12 March 2025" — long month, used on patient records. */
export function fmtLongDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString(LOCALE, { year: "numeric", month: "long", day: "numeric" });
}

/** "March 2025" — report and analytics period labels. */
export function fmtMonthYear(iso: string | Date = new Date()): string {
  return new Date(iso).toLocaleDateString(LOCALE, { month: "long", year: "numeric" });
}

/** Short weekday label, e.g. "Wed". */
export function fmtWeekday(iso: string | Date): string {
  return new Date(iso).toLocaleDateString(LOCALE, { weekday: "short" });
}

/** Day-of-month only, e.g. "12". */
export function fmtDayNumber(iso: string | Date): string {
  return new Date(iso).toLocaleDateString(LOCALE, { day: "numeric" });
}

/** Short month only, e.g. "Mar". */
export function fmtMonth(iso: string | Date): string {
  return new Date(iso).toLocaleDateString(LOCALE, { month: "short" });
}

/** Seconds as mm:ss, for call timers. */
export function fmtDuration(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.floor(totalSeconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
