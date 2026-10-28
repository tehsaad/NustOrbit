import { describe, expect, it } from "vitest";
import { currentAndNext, expandWeekly, findConflicts, findSlotConflicts, validateSlot, type WeeklySlot } from "@/domain/timetable";

const tz = "Asia/Karachi"; // UTC+5, no DST
const slot = (over: Partial<WeeklySlot> = {}): WeeklySlot => ({ id: "s1", title: "Calculus", dayOfWeek: 1, startTime: "09:00", endTime: "10:00", timezone: tz, ...over });

// 2026-11-02 is a Monday.
const from = new Date("2026-11-01T19:00:00Z"); // Mon 00:00 PKT
const to = new Date("2026-11-15T19:00:00Z");

describe("expandWeekly", () => {
  it("expands weekly recurrence in the slot timezone", () => {
    const occ = expandWeekly([slot()], from, to);
    expect(occ.map((o) => o.startsAt.toISOString())).toEqual(["2026-11-02T04:00:00.000Z", "2026-11-09T04:00:00.000Z"]);
  });
  it("respects validity windows", () => {
    const occ = expandWeekly([slot({ validUntil: new Date("2026-11-05T00:00:00Z") })], from, to);
    expect(occ).toHaveLength(1);
  });
  it("applies cancellations and adds make-up sessions", () => {
    const occ = expandWeekly([slot()], from, to, [
      { timetableEntryId: "s1", startsAt: new Date("2026-11-02T04:00:00Z"), endsAt: new Date("2026-11-02T05:00:00Z"), status: "CANCELLED" },
      { timetableEntryId: "s1", startsAt: new Date("2026-11-04T04:00:00Z"), endsAt: new Date("2026-11-04T05:00:00Z"), status: "SCHEDULED" },
    ]);
    expect(occ.map((o) => o.status)).toEqual(["CANCELLED", "SCHEDULED", "SCHEDULED"]);
  });
  it("keeps wall-clock time across a DST change in a DST zone", () => {
    // Europe/London leaves BST on 2026-10-25.
    const occ = expandWeekly([slot({ timezone: "Europe/London", dayOfWeek: 1 })], new Date("2026-10-18T00:00:00Z"), new Date("2026-10-28T00:00:00Z"));
    expect(occ.map((o) => o.startsAt.toISOString())).toEqual(["2026-10-19T08:00:00.000Z", "2026-10-26T09:00:00.000Z"]);
  });
  it("skips invalid slots", () => {
    expect(validateSlot({ dayOfWeek: 1, startTime: "10:00", endTime: "09:00" })).toMatch(/after/);
    expect(expandWeekly([slot({ startTime: "25:00" })], from, to)).toHaveLength(0);
  });
});

describe("conflicts", () => {
  it("detects overlapping weekly slots but not back-to-back ones", () => {
    const a = slot({ id: "a" });
    const b = slot({ id: "b", startTime: "09:30", endTime: "11:00" });
    const c = slot({ id: "c", startTime: "10:00", endTime: "11:00" });
    expect(findSlotConflicts([a, b, c]).map(([x, y]) => `${x.id}-${y.id}`)).toEqual(["a-b", "b-c"]);
  });
  it("detects overlapping dated intervals", () => {
    const d = (h: number) => new Date(Date.UTC(2026, 10, 2, h));
    const out = findConflicts([
      { id: "class", startsAt: d(4), endsAt: d(5) },
      { id: "event", startsAt: d(4), endsAt: d(6) },
      { id: "later", startsAt: d(6), endsAt: d(7) },
    ]);
    expect(out.map(([x, y]) => `${x.id}-${y.id}`)).toEqual(["class-event"]);
  });
});

describe("currentAndNext", () => {
  it("finds in-progress and next class, ignoring cancelled", () => {
    const occ = expandWeekly([slot(), slot({ id: "s2", title: "Physics", startTime: "11:00", endTime: "12:00" })], from, to);
    occ[0].status = "SCHEDULED";
    const r = currentAndNext(occ, new Date("2026-11-02T04:30:00Z"));
    expect(r.current?.title).toBe("Calculus");
    expect(r.next?.title).toBe("Physics");
  });
});
