import { describe, expect, it, vi, afterEach } from "vitest";
import { db } from "@/server/db";
import { importLmsData, MoodleCalendarFeedProvider, syncLms } from "@/server/integrations/providers/lms";
import { importQalamCsv } from "@/server/integrations/providers/qalam";
import { runSync } from "@/server/integrations/sync";
import { ProviderAuthError, ProviderUnavailableError } from "@/server/integrations/errors";
import { putCredential, getCredential, deleteCredentials } from "@/server/integrations/credentials";
import { coursesWithStats } from "@/server/queries/courses";
import { FEED, makeUser } from "./helpers";

afterEach(() => vi.unstubAllGlobals());

describe("LMS import", () => {
  it("is idempotent across repeated syncs (no duplicates)", async () => {
    const userId = await makeUser("lms");
    const first = await importLmsData(userId, new MoodleCalendarFeedProvider(async () => FEED));
    expect(first.created).toBe(4); // 2 courses + 1 assignment + 1 event
    const second = await importLmsData(userId, new MoodleCalendarFeedProvider(async () => FEED));
    expect(second.created).toBe(0);
    expect(await db.course.count({ where: { userId } })).toBe(2);
    expect(await db.assignment.count({ where: { userId } })).toBe(1);
    expect(await db.calendarEvent.count({ where: { userId } })).toBe(1);
    const a = await db.assignment.findFirstOrThrow({ where: { userId } });
    expect(a.title).toBe("Lab 4");
    // A calendar feed never proves submission.
    expect(a.universityStatus).toBe("UNKNOWN");
    const ev = await db.calendarEvent.findFirstOrThrow({ where: { userId } });
    expect(ev.readOnly).toBe(true);
    expect(ev.kind).toBe("QUIZ");
  });

  it("keeps each user's data isolated", async () => {
    const a = await makeUser("iso-a");
    const b = await makeUser("iso-b");
    await importLmsData(a, new MoodleCalendarFeedProvider(async () => FEED));
    await importLmsData(b, new MoodleCalendarFeedProvider(async () => FEED));
    expect(await db.assignment.count({ where: { userId: a } })).toBe(1);
    expect(await db.assignment.count({ where: { userId: b } })).toBe(1);
    const aCourses = await coursesWithStats(a);
    expect(aCourses.every((c) => c.userId === a)).toBe(true);
  });

  it("fetches the stored feed only from the allowlisted host", async () => {
    const userId = await makeUser("feed");
    const conn = await db.integrationConnection.create({ data: { userId, provider: "lms", status: "CONNECTED" } });
    await putCredential(conn.id, "ical_url", "https://evil.example.com/feed.ics");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const r = await runSync(conn, "manual", syncLms);
    expect(r.status).toBe("FAILED");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect((await db.integrationConnection.findUniqueOrThrow({ where: { id: conn.id } })).lastError).toMatch(/lms\.example\.edu/);
  });

  it("syncs a feed over https from the allowlisted host", async () => {
    const userId = await makeUser("feed-ok");
    const conn = await db.integrationConnection.create({ data: { userId, provider: "lms", status: "CONNECTED" } });
    await putCredential(conn.id, "ical_url", "https://lms.example.edu/calendar/export_execute.php?userid=1&authtoken=abc");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(FEED, { status: 200, headers: { "content-type": "text/calendar" } })));
    const r = await runSync(conn, "cron", syncLms);
    expect(r.status).toBe("SUCCESS");
    const after = await db.integrationConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(after.lastSuccessAt).not.toBeNull();
    expect(after.syncLockedUntil).toBeNull();
  });
});

describe("LMS TLS compatibility", () => {
  it("explains the legacy-renegotiation refusal instead of reporting an outage", async () => {
    const userId = await makeUser("tls");
    const conn = await db.integrationConnection.create({ data: { userId, provider: "lms", status: "CONNECTED" } });
    await putCredential(conn.id, "ical_url", "https://lms.example.edu/calendar/export_execute.php?authtoken=x");
    const err = Object.assign(new TypeError("fetch failed"), { cause: Object.assign(new Error("unsafe legacy renegotiation disabled"), { code: "ERR_SSL_UNSAFE_LEGACY_RENEGOTIATION_DISABLED" }) });
    vi.stubGlobal("fetch", vi.fn(async () => { throw err; }));
    const r = await runSync(conn, "manual", syncLms);
    expect(r.status).toBe("FAILED");
    const after = await db.integrationConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(after.lastError).toMatch(/outdated TLS/);
    expect(after.status).toBe("ERROR");
  });
});

describe("runSync bookkeeping", () => {
  it("prevents concurrent duplicate runs with a lease", async () => {
    const userId = await makeUser("lease");
    const conn = await db.integrationConnection.create({ data: { userId, provider: "lms", status: "CONNECTED" } });
    const slow = () => new Promise<{ created: number; updated: number }>((r) => setTimeout(() => r({ created: 0, updated: 0 }), 300));
    const [a, b] = await Promise.all([runSync(conn, "manual", slow), runSync(conn, "cron", slow)]);
    expect([a.status, b.status].sort()).toEqual(["SKIPPED", "SUCCESS"]);
    expect(await db.syncRun.count({ where: { connectionId: conn.id } })).toBe(1);
  });

  it("pauses on expired/revoked authorization (NEEDS_REAUTH)", async () => {
    const userId = await makeUser("auth");
    const conn = await db.integrationConnection.create({ data: { userId, provider: "gmail", status: "CONNECTED" } });
    const r = await runSync(conn, "cron", async () => {
      throw new ProviderAuthError("token revoked");
    });
    expect(r.status).toBe("FAILED");
    const after = await db.integrationConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(after.status).toBe("NEEDS_REAUTH");
    // A paused connection is not picked up again.
    const again = await runSync(after, "cron", async () => ({ created: 0, updated: 0 }));
    expect(again.status).toBe("SKIPPED");
  });

  it("records provider outages without breaking other providers", async () => {
    const userId = await makeUser("outage");
    const lms = await db.integrationConnection.create({ data: { userId, provider: "lms", status: "CONNECTED" } });
    const cal = await db.integrationConnection.create({ data: { userId, provider: "google-calendar", status: "CONNECTED" } });
    const down = await runSync(lms, "cron", async () => {
      throw new ProviderUnavailableError("LMS returned HTTP 503.");
    });
    const up = await runSync(cal, "cron", async () => ({ created: 2, updated: 0 }));
    expect(down.status).toBe("FAILED");
    expect(up.status).toBe("SUCCESS");
    const l = await db.integrationConnection.findUniqueOrThrow({ where: { id: lms.id } });
    expect(l.status).toBe("ERROR");
    expect(l.lastError).toContain("503");
  });
});

describe("credential vault storage", () => {
  it("stores only ciphertext and deletes on disconnect", async () => {
    const userId = await makeUser("vault");
    const conn = await db.integrationConnection.create({ data: { userId, provider: "gmail" } });
    await putCredential(conn.id, "oauth_refresh", "1//refresh-secret-value");
    const row = await db.encryptedCredential.findFirstOrThrow({ where: { connectionId: conn.id } });
    expect(row.ciphertext).not.toContain("refresh-secret");
    expect((await getCredential(conn.id, "oauth_refresh"))?.value).toBe("1//refresh-secret-value");
    expect(await deleteCredentials(conn.id)).toBe(1);
    expect(await getCredential(conn.id, "oauth_refresh")).toBeNull();
  });
});

describe("Qalam CSV import", () => {
  it("keeps two same-day classes of one course as separate records", async () => {
    const userId = await makeUser("qalam-sameday");
    const csv = "course,date,status,sessions\nCS-212,2026-10-05,PRESENT,1\nCS-212,2026-10-05,ABSENT,3\n";
    expect((await importQalamCsv(userId, "attendance", csv, "Asia/Karachi")).imported).toBe(2);
    await importQalamCsv(userId, "attendance", csv, "Asia/Karachi");
    const rows = await db.attendanceRecord.findMany({ where: { userId }, orderBy: { sessions: "asc" } });
    expect(rows.map((r) => [r.status, r.sessions])).toEqual([["PRESENT", 1], ["ABSENT", 3]]);

    const timed = "course,date,time,status\nMATH-101,2026-10-06,09:00,PRESENT\nMATH-101,2026-10-06,14:00,LATE\n";
    await importQalamCsv(userId, "attendance", timed, "Asia/Karachi");
    const math = await db.attendanceRecord.findMany({ where: { userId, status: { in: ["PRESENT", "LATE"] }, course: { code: "MATH-101" } }, orderBy: { date: "asc" } });
    expect(math.map((r) => r.date.toISOString())).toEqual(["2026-10-06T04:00:00.000Z", "2026-10-06T09:00:00.000Z"]);
  });

  it("imports marks with weights and class averages labelled as imported", async () => {
    const userId = await makeUser("qalam-marks");
    const csv = "course,assessment,category,obtained,max,weight,class_average\nCS-212,Quiz 1,QUIZ,8,10,2.5,6.4\nCS-212,Mid,MIDTERM,,50,30,\nCS-212,Bad,QUIZ,5,0,1,\n";
    const r = await importQalamCsv(userId, "marks", csv, "Asia/Karachi");
    expect(r.imported).toBe(2);
    expect(r.skipped[0]).toMatchObject({ row: 4 });
    const q = await db.assessment.findFirstOrThrow({ where: { userId, title: "Quiz 1" } });
    expect(q).toMatchObject({ obtainedMarks: 8, maxMarks: 10, weightPct: 2.5, classAverage: 6.4, classAverageSrc: "IMPORT", source: "IMPORT" });
    const mid = await db.assessment.findFirstOrThrow({ where: { userId, title: "Mid" } });
    expect(mid.obtainedMarks).toBeNull();
    expect(mid.classAverage).toBeNull();
  });

  it("imports deadlines in local time without claiming submission", async () => {
    const userId = await makeUser("qalam-due");
    const csv = "course,title,due,max,weight,url\nCS-212,Assignment 2,2026-11-12 23:59,10,5,https://lms.example.edu/a/2\nCS-212,No time,2026-11-13,,,\n";
    await importQalamCsv(userId, "deadlines", csv, "Asia/Karachi");
    await importQalamCsv(userId, "deadlines", csv, "Asia/Karachi");
    const rows = await db.assignment.findMany({ where: { userId }, orderBy: { dueAt: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows[0].dueAt?.toISOString()).toBe("2026-11-12T18:59:00.000Z");
    expect(rows[1].dueAt?.toISOString()).toBe("2026-11-13T18:59:00.000Z");
    expect(rows.every((a) => a.universityStatus === "UNKNOWN")).toBe(true);
  });

  it("imports, reports bad rows, and re-imports without duplicates", async () => {
    const userId = await makeUser("qalam");
    const csv = "course,date,status,sessions\nCS-212 Data Structures,2026-10-05,PRESENT,1\nCS-212 Data Structures,2026-10-07,ABSENT,1\nCS-212 Data Structures,bad-date,PRESENT,1\n";
    const r1 = await importQalamCsv(userId, "attendance", csv, "Asia/Karachi");
    expect(r1.imported).toBe(2);
    expect(r1.skipped).toEqual([{ row: 4, reason: "Date must be YYYY-MM-DD" }]);
    await importQalamCsv(userId, "attendance", csv, "Asia/Karachi");
    expect(await db.attendanceRecord.count({ where: { userId } })).toBe(2);
    const rec = await db.attendanceRecord.findFirstOrThrow({ where: { userId } });
    expect(rec.source).toBe("IMPORT");
  });
});
