import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/server/db";
import { csvRecords } from "@/domain/csv";
import { parseHm, zonedWallTime } from "@/domain/time";

/**
 * Qalam adapter. Qalam exposes no documented student API and sits behind a
 * Cloudflare bot challenge (a plain request returns HTTP 403), so Orbit never
 * scrapes it server-side and never accepts a Qalam password. Two supported
 * paths put the data in, and both land here through `importQalamRecords`:
 *
 *   1. CSV files the student prepares from their own Qalam pages.
 *   2. The Orbit browser extension, which reads the student's own open Qalam
 *      pages in their logged-in browser and POSTs normalized rows to the
 *      ingest endpoint (see docs/qalam-integration.md).
 *
 * Both use `source: "IMPORT"` and the same deterministic `key()`, so a student
 * who uses both does not get duplicate rows (the unique key is
 * userId_source_externalId). A per-record stale guard means an import carrying
 * data observed *earlier* than what is already stored never overwrites it.
 */
export type QalamImportKind = "marks" | "attendance" | "timetable" | "results" | "deadlines";

/** Every Qalam-sourced record is labelled with this source. Shared by CSV + extension. */
export const QALAM_SOURCE = "IMPORT" as const;

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
export type QalamRow = Record<string, string>;

/**
 * Minimal view of a Prisma model delegate that carries a `syncedAt` column and
 * the `userId_source_externalId` unique key. Lets one guarded-write helper serve
 * every Qalam record type without repeating the stale check five times.
 */
interface SyncedDelegate {
  findUnique(args: { where: Record<string, unknown>; select: { syncedAt: true } }): Promise<{ syncedAt: Date | null } | null>;
  create(args: { data: Record<string, unknown> }): Promise<unknown>;
  update(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<unknown>;
}

/**
 * Create the record, or update it unless what is stored was observed *after* the
 * incoming data (`extractedAt`), in which case the newer stored row is kept.
 * Returns false only when an existing newer row was left untouched.
 */
async function writeGuarded(delegate: SyncedDelegate, userId: string, externalId: string, data: Record<string, unknown>, extractedAt: Date): Promise<boolean> {
  const where = { userId_source_externalId: { userId, source: QALAM_SOURCE, externalId } };
  const existing = await delegate.findUnique({ where, select: { syncedAt: true } });
  if (!existing) {
    await delegate.create({ data: { userId, source: QALAM_SOURCE, externalId, ...data } });
    return true;
  }
  if (existing.syncedAt && existing.syncedAt > extractedAt) return false; // stored data is newer — keep it
  await delegate.update({ where, data });
  return true;
}

async function courseFor(userId: string, label: string, cache: Map<string, string>): Promise<string> {
  const k = label.toLowerCase();
  const hit = cache.get(k);
  if (hit) return hit;
  const m = /^([A-Z]{2,5}[- ]?\d{2,4})\s*[-:·]?\s*(.*)$/i.exec(label);
  const code = m ? m[1].toUpperCase().replace(" ", "-") : null;
  const name = m && m[2] ? m[2] : label;
  // Prefer matching on course code when the label has one (scraped labels vary in
  // spacing/suffix), falling back to a case-insensitive name match.
  const existing = await db.course.findFirst({
    where: { userId, OR: [...(code ? [{ code }] : []), { name: { equals: name, mode: "insensitive" as const } }] },
    select: { id: true },
  });
  const id = existing?.id ?? (await db.course.create({ data: { userId, name, code, source: QALAM_SOURCE, externalId: key("course", label) } })).id;
  cache.set(k, id);
  return id;
}

/**
 * Normalize + persist already-parsed Qalam rows. Shared by the CSV importer and
 * the extension ingest endpoint. `extractedAt` is when the data was observed
 * (now, for a CSV upload; the page-read time, for the extension) and both marks
 * each row's `syncedAt` and drives the stale guard.
 */
export async function importQalamRecords(userId: string, kind: QalamImportKind, rows: QalamRow[], tz: string, extractedAt: Date = new Date()): Promise<ImportReport> {
  const report: ImportReport = { imported: 0, skipped: [] };
  const courses = new Map<string, string>();
  // Rows without a time that share course + date are told apart by their order in the batch.
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
          classAverageSrc: num(r.class_average) == null ? null : (QALAM_SOURCE as "IMPORT"),
          syncedAt: extractedAt,
        };
        await writeGuarded(db.assessment as unknown as SyncedDelegate, userId, key("marks", r.course, r.assessment), data, extractedAt);
      } else if (kind === "attendance") {
        const status = (r.status ?? "").toUpperCase();
        if (!["PRESENT", "ABSENT", "LEAVE", "LATE"].includes(status)) throw new Error("Status must be PRESENT/ABSENT/LEAVE/LATE");
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(r.date ?? "");
        if (!m) throw new Error("Date must be YYYY-MM-DD");
        if (r.time && parseHm(r.time) == null) throw new Error("Time must be HH:mm");
        const date = zonedWallTime({ y: +m[1], m: +m[2], d: +m[3] }, r.time ? parseHm(r.time)! : 12 * 60, tz);
        const sessions = Math.max(1, Math.min(6, num(r.sessions) ?? 1));
        const dayKey = `${r.course.toLowerCase()}|${r.date}`;
        const ordinal = r.time ? r.time : `#${(sameDaySeen.get(dayKey) ?? 0) + 1}`;
        if (!r.time) sameDaySeen.set(dayKey, (sameDaySeen.get(dayKey) ?? 0) + 1);
        const data = { courseId, date, status: status as "PRESENT", sessions, syncedAt: extractedAt };
        await writeGuarded(db.attendanceRecord as unknown as SyncedDelegate, userId, key("att", r.course, r.date, ordinal), data, extractedAt);
      } else if (kind === "timetable") {
        const day = DAYS.indexOf((r.day ?? "").toLowerCase());
        if (day < 0) throw new Error("Day must be Monday–Sunday");
        if (parseHm(r.start ?? "") == null || parseHm(r.end ?? "") == null || parseHm(r.end)! <= parseHm(r.start)!) throw new Error("Invalid start/end");
        const data = { courseId, title: r.course, dayOfWeek: day, startTime: r.start, endTime: r.end, timezone: tz, room: r.room || null, instructor: r.instructor || null, kind: (r.kind || "LECTURE").toUpperCase(), syncedAt: extractedAt };
        await writeGuarded(db.timetableEntry as unknown as SyncedDelegate, userId, key("tt", r.course, day, r.start), data, extractedAt);
      } else if (kind === "deadlines") {
        const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}:\d{2}))?$/.exec(r.due ?? "");
        if (!r.title || !m) throw new Error("Needs title and due as YYYY-MM-DD HH:mm");
        const minutes = parseHm(m[4] ?? "23:59");
        if (minutes == null) throw new Error("Invalid due time");
        const dueAt = zonedWallTime({ y: +m[1], m: +m[2], d: +m[3] }, minutes, tz);
        const url = r.url && /^https:\/\//.test(r.url) ? r.url : null;
        const data = { courseId, title: r.title, dueAt, maxMarks: num(r.max), weightPct: num(r.weight), url, syncedAt: extractedAt };
        // universityStatus is left at its default (UNKNOWN) and never set from an import.
        await writeGuarded(db.assignment as unknown as SyncedDelegate, userId, key("due", r.course, r.title), data, extractedAt);
      } else {
        const credits = num(r.credit_hours);
        if (credits != null) await db.course.update({ where: { id: courseId }, data: { creditHours: credits } });
        const data = { courseId, term: r.term || null, letter: r.grade || null, gradePoints: num(r.grade_points), syncedAt: extractedAt };
        await writeGuarded(db.grade as unknown as SyncedDelegate, userId, key("res", r.term, r.course), data, extractedAt);
      }
      report.imported++;
    } catch (e) {
      report.skipped.push({ row: rowNo, reason: e instanceof Error ? e.message : "Invalid row" });
    }
  }
  return report;
}

/** CSV wrapper: parse the uploaded text into rows, then import them as "now". */
export async function importQalamCsv(userId: string, kind: QalamImportKind, text: string, tz: string): Promise<ImportReport> {
  return importQalamRecords(userId, kind, csvRecords(text), tz);
}
