import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/server/db";
import { csvRecords } from "@/domain/csv";
import { parseHm, zonedWallTime } from "@/domain/time";

/**
 * Qalam adapter. Qalam (Odoo-based ERP) exposes no documented student API and
 * sits behind a bot challenge, so Orbit does not scrape it or accept Qalam
 * passwords. The supported path is importing CSV files the student prepares
 * from their own Qalam pages. Imported rows are labelled IMPORT, keep a stable
 * externalId (hash of their natural key) and re-imports update instead of duplicating.
 */
export type QalamImportKind = "marks" | "attendance" | "timetable" | "results" | "deadlines";

export const QALAM_TEMPLATES: Record<QalamImportKind, { columns: string[]; example: string; help: string }> = {
  marks: {
    columns: ["course", "assessment", "category", "obtained", "max", "weight", "class_average"],
    example: "CS-212 Data Structures,Quiz 1,QUIZ,8,10,2.5,6.4",
    help: "One row per assessment. Weight is the % of the course total (leave blank if unknown). Class average only if Qalam shows it.",
  },
  attendance: {
    columns: ["course", "date", "time", "status", "sessions"],
    example: "CS-212 Data Structures,2026-10-05,09:00,PRESENT,1",
    help: "Status is PRESENT, ABSENT, LEAVE or LATE. Date as YYYY-MM-DD. Time (HH:mm) is optional but tells apart two classes on the same day. Sessions = contact hours the entry counts for.",
  },
  timetable: {
    columns: ["course", "day", "start", "end", "room", "instructor", "kind"],
    example: "CS-212 Data Structures,Monday,09:00,09:50,CR-12,Dr. Example,LECTURE",
    help: "Day as Monday–Sunday. Times in 24h HH:mm local time.",
  },
  deadlines: {
    columns: ["course", "title", "due", "max", "weight", "url"],
    example: "CS-212 Data Structures,Assignment 2,2026-11-12 23:59,10,5,",
    help: "Due as YYYY-MM-DD HH:mm (or YYYY-MM-DD for 23:59) in your timezone. Submission status stays Unknown: a file can't confirm a submission.",
  },
  results: {
    columns: ["term", "course", "credit_hours", "grade", "grade_points"],
    example: "Fall 2026,CS-212 Data Structures,4,A,4.0",
    help: "Copy official results exactly. Orbit never converts percentages to grades.",
  },
};

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const key = (...parts: (string | number | undefined)[]) => "qalam-" + createHash("sha256").update(parts.join("|").toLowerCase()).digest("hex").slice(0, 32);
const num = (v: string | undefined) => (v == null || v === "" || Number.isNaN(Number(v)) ? null : Number(v));

export type ImportReport = { imported: number; skipped: { row: number; reason: string }[] };

async function courseFor(userId: string, label: string, cache: Map<string, string>): Promise<string> {
  const k = label.toLowerCase();
  const hit = cache.get(k);
  if (hit) return hit;
  const m = /^([A-Z]{2,5}[- ]?\d{2,4})\s*[-:·]?\s*(.*)$/i.exec(label);
  const code = m ? m[1].toUpperCase().replace(" ", "-") : null;
  const name = m && m[2] ? m[2] : label;
  const existing = await db.course.findFirst({
    where: { userId, OR: [...(code ? [{ code }] : []), { name: { equals: name, mode: "insensitive" as const } }] },
    select: { id: true },
  });
  const id = existing?.id ?? (await db.course.create({ data: { userId, name, code, source: "IMPORT", externalId: key("course", label) } })).id;
  cache.set(k, id);
  return id;
}

export async function importQalamCsv(userId: string, kind: QalamImportKind, text: string, tz: string): Promise<ImportReport> {
  const rows = csvRecords(text);
  const report: ImportReport = { imported: 0, skipped: [] };
  const courses = new Map<string, string>();
  const now = new Date();
  // Rows without a time that share course + date are told apart by their order in the file.
  const sameDaySeen = new Map<string, number>();
  for (const [i, r] of rows.entries()) {
    const rowNo = i + 2;
    try {
      if (!r.course) throw new Error("Missing course");
      const courseId = await courseFor(userId, r.course, courses);
      if (kind === "marks") {
        const max = num(r.max);
        if (!r.assessment || !max || max <= 0) throw new Error("Needs assessment and max > 0");
        const category = (r.category ?? "OTHER").toUpperCase();
        const data = {
          courseId,
          title: r.assessment,
          category: (["QUIZ", "ASSIGNMENT", "MIDTERM", "FINAL", "LAB", "PROJECT", "PRESENTATION"].includes(category) ? category : "OTHER") as "OTHER",
          obtainedMarks: num(r.obtained),
          maxMarks: max,
          weightPct: num(r.weight),
          classAverage: num(r.class_average),
          classAverageSrc: num(r.class_average) == null ? null : ("IMPORT" as const),
          syncedAt: now,
        };
        const externalId = key("marks", r.course, r.assessment);
        await db.assessment.upsert({ where: { userId_source_externalId: { userId, source: "IMPORT", externalId } }, create: { userId, source: "IMPORT", externalId, ...data }, update: data });
      } else if (kind === "attendance") {
        const status = (r.status ?? "").toUpperCase();
        if (!["PRESENT", "ABSENT", "LEAVE", "LATE"].includes(status)) throw new Error("Status must be PRESENT/ABSENT/LEAVE/LATE");
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(r.date ?? "");
        if (!m) throw new Error("Date must be YYYY-MM-DD");
        const date = zonedWallTime({ y: +m[1], m: +m[2], d: +m[3] }, r.time ? parseHm(r.time)! : 12 * 60, tz);
        const sessions = Math.max(1, Math.min(6, num(r.sessions) ?? 1));
        if (r.time && parseHm(r.time) == null) throw new Error("Time must be HH:mm");
        const dayKey = `${r.course.toLowerCase()}|${r.date}`;
        const ordinal = r.time ? r.time : `#${(sameDaySeen.get(dayKey) ?? 0) + 1}`;
        if (!r.time) sameDaySeen.set(dayKey, (sameDaySeen.get(dayKey) ?? 0) + 1);
        const externalId = key("att", r.course, r.date, ordinal);
        const data = { courseId, date, status: status as "PRESENT", sessions, syncedAt: now };
        await db.attendanceRecord.upsert({ where: { userId_source_externalId: { userId, source: "IMPORT", externalId } }, create: { userId, source: "IMPORT", externalId, ...data }, update: data });
      } else if (kind === "timetable") {
        const day = DAYS.indexOf((r.day ?? "").toLowerCase());
        if (day < 0) throw new Error("Day must be Monday–Sunday");
        if (parseHm(r.start ?? "") == null || parseHm(r.end ?? "") == null || parseHm(r.end)! <= parseHm(r.start)!) throw new Error("Invalid start/end");
        const externalId = key("tt", r.course, day, r.start);
        const data = { courseId, title: r.course, dayOfWeek: day, startTime: r.start, endTime: r.end, timezone: tz, room: r.room || null, instructor: r.instructor || null, kind: (r.kind || "LECTURE").toUpperCase(), syncedAt: now };
        await db.timetableEntry.upsert({ where: { userId_source_externalId: { userId, source: "IMPORT", externalId } }, create: { userId, source: "IMPORT", externalId, ...data }, update: data });
      } else if (kind === "deadlines") {
        const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}:\d{2}))?$/.exec(r.due ?? "");
        if (!r.title || !m) throw new Error("Needs title and due as YYYY-MM-DD HH:mm");
        const minutes = parseHm(m[4] ?? "23:59");
        if (minutes == null) throw new Error("Invalid due time");
        const dueAt = zonedWallTime({ y: +m[1], m: +m[2], d: +m[3] }, minutes, tz);
        const externalId = key("due", r.course, r.title);
        const url = r.url && /^https:\/\//.test(r.url) ? r.url : null;
        const data = { courseId, title: r.title, dueAt, maxMarks: num(r.max), weightPct: num(r.weight), url, syncedAt: now };
        // universityStatus is left at its default (UNKNOWN) and never set from a file.
        await db.assignment.upsert({ where: { userId_source_externalId: { userId, source: "IMPORT", externalId } }, create: { userId, source: "IMPORT", externalId, ...data }, update: data });
      } else {
        const credits = num(r.credit_hours);
        if (credits != null) await db.course.update({ where: { id: courseId }, data: { creditHours: credits } });
        const externalId = key("res", r.term, r.course);
        const data = { courseId, term: r.term || null, letter: r.grade || null, gradePoints: num(r.grade_points), syncedAt: now };
        await db.grade.upsert({ where: { userId_source_externalId: { userId, source: "IMPORT", externalId } }, create: { userId, source: "IMPORT", externalId, ...data }, update: data });
      }
      report.imported++;
    } catch (e) {
      report.skipped.push({ row: rowNo, reason: e instanceof Error ? e.message : "Invalid row" });
    }
  }
  return report;
}
