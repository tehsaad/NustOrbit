import { describe, expect, it } from "vitest";
import { attendanceOutlook, summarizeAttendance, type AttendanceMark } from "@/domain/attendance";

const rec = (s: AttendanceMark, n = 1) => ({ status: s, sessions: n });

describe("summarizeAttendance", () => {
  it("counts sessions with multi-hour records", () => {
    const s = summarizeAttendance([rec("PRESENT", 3), rec("ABSENT"), rec("PRESENT")]);
    expect(s).toMatchObject({ attended: 4, missed: 1, total: 5, pct: 80 });
  });
  it("applies configurable late/leave policy", () => {
    const records = [rec("PRESENT"), rec("LATE"), rec("LEAVE"), rec("ABSENT")];
    expect(summarizeAttendance(records, { thresholdPct: 75, lateCountsAs: "absent", leaveCountsAs: "excluded" })).toMatchObject({
      attended: 1,
      missed: 2,
      excluded: 1,
      total: 3,
    });
  });
  it("returns null percentage with no records", () => {
    expect(summarizeAttendance([]).pct).toBeNull();
  });
});

describe("attendanceOutlook", () => {
  it("never assumes a threshold", () => {
    expect(attendanceOutlook(summarizeAttendance([rec("PRESENT")]), null).kind).toBe("no-threshold");
  });
  it("computes safe absences", () => {
    // 18/20 at 75%: 18/(20+k) >= .75 -> k <= 4
    const s = { attended: 18, missed: 2, excluded: 0, total: 20, pct: 90 };
    const o = attendanceOutlook(s, 75);
    expect(o).toMatchObject({ kind: "safe", canMiss: 4 });
  });
  it("computes recovery sessions when below threshold", () => {
    // 10/16 = 62.5%, need (10+n)/(16+n) >= .75 -> n >= 8
    const o = attendanceOutlook({ attended: 10, missed: 6, excluded: 0, total: 16, pct: 62.5 }, 75);
    expect(o).toMatchObject({ kind: "at-risk", mustAttend: 8 });
  });
  it("uses the planned term total when known", () => {
    // 30 planned, 75% -> need 23 attended. 10 attended of 12, 18 remain: can miss 10+18-23 = 5
    expect(attendanceOutlook({ attended: 10, missed: 2, excluded: 0, total: 12, pct: 83.33 }, 75, 30)).toMatchObject({ kind: "term", canMissRestOfTerm: 5 });
    expect(attendanceOutlook({ attended: 2, missed: 10, excluded: 0, total: 12, pct: 16.67 }, 75, 30).kind).toBe("term-unreachable");
  });
  it("handles exact boundary without float drift", () => {
    expect(attendanceOutlook({ attended: 3, missed: 1, excluded: 0, total: 4, pct: 75 }, 75)).toMatchObject({ kind: "safe", canMiss: 0 });
  });
});
