import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/server/db";
import { getUserOrNull } from "@/server/auth/session";
import { recordAudit } from "@/server/audit";

/** Full JSON export of the signed-in user's Orbit data (never includes credentials). */
export async function GET(request: NextRequest) {
  const user = await getUserOrNull();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const scope = request.nextUrl.searchParams.get("scope");
  const where = { userId: user.id };
  if (scope === "notes") {
    const notes = await db.note.findMany({ where, orderBy: { updatedAt: "desc" } });
    const format = request.nextUrl.searchParams.get("format");
    if (format === "md") {
      const md = notes
        .map((n) => `# ${n.title}\n\n_Tags: ${n.tags.join(", ") || "none"} · Folder: ${n.folder ?? "none"} · Updated ${n.updatedAt.toISOString()}_\n\n${n.content}\n`)
        .join("\n---\n\n");
      return new NextResponse(md, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": 'attachment; filename="orbit-notes.md"', "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ exportedAt: new Date().toISOString(), notes }, { headers: { "Content-Disposition": 'attachment; filename="orbit-notes.json"', "Cache-Control": "no-store" } });
  }
  const [preference, courses, assessments, grades, assignments, submissions, timetable, classSessions, attendance, events, tasks, notes, reminders, connections] = await Promise.all([
    db.userPreference.findUnique({ where }),
    db.course.findMany({ where }),
    db.assessment.findMany({ where }),
    db.grade.findMany({ where }),
    db.assignment.findMany({ where }),
    db.submission.findMany({ where }),
    db.timetableEntry.findMany({ where }),
    db.classSession.findMany({ where }),
    db.attendanceRecord.findMany({ where }),
    db.calendarEvent.findMany({ where }),
    db.task.findMany({ where }),
    db.note.findMany({ where }),
    db.reminder.findMany({ where }),
    db.integrationConnection.findMany({ where, select: { provider: true, status: true, accountLabel: true, grantedScopes: true, lastSuccessAt: true } }),
  ]);
  await recordAudit({ userId: user.id, action: "data.exported" });
  return NextResponse.json(
    { exportedAt: new Date().toISOString(), user: { name: user.name, email: user.email }, preference, courses, assessments, grades, assignments, submissions, timetable, classSessions, attendance, events, tasks, notes, reminders, connections },
    { headers: { "Content-Disposition": 'attachment; filename="orbit-backup.json"', "Cache-Control": "no-store" } },
  );
}
