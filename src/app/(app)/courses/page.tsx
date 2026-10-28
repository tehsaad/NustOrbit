import type { Metadata } from "next";
import Link from "next/link";
import { Archive, ArchiveRestore, Library } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { coursesWithStats } from "@/server/queries/courses";
import { getTimezone } from "@/server/prefs";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { SourceBadge } from "@/components/source-badge";
import { CourseFormDialog } from "@/components/modules/course-form";
import { InlineAction } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { archiveCourse } from "@/server/actions/academics";
import { fmtDateTime, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Courses" };

export default async function CoursesPage({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const user = await requireUser();
  const showArchived = (await searchParams).archived === "1";
  const [courses, tz] = await Promise.all([coursesWithStats(user.id, showArchived), getTimezone(user.id)]);
  return (
    <div>
      <PageHeader
        title="Courses"
        description="Your enrolled courses with marks, attendance and the next deadline at a glance."
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href={showArchived ? "/courses" : "/courses?archived=1"}>{showArchived ? "Hide archived" : "Show archived"}</Link>
            </Button>
            <CourseFormDialog />
          </>
        }
      />
      {courses.length === 0 ? (
        <EmptyState icon={Library} title="No courses yet" description="Add courses yourself, or connect the LMS / import from Qalam to create them automatically." action={<CourseFormDialog />} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {courses.map((c) => {
            const att = c.attendanceSummary;
            const below = c.threshold != null && att.pct != null && att.pct < c.threshold;
            return (
              <article key={c.id} className={cn("flex flex-col rounded-xl border bg-card p-4 shadow-xs", c.archived && "opacity-60")}>
                <div className="flex items-start gap-2">
                  <Link href={`/courses/${c.id}`} className="min-w-0 flex-1 hover:underline">
                    {c.code ? <p className="font-mono text-xs text-muted-foreground">{c.code}</p> : null}
                    <h2 className="font-semibold leading-snug">{c.name}</h2>
                  </Link>
                  <SourceBadge source={c.source} />
                  <CourseFormDialog variant="edit" course={c} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {[c.instructor, c.creditHours != null ? `${c.creditHours} cr` : null, c.term].filter(Boolean).join(" · ") || "No details yet"}
                </p>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Weighted so far</dt>
                    <dd className="font-semibold tabular-nums">{pct(c.standing.weightedPctSoFar)}</dd>
                    <dd className="text-[11px] text-muted-foreground">{c.standing.gradedWeight}% of course graded</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Attendance</dt>
                    <dd className={cn("font-semibold tabular-nums", below && "text-destructive")}>{pct(att.pct)}</dd>
                    <dd className="text-[11px] text-muted-foreground">
                      {att.attended}/{att.total} sessions{c.threshold != null ? ` · min ${c.threshold}%` : ""}
                    </dd>
                  </div>
                </dl>
                {att.pct != null ? <Progress value={att.pct} className="mt-3 h-1.5" aria-label="Attendance" /> : null}
                <div className="mt-3 border-t pt-3 text-xs text-muted-foreground">
                  {c.assignments[0] ? (
                    <>
                      Next due: <span className="text-foreground">{c.assignments[0].title}</span> · {fmtDateTime(c.assignments[0].dueAt!, tz)}
                    </>
                  ) : (
                    "No upcoming deadlines"
                  )}
                  {c.grades[0]?.letter ? <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-foreground">Grade {c.grades[0].letter}</span> : null}
                </div>
                <div className="mt-2 flex justify-end">
                  <InlineAction action={archiveCourse} hidden={{ id: c.id, archived: String(!c.archived) }}>
                    <Button type="submit" variant="ghost" size="xs">
                      {c.archived ? <ArchiveRestore /> : <Archive />} {c.archived ? "Restore" : "Archive"}
                    </Button>
                  </InlineAction>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
