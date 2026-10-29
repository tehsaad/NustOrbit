import type { Metadata } from "next";
import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { coursesWithStats } from "@/server/queries/courses";
import { getTimezone } from "@/server/prefs";
import { creditWeightedGpa } from "@/domain/grades";
import { attendanceOutlook } from "@/domain/attendance";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { SectionCard } from "@/components/section-card";
import { SourceBadge } from "@/components/source-badge";
import { courseLabel, fmtDateTime, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Academics" };

export default async function AcademicsPage() {
  const user = await requireUser();
  const [courses, tz, grades, exams] = await Promise.all([
    coursesWithStats(user.id),
    getTimezone(user.id),
    db.grade.findMany({ where: { userId: user.id }, include: { course: { select: { creditHours: true } } } }),
    db.calendarEvent.findMany({ where: { userId: user.id, kind: { in: ["EXAM", "QUIZ"] }, startsAt: { gte: new Date() } }, orderBy: { startsAt: "asc" }, take: 8, include: { course: true } }),
  ]);
  const cgpa = creditWeightedGpa(grades.map((g) => ({ gradePoints: g.gradePoints, creditHours: g.course.creditHours })));
  const credits = courses.reduce((s, c) => s + (c.creditHours ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Academics" description="Semester at a glance: standing, attendance risk and upcoming assessments across all courses." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Active courses" value={String(courses.length)} />
        <Tile label="Credit hours" value={credits ? String(credits) : "—"} />
        <Tile label="CGPA (recorded grades)" value={cgpa != null ? cgpa.toFixed(2) : "—"} />
        <Tile label="Upcoming exams/quizzes" value={String(exams.length)} />
      </div>
      {courses.length === 0 ? (
        <EmptyState icon={GraduationCap} title="No courses yet" description="Add courses or connect a university source to build your academic overview." />
      ) : (
        <SectionCard title="Course standing">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 font-normal">Course</th>
                  <th className="py-2 font-normal">Weighted so far</th>
                  <th className="py-2 font-normal">Graded weight</th>
                  <th className="py-2 font-normal">Attendance</th>
                  <th className="py-2 font-normal">Outlook</th>
                  <th className="py-2 font-normal">Official grade</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((c) => {
                  const o = attendanceOutlook(c.attendanceSummary, c.threshold);
                  const risk = o.kind === "at-risk" || o.kind === "term-unreachable";
                  return (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="py-2">
                        <Link href={`/courses/${c.id}`} className="font-medium hover:underline">
                          {courseLabel(c)}
                        </Link>{" "}
                        <SourceBadge source={c.source} />
                      </td>
                      <td className="py-2 tabular-nums">{pct(c.standing.weightedPctSoFar)}</td>
                      <td className="py-2 tabular-nums">{c.standing.gradedWeight}%</td>
                      <td className={cn("py-2 tabular-nums", risk && "text-destructive")}>{pct(c.attendanceSummary.pct)}</td>
                      <td className={cn("py-2 text-xs", risk ? "text-destructive" : "text-muted-foreground")}>
                        {o.kind === "safe" ? `can miss ${o.canMiss}` : o.kind === "at-risk" ? `attend next ${o.mustAttend}` : o.kind === "no-threshold" ? "set minimum" : o.kind === "no-data" ? "no records" : "message" in o ? o.message : ""}
                      </td>
                      <td className="py-2">{c.grades[0]?.letter ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}
      <SectionCard title="Upcoming exams & quizzes" href="/calendar">
        {exams.length === 0 ? (
          <p className="text-sm text-muted-foreground">None scheduled. Exams from the LMS calendar or ones you add in Calendar appear here.</p>
        ) : (
          <ul className="divide-y text-sm">
            {exams.map((e) => (
              <li key={e.id} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1 truncate font-medium">{e.title}</span>
                <span className="text-xs text-muted-foreground">{e.course ? courseLabel(e.course) : ""}</span>
                <span className="text-xs">{fmtDateTime(e.startsAt, tz)}</span>
                <SourceBadge source={e.source} />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3 shadow-xs">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
