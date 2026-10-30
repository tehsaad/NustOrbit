import "server-only";
import { db } from "@/server/db";
import { parseIcs, type ParsedEvent } from "@/domain/ics";
import { getCredential } from "../credentials";
import { fetchAllowedText, LEGACY_TLS_MESSAGE, legacyTlsAllowed, legacyTlsRequest } from "../safe-fetch";
import { ProviderAuthError, ProviderConfigError, ProviderUnavailableError } from "../errors";
import type { SyncCounts } from "../sync";
import type { IntegrationConnection } from "@/generated/prisma/client";

/**
 * NUST LMS adapter. Public sources indicate the LMS is Moodle-based (not
 * verified from this environment). Two authorized access paths are supported:
 *  1. The student's personal calendar export URL (Moodle "Export calendar").
 *  2. A Moodle web-service token the student generates under
 *     Preferences → Security keys, only if the site administrators allow it.
 * Orbit never collects the student's LMS password.
 */
export interface LmsProvider {
  listCourses(): Promise<LmsCourse[]>;
  listDeadlines(): Promise<LmsDeadline[]>;
  listAssignments?(): Promise<LmsAssignment[]>;
  listGrades?(courseExternalIds: string[]): Promise<LmsGradeItem[]>;
}

export type LmsCourse = { externalId: string; code?: string; name: string; url?: string };
export type LmsDeadline = { externalId: string; title: string; courseExternalId?: string; startsAt: Date; endsAt: Date; kind: ParsedEvent["kind"]; description?: string; url?: string };
export type LmsAssignment = {
  externalId: string;
  courseExternalId: string;
  title: string;
  dueAt: Date | null;
  url?: string;
  maxMarks?: number | null;
  submissionStatus?: "NOT_SUBMITTED" | "SUBMITTED" | "GRADED" | "UNKNOWN";
  submittedAt?: Date | null;
  grade?: number | null;
  feedback?: string | null;
};
export type LmsGradeItem = { externalId: string; courseExternalId: string; title: string; obtained: number | null; max: number; weightPct: number | null };

export function lmsAllowedHosts(): string[] {
  return (process.env.LMS_ALLOWED_HOSTS ?? "lms.nust.edu.pk").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);
}

export function lmsBaseUrl(): string {
  return `https://${lmsAllowedHosts()[0]}`;
}

/**
 * Exchanges a Moodle username + password for a web-service token via the
 * official `login/token.php` endpoint (the same mechanism the Moodle mobile
 * app uses; `enablemobilewebservice` is on for NUST LMS). The password is used
 * for this single request and is never stored or logged — only the returned
 * token is persisted (encrypted) by the caller.
 */
export async function exchangeMoodleToken(baseUrl: string, username: string, password: string): Promise<string> {
  const endpoint = new URL(`${baseUrl}/login/token.php`);
  const body = new URLSearchParams({ username, password, service: "moodle_mobile_app" }).toString();
  const headers = { "Content-Type": "application/x-www-form-urlencoded" };
  let status: number;
  let text: string;
  try {
    if (legacyTlsAllowed()) {
      const r = await legacyTlsRequest(endpoint, { method: "POST", body, headers });
      status = r.status;
      text = r.text;
    } else {
      const res = await fetch(endpoint, { method: "POST", body, headers, redirect: "manual", signal: AbortSignal.timeout(20_000) });
      status = res.status;
      text = await res.text();
    }
  } catch (e) {
    if (/unsafe legacy renegotiation/i.test(String((e as { cause?: Error })?.cause?.message ?? (e as Error)?.message))) throw new ProviderConfigError(LEGACY_TLS_MESSAGE);
    throw new ProviderUnavailableError("The LMS did not respond.");
  }
  if (status < 200 || status >= 300) throw new ProviderUnavailableError(`The LMS returned HTTP ${status}.`);
  let json: { token?: string; error?: string; errorcode?: string };
  try {
    json = JSON.parse(text);
  } catch {
    throw new ProviderUnavailableError("The LMS returned an unexpected response.");
  }
  if (json.token) return json.token;
  // invalidlogin = wrong credentials; other codes usually mean the mobile service is blocked for this account.
  if (json.errorcode === "invalidlogin") throw new ProviderAuthError("The LMS rejected that username or password.");
  throw new ProviderConfigError(json.error ? `LMS: ${json.error}` : "The LMS would not issue a token for this account.");
}

/** Calendar-feed based provider (deadlines + courses inferred from event categories). */
export class MoodleCalendarFeedProvider implements LmsProvider {
  private events: ParsedEvent[] | null = null;
  constructor(private readonly load: () => Promise<string>) {}

  private async all(): Promise<ParsedEvent[]> {
    if (!this.events) {
      const body = await this.load();
      try {
        this.events = parseIcs(body);
      } catch {
        throw new ProviderConfigError("The LMS did not return a calendar. The export link may have expired; create a new one in LMS → Calendar → Export.");
      }
    }
    return this.events;
  }

  async listCourses(): Promise<LmsCourse[]> {
    const seen = new Map<string, LmsCourse>();
    for (const e of await this.all()) {
      const cat = e.categories[0];
      if (cat && !seen.has(cat)) seen.set(cat, { externalId: cat, code: cat, name: cat });
    }
    return [...seen.values()];
  }

  async listDeadlines(): Promise<LmsDeadline[]> {
    return (await this.all()).map((e) => ({
      externalId: e.uid,
      title: e.title,
      courseExternalId: e.categories[0],
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      kind: e.kind,
      description: e.description,
      url: e.url,
    }));
  }
}

type MoodleError = { exception?: string; errorcode?: string; message?: string };

/** Moodle REST web-service client (only usable with a student-generated token). */
export class MoodleWebServiceProvider implements LmsProvider {
  private userId: number | null = null;
  constructor(private readonly baseUrl: string, private readonly token: string) {}

  private async call<T>(wsfunction: string, params: Record<string, string | number> = {}): Promise<T> {
    const body = new URLSearchParams({ wstoken: this.token, wsfunction, moodlewsrestformat: "json" });
    for (const [k, v] of Object.entries(params)) body.set(k, String(v));
    const endpoint = new URL(`${this.baseUrl}/webservice/rest/server.php`);
    let status: number;
    let text: string;
    try {
      if (legacyTlsAllowed()) {
        const r = await legacyTlsRequest(endpoint, { method: "POST", body: body.toString(), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
        status = r.status;
        text = r.text;
      } else {
        const res = await fetch(endpoint, { method: "POST", body, redirect: "manual", signal: AbortSignal.timeout(15_000) });
        status = res.status;
        text = await res.text();
      }
    } catch (e) {
      if (/unsafe legacy renegotiation/i.test(String((e as { cause?: Error })?.cause?.message ?? (e as Error)?.message))) throw new ProviderConfigError(LEGACY_TLS_MESSAGE);
      throw new ProviderUnavailableError("The LMS did not respond.");
    }
    if (status < 200 || status >= 300) throw new ProviderUnavailableError(`The LMS returned HTTP ${status}.`);
    let json: T & MoodleError;
    try {
      json = JSON.parse(text) as T & MoodleError;
    } catch {
      throw new ProviderUnavailableError("The LMS returned an unexpected response.");
    }
    if (json && typeof json === "object" && "exception" in json && json.exception) {
      if (json.errorcode === "invalidtoken" || json.errorcode === "accessexception") throw new ProviderAuthError("The LMS rejected the token. Generate a new one and reconnect.");
      throw new ProviderUnavailableError(`LMS error: ${json.errorcode ?? "unknown"}`);
    }
    return json;
  }

  private async uid(): Promise<number> {
    if (this.userId == null) this.userId = (await this.call<{ userid: number }>("core_webservice_get_site_info")).userid;
    return this.userId;
  }

  async listCourses(): Promise<LmsCourse[]> {
    const courses = await this.call<{ id: number; shortname: string; fullname: string }[]>("core_enrol_get_users_courses", { userid: await this.uid() });
    return courses.map((c) => ({ externalId: String(c.id), code: c.shortname, name: c.fullname, url: `${this.baseUrl}/course/view.php?id=${c.id}` }));
  }

  async listDeadlines(): Promise<LmsDeadline[]> {
    const now = Math.floor(Date.now() / 1000);
    const r = await this.call<{ events: { id: number; name: string; timestart: number; timeduration: number; course?: { id: number }; url?: string; modulename?: string }[] }>(
      "core_calendar_get_action_events_by_timesort",
      { timesortfrom: now - 7 * 86400, limitnum: 50 },
    );
    return r.events.map((e) => ({
      externalId: `ws-event-${e.id}`,
      title: e.name,
      courseExternalId: e.course ? String(e.course.id) : undefined,
      startsAt: new Date(e.timestart * 1000),
      endsAt: new Date((e.timestart + (e.timeduration || 0)) * 1000),
      kind: e.modulename === "quiz" ? "QUIZ" : "DEADLINE",
      url: e.url,
    }));
  }

  async listAssignments(): Promise<LmsAssignment[]> {
    const r = await this.call<{ courses: { id: number; assignments: { id: number; cmid: number; name: string; duedate: number; grade: number }[] }[] }>("mod_assign_get_assignments");
    const out: LmsAssignment[] = [];
    for (const c of r.courses) {
      for (const a of c.assignments) {
        let submissionStatus: LmsAssignment["submissionStatus"] = "UNKNOWN";
        let submittedAt: Date | null = null;
        let grade: number | null = null;
        try {
          const s = await this.call<{ lastattempt?: { submission?: { status: string; timemodified: number } }; feedback?: { grade?: { grade: string } } }>(
            "mod_assign_get_submission_status",
            { assignid: a.id },
          );
          const st = s.lastattempt?.submission?.status;
          if (st === "submitted") {
            submissionStatus = "SUBMITTED";
            submittedAt = new Date((s.lastattempt!.submission!.timemodified ?? 0) * 1000);
          } else if (st === "new" || st === "draft") submissionStatus = "NOT_SUBMITTED";
          const g = s.feedback?.grade?.grade;
          if (g != null && g !== "" && !Number.isNaN(Number(g))) {
            grade = Number(g);
            submissionStatus = "GRADED";
          }
        } catch (e) {
          if (e instanceof ProviderAuthError) throw e;
        }
        out.push({
          externalId: `ws-assign-${a.id}`,
          courseExternalId: String(c.id),
          title: a.name,
          dueAt: a.duedate ? new Date(a.duedate * 1000) : null,
          url: `${this.baseUrl}/mod/assign/view.php?id=${a.cmid}`,
          maxMarks: a.grade > 0 ? a.grade : null,
          submissionStatus,
          submittedAt,
          grade,
        });
      }
    }
    return out;
  }

  async listGrades(courseExternalIds: string[]): Promise<LmsGradeItem[]> {
    // gradereport_user_get_grade_items requires a real course id — courseid:0 ("all
    // courses") makes Moodle throw invalidrecordunknown, so query each course and
    // skip any that refuses (some courses hide the grader report from students).
    const uid = await this.uid();
    const out: LmsGradeItem[] = [];
    for (const cid of courseExternalIds) {
      const courseid = Number(cid);
      if (!Number.isFinite(courseid)) continue;
      let r: { usergrades?: { courseid: number; gradeitems: { id: number; itemname: string | null; itemtype: string; graderaw: number | null; grademax: number; weightraw?: number | null }[] }[] };
      try {
        r = await this.call("gradereport_user_get_grade_items", { courseid, userid: uid });
      } catch (e) {
        if (e instanceof ProviderAuthError) throw e;
        continue;
      }
      for (const ug of r.usergrades ?? []) {
        for (const gi of ug.gradeitems) {
          if (gi.itemtype === "course" || !gi.itemname || !(gi.grademax > 0)) continue;
          out.push({
            externalId: `ws-grade-${gi.id}`,
            courseExternalId: String(ug.courseid),
            title: gi.itemname,
            obtained: gi.graderaw,
            max: gi.grademax,
            weightPct: gi.weightraw != null ? Math.round(gi.weightraw * 10000) / 100 : null,
          });
        }
      }
    }
    return out;
  }
}

/** Persist LMS data idempotently using (userId, source=LMS, externalId). */
export async function importLmsData(userId: string, provider: LmsProvider): Promise<SyncCounts> {
  let created = 0;
  let updated = 0;
  const now = new Date();
  const courseIds = new Map<string, string>();
  // Each section is independent: a failure in one (e.g. a Moodle function a
  // course disables) becomes a warning (PARTIAL sync) instead of discarding the
  // data that did load. Courses must succeed, since everything maps onto them.
  const warnings: string[] = [];
  const note = (what: string, e: unknown) => {
    if (e instanceof ProviderAuthError) throw e;
    warnings.push(`${what} could not be synced: ${e instanceof Error ? e.message : "unknown error"}`);
  };

  for (const c of await provider.listCourses()) {
    const existing = await db.course.findUnique({ where: { userId_source_externalId: { userId, source: "LMS", externalId: c.externalId } } });
    const row = await db.course.upsert({
      where: { userId_source_externalId: { userId, source: "LMS", externalId: c.externalId } },
      create: { userId, source: "LMS", externalId: c.externalId, name: c.name, code: c.code ?? null, url: c.url ?? null, syncedAt: now },
      // Keep any name the student edited; refresh provider-owned fields.
      update: { code: c.code ?? null, url: c.url ?? null, syncedAt: now },
    });
    courseIds.set(c.externalId, row.id);
    if (existing) updated++;
    else created++;
  }

  const assignmentIds = new Set<string>();
  try {
  const assignments = provider.listAssignments ? await provider.listAssignments() : [];
  for (const a of assignments) assignmentIds.add(a.externalId);
  for (const a of assignments) {
    const data = {
      title: a.title,
      courseId: courseIds.get(a.courseExternalId) ?? null,
      dueAt: a.dueAt,
      url: a.url ?? null,
      maxMarks: a.maxMarks ?? null,
      universityStatus: a.submissionStatus ?? "UNKNOWN",
      obtainedMarks: a.grade ?? null,
      syncedAt: now,
    };
    const r = await db.assignment.upsert({
      where: { userId_source_externalId: { userId, source: "LMS", externalId: a.externalId } },
      create: { userId, source: "LMS", externalId: a.externalId, ...data },
      update: data,
    });
    if (r.createdAt.getTime() === r.updatedAt.getTime()) created++;
    else updated++;
    if (a.submissionStatus === "SUBMITTED" || a.submissionStatus === "GRADED") {
      await db.submission.upsert({
        where: { userId_source_externalId: { userId, source: "LMS", externalId: `sub-${a.externalId}` } },
        create: { userId, assignmentId: r.id, source: "LMS", externalId: `sub-${a.externalId}`, status: a.submissionStatus, submittedAt: a.submittedAt ?? null, grade: a.grade ?? null, syncedAt: now },
        update: { status: a.submissionStatus, submittedAt: a.submittedAt ?? null, grade: a.grade ?? null, syncedAt: now },
      });
    }
  }
  } catch (e) {
    note("Assignments", e);
  }

  try {
  for (const d of await provider.listDeadlines()) {
    const courseId = d.courseExternalId ? (courseIds.get(d.courseExternalId) ?? null) : null;
    if (d.kind === "DEADLINE" && !assignmentIds.has(d.externalId)) {
      // A calendar deadline says nothing about submission, so university status stays UNKNOWN.
      const title = d.title.replace(/\s+is due$/i, "").replace(/\s+closes$/i, "");
      const data = { title, courseId, dueAt: d.startsAt, url: d.url ?? null, description: d.description ?? null, syncedAt: now };
      const existing = await db.assignment.findUnique({ where: { userId_source_externalId: { userId, source: "LMS", externalId: d.externalId } }, select: { id: true } });
      await db.assignment.upsert({
        where: { userId_source_externalId: { userId, source: "LMS", externalId: d.externalId } },
        create: { userId, source: "LMS", externalId: d.externalId, ...data },
        update: data,
      });
      if (existing) updated++;
      else created++;
    } else {
      const data = {
        title: d.title,
        courseId,
        startsAt: d.startsAt,
        endsAt: d.endsAt,
        kind: d.kind === "CLASS" ? ("CLASS" as const) : d.kind === "QUIZ" ? ("QUIZ" as const) : d.kind === "EXAM" ? ("EXAM" as const) : d.kind === "DEADLINE" ? ("DEADLINE" as const) : ("OTHER" as const),
        description: d.description ?? null,
        url: d.url ?? null,
        readOnly: true,
        syncStatus: "SYNCED" as const,
        syncedAt: now,
      };
      const existing = await db.calendarEvent.findUnique({ where: { userId_source_externalId: { userId, source: "LMS", externalId: d.externalId } }, select: { id: true } });
      await db.calendarEvent.upsert({
        where: { userId_source_externalId: { userId, source: "LMS", externalId: d.externalId } },
        create: { userId, source: "LMS", externalId: d.externalId, ...data },
        update: data,
      });
      if (existing) updated++;
      else created++;
    }
  }
  } catch (e) {
    note("Deadlines", e);
  }

  if (provider.listGrades) {
    try {
      for (const g of await provider.listGrades([...courseIds.keys()])) {
        const courseId = courseIds.get(g.courseExternalId);
        if (!courseId || !(g.max > 0)) continue;
        const data = { courseId, title: g.title, obtainedMarks: g.obtained, maxMarks: g.max, weightPct: g.weightPct, syncedAt: now };
        await db.assessment.upsert({
          where: { userId_source_externalId: { userId, source: "LMS", externalId: g.externalId } },
          create: { userId, source: "LMS", externalId: g.externalId, ...data },
          update: data,
        });
        updated++;
      }
    } catch (e) {
      note("Grades", e);
    }
  }
  return { created, updated, warnings: warnings.length ? warnings : undefined };
}

export async function lmsProviderFor(connection: IntegrationConnection): Promise<LmsProvider> {
  const token = await getCredential(connection.id, "api_token");
  if (token) return new MoodleWebServiceProvider(lmsBaseUrl(), token.value);
  const feed = await getCredential(connection.id, "ical_url");
  if (feed) return new MoodleCalendarFeedProvider(() => fetchAllowedText(feed.value, lmsAllowedHosts()));
  throw new ProviderAuthError("No LMS credentials are stored. Add your calendar export link again.");
}

export async function syncLms(connection: IntegrationConnection): Promise<SyncCounts> {
  return importLmsData(connection.userId, await lmsProviderFor(connection));
}
