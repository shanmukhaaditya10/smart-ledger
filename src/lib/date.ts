/**
 * Month + date helpers. A "month key" is the string "YYYY-MM".
 * All month math is done in UTC to keep it deterministic regardless of the
 * server timezone (important for reproducible seeding and idempotent recurring
 * generation).
 */

export type MonthKey = string; // "YYYY-MM"

const MONTH_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isMonthKey(s: string): s is MonthKey {
  return MONTH_KEY_RE.test(s);
}

/** Month key for a date (UTC). */
export function monthKeyOf(date: Date): MonthKey {
  const y = date.getUTCFullYear();
  const m = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  return `${y}-${m}`;
}

/** Current month key (UTC). */
export function currentMonthKey(now = new Date()): MonthKey {
  return monthKeyOf(now);
}

/** Parse "YYYY-MM" into numeric year/month (1-based month). */
export function parseMonthKey(key: MonthKey): { year: number; month: number } {
  const [y, m] = key.split("-");
  return { year: Number(y), month: Number(m) };
}

/**
 * Half-open UTC range [start, end) covering the given month.
 * Query entries with `occurredAt >= start AND occurredAt < end`.
 */
export function monthRange(key: MonthKey): { start: Date; end: Date } {
  const { year, month } = parseMonthKey(key);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

/** Add `n` months to a month key. */
export function addMonths(key: MonthKey, n: number): MonthKey {
  const { year, month } = parseMonthKey(key);
  const d = new Date(Date.UTC(year, month - 1 + n, 1));
  return monthKeyOf(d);
}

/** Number of days in a given month key. */
export function daysInMonth(key: MonthKey): number {
  const { year, month } = parseMonthKey(key);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * The concrete UTC date on which a monthly rule fires within a month.
 * dayOfMonth is clamped to the last day (e.g. 31 -> 30 in April, 28/29 in Feb).
 */
export function ruleDateInMonth(key: MonthKey, dayOfMonth: number): Date {
  const { year, month } = parseMonthKey(key);
  const clamped = Math.min(Math.max(1, dayOfMonth), daysInMonth(key));
  return new Date(Date.UTC(year, month - 1, clamped));
}

/** Iterate month keys from `startKey` to `endKey` inclusive. */
export function monthsBetween(startKey: MonthKey, endKey: MonthKey): MonthKey[] {
  const out: MonthKey[] = [];
  let cur = startKey;
  // guard against infinite loop; ledgers won't span >1200 months
  for (let i = 0; i < 1200 && cur <= endKey; i++) {
    out.push(cur);
    cur = addMonths(cur, 1);
  }
  return out;
}

/** Format a Date as a friendly UTC day, e.g. "14 Jul 2026". */
export function formatDay(date: Date): string {
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
