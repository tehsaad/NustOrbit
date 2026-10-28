import { addDaysYmd, compareYmd, parseHm, ymdDayOfWeek, ymdInZone, zonedWallTime, type Ymd } from "./time";

export type WeeklySlot = {
  id: string;
  title: string;
  courseId?: string | null;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  timezone: string;
  room?: string | null;
  validFrom?: Date | null;
  validUntil?: Date | null;
};

export type SlotOverride = {
  timetableEntryId: string | null;
  /** The original occurrence start this override applies to (for cancel/reschedule), or a new session. */
  startsAt: Date;
  endsAt: Date;
  status: "SCHEDULED" | "CANCELLED" | "RESCHEDULED" | "HOLIDAY";
};

export type Occurrence = {
  slotId: string;
  title: string;
  courseId?: string | null;
  room?: string | null;
  startsAt: Date;
  endsAt: Date;
  status: "SCHEDULED" | "CANCELLED" | "HOLIDAY";
};

export function validateSlot(slot: Pick<WeeklySlot, "dayOfWeek" | "startTime" | "endTime">): string | null {
  if (!Number.isInteger(slot.dayOfWeek) || slot.dayOfWeek < 0 || slot.dayOfWeek > 6) return "Day of week must be 0–6.";
  const s = parseHm(slot.startTime);
  const e = parseHm(slot.endTime);
  if (s == null || e == null) return "Times must use 24-hour HH:mm.";
  if (e <= s) return "End time must be after start time.";
  return null;
}

/**
 * Expand weekly slots into concrete occurrences within [from, to).
 * Each slot is expanded in its own timezone so wall-clock times stay fixed.
 * Overrides:
 * - CANCELLED / HOLIDAY / RESCHEDULED whose startsAt equals a generated occurrence
 *   mark that occurrence (RESCHEDULED shows as cancelled at the old time).
 * - SCHEDULED overrides are extra sessions (make-up classes, the new time of a
 *   rescheduled class) and are added as-is.
 */
export function expandWeekly(slots: WeeklySlot[], from: Date, to: Date, overrides: SlotOverride[] = []): Occurrence[] {
  const out: Occurrence[] = [];
  const key = (slotId: string | null, start: Date) => `${slotId ?? ""}|${start.getTime()}`;
  const marks = new Map(overrides.filter((o) => o.status !== "SCHEDULED").map((o) => [key(o.timetableEntryId, o.startsAt), o.status]));

  for (const slot of slots) {
    if (validateSlot(slot)) continue;
    const startMin = parseHm(slot.startTime)!;
    const endMin = parseHm(slot.endTime)!;
    // Iterate calendar dates in the slot's zone, padded by a day for zone offsets.
    let day: Ymd = addDaysYmd(ymdInZone(from, slot.timezone), -1);
    const last: Ymd = addDaysYmd(ymdInZone(to, slot.timezone), 1);
    for (; compareYmd(day, last) <= 0; day = addDaysYmd(day, 1)) {
      if (ymdDayOfWeek(day) !== slot.dayOfWeek) continue;
      const startsAt = zonedWallTime(day, startMin, slot.timezone);
      const endsAt = zonedWallTime(day, endMin, slot.timezone);
      if (endsAt <= from || startsAt >= to) continue;
      if (slot.validFrom && endsAt <= slot.validFrom) continue;
      if (slot.validUntil && startsAt >= slot.validUntil) continue;
      const mark = marks.get(key(slot.id, startsAt));
      const status: Occurrence["status"] = mark === "HOLIDAY" ? "HOLIDAY" : mark ? "CANCELLED" : "SCHEDULED";
      out.push({ slotId: slot.id, title: slot.title, courseId: slot.courseId, room: slot.room, startsAt, endsAt, status });
    }
  }
  for (const ov of overrides) {
    if (ov.status !== "SCHEDULED" || ov.endsAt <= from || ov.startsAt >= to) continue;
    const slot = slots.find((s) => s.id === ov.timetableEntryId);
    out.push({ slotId: ov.timetableEntryId ?? "extra", title: slot?.title ?? "Extra session", courseId: slot?.courseId, room: slot?.room, startsAt: ov.startsAt, endsAt: ov.endsAt, status: "SCHEDULED" });
  }
  return out.sort((x, y) => x.startsAt.getTime() - y.startsAt.getTime());
}

export type Interval = { id: string; startsAt: Date; endsAt: Date; label?: string };

/** All pairs of overlapping intervals (touching end==start is not a conflict). */
export function findConflicts<T extends Interval>(items: T[]): [T, T][] {
  const sorted = [...items].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const out: [T, T][] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].startsAt >= sorted[i].endsAt) break;
      out.push([sorted[i], sorted[j]]);
    }
  }
  return out;
}

/** Weekly-slot conflicts, independent of dates (same day, overlapping wall times, same zone). */
export function findSlotConflicts(slots: WeeklySlot[]): [WeeklySlot, WeeklySlot][] {
  const out: [WeeklySlot, WeeklySlot][] = [];
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      const a = slots[i];
      const b = slots[j];
      if (a.dayOfWeek !== b.dayOfWeek || a.timezone !== b.timezone) continue;
      if (parseHm(a.startTime)! < parseHm(b.endTime)! && parseHm(b.startTime)! < parseHm(a.endTime)!) out.push([a, b]);
    }
  }
  return out;
}

/** The class in progress (if any) and the next upcoming scheduled one. */
export function currentAndNext(occurrences: Occurrence[], now: Date): { current: Occurrence | null; next: Occurrence | null } {
  const live = occurrences.filter((o) => o.status === "SCHEDULED");
  const current = live.find((o) => o.startsAt <= now && o.endsAt > now) ?? null;
  const next = live.find((o) => o.startsAt > now) ?? null;
  return { current, next };
}
