import type { Metadata } from "next";
import Link from "next/link";
import { Trash2, UserCheck } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getAttendancePolicy, getPrefs } from "@/server/prefs";
import { courseOptions } from "@/server/queries/courses";
import { attendanceOutlook, summarizeAttendance } from "@/domain/attendance";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { SourceBadge } from "@/components/source-badge";
import { ConfirmAction } from "@/components/forms";
import { AttendanceFormDialog } from "@/components/modules/attendance-form";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { deleteAttendance } from "@/server/actions/schedule";
import { courseLabel, fmtDate, pct, toDateInput } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Attendance" };

export default async function AttendancePage() {
  const user = await requireUser();
  const [prefs, policy, options] = await Promise.all([getPrefs(user.id), getAttendancePolicy(user.id), courseOptions(user.id)]);
  const tz = prefs.timezone;
  const courses = await db.course.findMany({ where: { userId: user.id, archived: false }, include: { attendance: { orderBy: { date: "desc" } } }, orderBy: [{ code: "asc" }, { name: "asc" }] });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        description={
          policy.thresholdPct != null ? (
            <>
              Minimum {policy.thresholdPct}% {prefs.attendancePolicyNote ? `(${prefs.attendancePolicyNote})` : "(set by you)"} · late counts as {policy.lateCountsAs} · leave counts as {policy.leaveCountsAs}.
            </>
          ) : (
            <>
              No minimum configured — Orbit doesn&apos;t assume one.{" "}
              <Link href="/settings" className="text-primary hover:underline">
                Set it from your official regulations
              </Link>
              .
            </>
          )
        }
        actions={<AttendanceFormDialog courses={options} today={toDateInput(new Date(), tz)} />}
      />
      {courses.length === 0 ? (
        <EmptyState icon={UserCheck} title="No courses yet" description="Add courses, then record attendance or import it from a Qalam CSV." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {courses.map((c) => {
            const s = summarizeAttendance(c.attendance, policy);
            const threshold = c.attendanceThresholdPct ?? policy.thresholdPct;
            const o = attendanceOutlook(s, threshold);
            const risk = o.kind === "at-risk" || o.kind === "term-unreachable";
            const sources = [...new Set(c.attendance.map((r) => r.source))];
            return (
              <section key={c.id} className="rounded-xl border bg-card p-4 shadow-xs">
                <header className="flex items-center gap-2">
                  <Link href={`/courses/${c.id}`} className="min-w-0 flex-1 truncate font-semibold hover:underline">
                    {courseLabel(c)}
                  </Link>
                  {sources.map((src) => (
                    <SourceBadge key={src} source={src} />
                  ))}
                </header>
                <div className="mt-3 flex items-end gap-4">
                  <p className={cn("text-3xl font-semibold tabular-nums", risk && "text-destructive")}>{pct(s.pct)}</p>
                  <p className="pb-1 text-xs text-muted-foreground">
                    {s.attended} attended · {s.missed} missed · {s.total} recorded{s.excluded ? ` · ${s.excluded} excluded` : ""}
                  </p>
                </div>
                {s.pct != null ? (
                  <div className="relative mt-2">
                    <Progress value={s.pct} className="h-2" aria-label="Attendance percentage" />
                    {threshold != null ? <span className="absolute -top-1 h-4 w-0.5 bg-foreground/60" style={{ left: `${threshold}%` }} title={`Minimum ${threshold}%`} /> : null}
                  </div>
                ) : null}
                <p className={cn("mt-3 text-sm", risk ? "text-destructive" : "text-muted-foreground")}>
                  {"message" in o ? o.message : o.kind === "no-threshold" ? "Set a minimum to see remaining allowable absences." : "No records yet."}
                </p>
                {c.attendance.length ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs text-muted-foreground">History ({c.attendance.length})</summary>
                    <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto pr-1 text-sm">
                      {c.attendance.map((r) => (
                        <li key={r.id} className="flex items-center gap-2">
                          <span className="w-28 text-xs text-muted-foreground">{fmtDate(r.date, tz)}</span>
                          <span className={cn("w-16 text-xs font-medium", r.status === "ABSENT" ? "text-destructive" : r.status === "PRESENT" ? "text-success" : "text-warning")}>{r.status.toLowerCase()}</span>
                          <span className="text-xs text-muted-foreground">×{r.sessions}</span>
                          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{r.note}</span>
                          <SourceBadge source={r.source} />
                          {r.source === "MANUAL" ? (
                            <ConfirmAction
                              action={deleteAttendance}
                              hidden={{ id: r.id }}
                              title="Delete record?"
                              description="This manual attendance record will be removed."
                              trigger={
                                <Button size="icon-xs" variant="ghost" aria-label="Delete record">
                                  <Trash2 />
                                </Button>
                              }
                            />
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
