import { addDaysYmd, ymdDayOfWeek, ymdInZone, zonedWallTime } from "./time";
import { TZDate } from "@date-fns/tz";

export type Recurrence = "NONE" | "DAILY" | "WEEKDAYS" | "WEEKLY";

/**
 * Next fire time strictly after `after`, preserving the wall-clock time of
 * `anchor` in `tz` (so DST shifts don't drift the reminder). Returns null for
 * one-time reminders.
 */
export function nextOccurrence(anchor: Date, recurrence: Recurrence, tz: string, after: Date): Date | null {
  if (recurrence === "NONE") return null;
  const z = new TZDate(anchor.getTime(), tz);
  const minutes = z.getHours() * 60 + z.getMinutes();
  const anchorDow = ymdDayOfWeek(ymdInZone(anchor, tz));
  let day = ymdInZone(after.getTime() > anchor.getTime() ? after : anchor, tz);
  for (let i = 0; i < 15; i++, day = addDaysYmd(day, 1)) {
    const candidate = zonedWallTime(day, minutes, tz);
    if (candidate <= after || candidate <= anchor) continue;
    const dow = ymdDayOfWeek(day);
    if (recurrence === "WEEKDAYS" && (dow === 0 || dow === 6)) continue;
    if (recurrence === "WEEKLY" && dow !== anchorDow) continue;
    return candidate;
  }
  return null;
}

/** Bounded exponential backoff for failed deliveries: 1m, 4m, 16m, then give up. */
export const MAX_DELIVERY_ATTEMPTS = 4;
export function retryDelayMs(attempt: number): number {
  return 60_000 * 4 ** Math.max(0, attempt - 1);
}
