import { TZDate } from "@date-fns/tz";

export const DEFAULT_TZ = "Asia/Karachi";

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Parses "HH:mm" (24h). Returns minutes since midnight or null. */
export function parseHm(value: string): number | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export type Ymd = { y: number; m: number; d: number };

/** Calendar date (in `tz`) of an instant. Month is 1-based. */
export function ymdInZone(instant: Date, tz: string): Ymd {
  const z = new TZDate(instant.getTime(), tz);
  return { y: z.getFullYear(), m: z.getMonth() + 1, d: z.getDate() };
}

/** Day of week (0=Sun) of an instant as observed in `tz`. */
export function dayOfWeekInZone(instant: Date, tz: string): number {
  return new TZDate(instant.getTime(), tz).getDay();
}

/** UTC instant for a wall-clock time on a calendar date in `tz`. */
export function zonedWallTime(ymd: Ymd, minutes: number, tz: string): Date {
  const z = new TZDate(ymd.y, ymd.m - 1, ymd.d, Math.floor(minutes / 60), minutes % 60, 0, 0, tz);
  return new Date(z.getTime());
}

/** [start, end) of the calendar day containing `instant`, as observed in `tz`. */
export function dayBounds(instant: Date, tz: string): { start: Date; end: Date } {
  const ymd = ymdInZone(instant, tz);
  const start = zonedWallTime(ymd, 0, tz);
  const next = addDaysYmd(ymd, 1);
  return { start, end: zonedWallTime(next, 0, tz) };
}

export function addDaysYmd(ymd: Ymd, days: number): Ymd {
  const d = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d + days));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

/** Day-of-week for a calendar date (timezone independent). */
export function ymdDayOfWeek(ymd: Ymd): number {
  return new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d)).getUTCDay();
}

export function compareYmd(a: Ymd, b: Ymd): number {
  return a.y - b.y || a.m - b.m || a.d - b.d;
}

/** [start, end) of the week containing `instant` in `tz`; weekStartsOn 0=Sun, 1=Mon. */
export function weekBounds(instant: Date, tz: string, weekStartsOn = 1): { start: Date; end: Date; startYmd: Ymd } {
  const ymd = ymdInZone(instant, tz);
  const dow = ymdDayOfWeek(ymd);
  const back = (dow - weekStartsOn + 7) % 7;
  const startYmd = addDaysYmd(ymd, -back);
  return { start: zonedWallTime(startYmd, 0, tz), end: zonedWallTime(addDaysYmd(startYmd, 7), 0, tz), startYmd };
}

export function formatInZone(instant: Date, tz: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, ...options }).format(instant);
}

/** "2h 05m", "3d 4h", "45m" style countdown. Negative durations return "now". */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return "now";
  const totalMin = Math.floor(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}m`;
}
