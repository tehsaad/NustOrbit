import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getAttendancePolicy, getPrefs } from "@/server/prefs";
import { courseOptions } from "@/server/queries/courses";
import { summarizeAttendance, attendanceOutlook } from "@/domain/attendance";
import { CourseMarks } from "@/components/modules/course-marks";
import { CourseFormDialog } from "@/components/modules/course-form";
import { SectionCard } from "@/components/section-card";
import { SourceBadge } from "@/components/source-badge";
import { Button } from "@/components/ui/button";
import { courseLabel, fmtDateTime, pct } from "@/lib/format";

export const metadata: Metadata = { title: "Course" };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const course = await db.course.findFirst({
    where: { id, userId: user.id },
    include: {
      assessments: { orderBy: [{ heldAt: "asc" }, { createdAt: "asc" }] },
      assignments: { orderBy: { dueAt: "asc" } },
      timetable: { orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] },
      attendance: { orderBy: { date: "desc" } },
      notes: { where: { archived: false }, orderBy: { updatedAt: "desc" }, take: 10, select: { id: true, title: true } },
    },
  });
  if (!course) notFound();
  const [prefs, options, policy] = await Promise.all([getPrefs(user.id), courseOptions(user.id), getAttendancePolicy(user.id)]);
  const tz = prefs.timezone;
  const att = summarizeAttendance(course.attendance, policy);
  const threshold = course.attendanceThresholdPct ?? policy.thresholdPct;
  const outlook = attendanceOutlook(att, threshold);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <Link href="/courses" className="text-xs text-muted-foreground hover:underline">
            ← Courses
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">{courseLabel(course)}</h1>
          <p className="text-sm text-muted-foreground">{[course.instructor, course.creditHours != null ? `${course.creditHours} credit hours` : null, course.term].filter(Boolean).join(" · ")}</p>
        </div>
        <SourceBadge source={course.source} />
        {course.url ? (
          <Button asChild size="sm" variant="outline">
            <a href={course.url} target="_blank" rel="noreferrer noopener">
              <ExternalLink /> Course page
            </a>
          </Button>
        ) : null}
        <CourseFormDialog variant="edit" course={course} />
      </div>

      <CourseMarks course={course} assessments={course.assessments} courseOptions={options} tz={tz} defaultTarget={prefs.defaultTargetPct} />

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Assignments" href="/assignments">
          {course.assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">None.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {course.assignments.slice(0, 10).map((a) => (
                <li key={a.id} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">{a.title}</span>
                  <span className="text-xs text-muted-foreground">{a.dueAt ? fmtDateTime(a.dueAt, tz) : "no date"}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
        <SectionCard title="Attendance" href="/attendance">
          <p className="text-2xl font-semibold tabular-nums">{pct(att.pct)}</p>
          <p className="text-xs text-muted-foreground">
            {att.attended} attended · {att.missed} missed · {att.total} recorded
          </p>
          <p className="mt-2 text-sm">{"message" in outlook ? outlook.message : outlook.kind === "no-threshold" ? "Set your attendance minimum in Settings to see allowances." : "No records yet."}</p>
        </SectionCard>
        <SectionCard title="Weekly classes" href="/timetable">
          {course.timetable.length === 0 ? (
            <p className="text-sm text-muted-foreground">Not in your timetable.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {course.timetable.map((t) => (
                <li key={t.id}>
                  {DAYS[t.dayOfWeek]} {t.startTime}–{t.endTime} {t.room ? <span className="text-muted-foreground">· {t.room}</span> : null}
                </li>
              ))}
            </ul>
          )}
          {course.notes.length ? (
            <div className="mt-3 border-t pt-2">
              <p className="text-xs font-medium text-muted-foreground">Notes</p>
              {course.notes.map((n) => (
                <Link key={n.id} href={`/notes/${n.id}`} className="block truncate text-sm hover:underline">
                  {n.title}
                </Link>
              ))}
            </div>
          ) : null}
        </SectionCard>
      </div>
    </div>
  );
}
