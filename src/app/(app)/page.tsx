import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BookOpen, ClipboardList } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { getOverview } from "@/server/queries/overview";
import { getAcademicStanding } from "@/server/queries/academics";
import { Skeleton } from "@/components/ui/skeleton";
import { AcademicStanding } from "@/components/modules/academic-standing";
import { LmsSignIn } from "@/components/home/lms-signin";
import { AutoSync } from "@/components/home/auto-sync";
import { SourceBadge } from "@/components/source-badge";
import { Countdown, LiveClock } from "@/components/live-clock";
import { courseLabel, fmtDate, fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Orbit" };

function greeting(hour: number) {
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

type StandingCourse = Awaited<ReturnType<typeof getAcademicStanding>>["courses"][number];

export default async function HomePage() {
  const user = await requireUser();
  const now = new Date();
  const [o, standing] = await Promise.all([getOverview(user.id, now), getAcademicStanding(user.id, now)]);
  const lms = o.connections.find((c) => c.provider === "lms");
  const lmsConnected = Boolean(lms && lms.status !== "DISCONNECTED");
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: o.tz, hour: "2-digit", hour12: false }).format(now));
  const hasData = standing.courseCount > 0;

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{fmtDate(now, o.tz, { weekday: "long", day: "numeric", month: "long" })}</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {greeting(hour)}, {user.name.split(" ")[0]}
          </h1>
        </div>
        <div className="flex flex-col items-end gap-1">
          <LiveClock tz={o.tz} />
          {lmsConnected ? <AutoSync lastSuccessAt={lms!.lastSuccessAt ? new Date(lms!.lastSuccessAt).toISOString() : null} /> : null}
        </div>
      </header>

      {!lmsConnected ? <LmsSignIn reconnect={lms?.status === "NEEDS_REAUTH"} /> : null}

      {hasData ? (
        <>
          <Suspense fallback={<Skeleton className="h-40 rounded-xl" />}>
            <AcademicStanding userId={user.id} now={now} />
          </Suspense>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Your courses</h2>
              <Link href="/courses" className="text-xs text-primary hover:underline">
                All courses →
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {standing.courses.map((c) => (
                <CourseCard key={c.id} c={c} />
              ))}
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border bg-card p-4 shadow-xs">
              <div className="mb-2 flex items-center gap-2">
                <ClipboardList className="size-4 text-muted-foreground" aria-hidden="true" />
                <h2 className="text-sm font-semibold">Upcoming deadlines</h2>
                <Link href="/assignments" className="ml-auto text-xs text-primary hover:underline">
                  All →
                </Link>
              </div>
              {o.assignments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending deadlines in the next 7 days{o.overdueCount ? `, but ${o.overdueCount} overdue` : ""}.</p>
              ) : (
                <ul className="divide-y">
                  {o.assignments.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{a.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {courseLabel(a.course)} · {fmtDateTime(a.dueAt!, o.tz)}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-medium text-warning">
                        <Countdown to={a.dueAt!.toISOString()} />
                      </span>
                      <SourceBadge source={a.source} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-xl border bg-card p-4 shadow-xs">
              <div className="mb-2 flex items-center gap-2">
                <BookOpen className="size-4 text-muted-foreground" aria-hidden="true" />
                <h2 className="text-sm font-semibold">Recent marks</h2>
                <Link href="/marks" className="ml-auto text-xs text-primary hover:underline">
                  All →
                </Link>
              </div>
              {o.recentMarks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No graded assessments yet.</p>
              ) : (
                <ul className="space-y-2">
                  {o.recentMarks.map((m) => (
                    <li key={m.id} className="flex items-center gap-2 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{m.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{courseLabel(m.course)}</p>
                      </div>
                      <span className="font-mono tabular-nums">
                        {m.obtainedMarks}/{m.maxMarks}
                      </span>
                      <SourceBadge source={m.source} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      ) : lmsConnected ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
          <p className="font-medium">Connected — pulling your data…</p>
          <p className="mt-1 text-muted-foreground">Your LMS is connected. Your courses, marks, submissions and deadlines will appear here as soon as the first sync finishes.</p>
        </div>
      ) : null}
    </div>
  );
}

function CourseCard({ c }: { c: StandingCourse }) {
  const pct = c.standing.gradedWeight > 0 ? c.standing.weightedPctSoFar : null;
  const att = c.attendanceSummary.pct;
  const low = att != null && c.threshold != null && att < c.threshold;
  const code = c.code && c.code !== c.name ? c.code : null;
  return (
    <Link href={`/courses/${c.id}`} className="rounded-xl border bg-card p-4 shadow-xs transition-colors hover:bg-muted/40">
      <p className="truncate text-sm font-semibold">{code ?? c.name}</p>
      <p className="truncate text-xs text-muted-foreground">{code ? c.name : " "}</p>
      <div className="mt-3 flex items-end justify-between">
        <div>
          <p className="text-[11px] text-muted-foreground">Marks so far</p>
          <p className="text-lg font-semibold tabular-nums">{pct != null ? `${pct.toFixed(0)}%` : "—"}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-muted-foreground">Attendance</p>
          <p className={cn("text-lg font-semibold tabular-nums", low && "text-destructive")}>{att != null ? `${att.toFixed(0)}%` : "—"}</p>
        </div>
      </div>
    </Link>
  );
}
