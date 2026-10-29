import { describe, expect, it } from "vitest";
import { dayBounds, formatCountdown, isValidTimeZone, weekBounds, zonedWallTime } from "@/domain/time";
import { dueBucket, isConfirmedSubmitted, matchesFilter } from "@/domain/deadlines";
import { nextOccurrence, retryDelayMs } from "@/domain/reminders";
import { freshness } from "@/domain/freshness";

const tz = "Asia/Karachi";

describe("time", () => {
  it("computes day bounds in the configured zone", () => {
    const b = dayBounds(new Date("2026-11-02T20:00:00Z"), tz); // Tue 01:00 PKT
    expect(b.start.toISOString()).toBe("2026-11-02T19:00:00.000Z");
    expect(b.end.toISOString()).toBe("2026-11-03T19:00:00.000Z");
  });
  it("computes Monday-start weeks", () => {
    const w = weekBounds(new Date("2026-11-05T06:00:00Z"), tz, 1);
    expect(w.start.toISOString()).toBe("2026-11-01T19:00:00.000Z");
  });
  it("is configurable to other zones", () => {
    expect(zonedWallTime({ y: 2026, m: 11, d: 2 }, 9 * 60, "UTC").toISOString()).toBe("2026-11-02T09:00:00.000Z");
    expect(isValidTimeZone("Asia/Karachi")).toBe(true);
    expect(isValidTimeZone("Mars/Base")).toBe(false);
  });
  it("formats countdowns", () => {
    expect(formatCountdown(125 * 60000)).toBe("2h 05m");
    expect(formatCountdown(-1)).toBe("now");
    expect(formatCountdown(3 * 86400000 + 3600000)).toBe("3d 1h");
  });
});

describe("deadlines", () => {
  const now = new Date("2026-11-04T07:00:00Z"); // Wed 12:00 PKT
  it("buckets due dates in local time", () => {
    expect(dueBucket(new Date("2026-11-04T06:00:00Z"), now, tz)).toBe("overdue");
    expect(dueBucket(new Date("2026-11-04T18:59:00Z"), now, tz)).toBe("today");
    expect(dueBucket(new Date("2026-11-04T19:00:00Z"), now, tz)).toBe("this-week");
    expect(dueBucket(new Date("2026-11-09T05:00:00Z"), now, tz)).toBe("later");
    expect(dueBucket(null, now, tz)).toBe("no-date");
  });
  it("only treats university-confirmed status as submitted", () => {
    const mine = { dueAt: new Date("2026-11-03T00:00:00Z"), universityStatus: "UNKNOWN" as const, personalStatus: "DONE" as const };
    expect(isConfirmedSubmitted(mine)).toBe(false);
    expect(matchesFilter(mine, "overdue", now, tz)).toBe(true);
    expect(matchesFilter({ ...mine, universityStatus: "SUBMITTED" }, "overdue", now, tz)).toBe(false);
    expect(matchesFilter({ ...mine, universityStatus: "GRADED" }, "graded", now, tz)).toBe(true);
  });
});

describe("reminders", () => {
  const anchor = new Date("2026-11-02T03:00:00Z"); // Mon 08:00 PKT
  it("returns null for one-time reminders", () => {
    expect(nextOccurrence(anchor, "NONE", tz, anchor)).toBeNull();
  });
  it("advances daily, weekdays and weekly at the same wall time", () => {
    expect(nextOccurrence(anchor, "DAILY", tz, anchor)?.toISOString()).toBe("2026-11-03T03:00:00.000Z");
    const fri = new Date("2026-11-06T03:00:00Z");
    expect(nextOccurrence(anchor, "WEEKDAYS", tz, fri)?.toISOString()).toBe("2026-11-09T03:00:00.000Z");
    expect(nextOccurrence(anchor, "WEEKLY", tz, anchor)?.toISOString()).toBe("2026-11-09T03:00:00.000Z");
  });
  it("catches up after downtime without firing in the past", () => {
    const later = new Date("2026-11-20T10:00:00Z");
    expect(nextOccurrence(anchor, "DAILY", tz, later)?.toISOString()).toBe("2026-11-21T03:00:00.000Z");
  });
  it("uses bounded exponential backoff", () => {
    expect([1, 2, 3].map(retryDelayMs)).toEqual([60000, 240000, 960000]);
  });
});

describe("freshness", () => {
  const now = new Date("2026-11-04T07:00:00Z");
  it("labels never/fresh/aging/stale honestly", () => {
    expect(freshness(null, now).level).toBe("never");
    expect(freshness(new Date(now.getTime() - 5 * 60000), now)).toEqual({ level: "fresh", label: "Synced 5m ago" });
    expect(freshness(new Date(now.getTime() - 3 * 3600000), now).level).toBe("aging");
    expect(freshness(new Date(now.getTime() - 3 * 86400000), now).level).toBe("stale");
  });
});
