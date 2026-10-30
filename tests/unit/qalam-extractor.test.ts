import { describe, expect, it } from "vitest";
// The extension's pure extractor (UMD/CJS); the content script and these tests share it.
import Extractor from "../../extension/extractor.js";

const { normalizeTables, detectKind } = Extractor as {
  normalizeTables: (tables: unknown, kind: string) => { kind: string; rows: Record<string, string>[]; mapping: Record<string, string>; unmatchedHeaders: string[]; tableIndex: number; matchedColumns: string[] };
  detectKind: (tables: unknown) => string | null;
};

// Synthetic tables standing in for Qalam pages. These are NOT real Qalam markup —
// the aliases are calibration-pending until real HTML is shared.
const marksTable = {
  headers: ["Course", "Assessment", "Type", "Obtained", "Total", "Weightage", "Class Average"],
  rows: [
    ["CS-212 Data Structures", "Quiz 1", "Quiz", "8", "10", "2.5", "6.4"],
    ["CS-212 Data Structures", "Assignment 1", "Assignment", "18", "20", "5", "15"],
    ["", "", "", "", "", "", ""], // blank row should be dropped
  ],
};

const attendanceTable = {
  headers: ["Course", "Date", "Status", "Remarks"],
  rows: [["CS-212 Data Structures", "2026-10-05", "Present", "ok"]],
};

describe("Qalam extractor", () => {
  it("maps marks headers to canonical columns and drops blank rows", () => {
    const res = normalizeTables([marksTable], "marks");
    expect(res.rows).toHaveLength(2);
    expect(res.mapping.course).toBe("Course");
    expect(res.mapping.obtained).toBe("Obtained");
    expect(res.mapping.max).toBe("Total");
    expect(res.mapping.class_average).toBe("Class Average");
    expect(res.rows[0]).toMatchObject({ course: "CS-212 Data Structures", assessment: "Quiz 1", obtained: "8", max: "10" });
  });

  it("picks the best table among several and reports ignored headers", () => {
    const res = normalizeTables([attendanceTable, marksTable], "marks");
    expect(res.tableIndex).toBe(1); // the marks table, not attendance
    expect(res.unmatchedHeaders).not.toContain("Course");
  });

  it("auto-detects the kind of a page", () => {
    expect(detectKind([marksTable])).toBe("marks");
    expect(detectKind([attendanceTable])).toBe("attendance");
  });

  it("returns no rows when nothing matches (never fabricates)", () => {
    const junk = { headers: ["Foo", "Bar"], rows: [["1", "2"]] };
    const res = normalizeTables([junk], "marks");
    expect(res.rows).toHaveLength(0);
    expect(res.tableIndex).toBe(-1);
    expect(detectKind([junk])).toBeNull();
  });
});
