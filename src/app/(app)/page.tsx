import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Bell, BookOpen, CalendarClock, CheckSquare, ClipboardList, Clock, GraduationCap, Mail, NotebookPen, Pin, UserCheck } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { getOverview } from "@/server/queries/overview";
import { db } from "@/server/db";
import { readInboxSummary } from "@/server/integrations/providers/google";
import { describeError } from "@/server/integrations/errors";
import { googleConfigured } from "@/server/env";
import { SectionCard, Muted } from "@/components/section-card";
import { ConnectPrompt } from "@/components/connect-prompt";
import { SourceBadge, SuggestedBadge } from "@/components/source-badge";
import { FreshnessBadge } from "@/components/freshness-badge";
import { Countdown, LiveClock } from "@/components/live-clock";
import { Skeleton } from "@/components/ui/skeleton";
import { courseLabel, fmtDate, fmtDateTime, fmtTime } from "@/lib/format";
import { getProvider } from "@/server/integrations/registry";
import { cn } from "@/lib/utils";
import { AcademicStanding } from "@/components/modules/academic-standing";

export const metadata: Metadata = { title: "Overview" };

const KIND_STYLE: Record<string, string> = {
  class: "bg-primary",
  deadline: "bg-destructive",
  exam: "bg-warning",
  event: "bg-chart-2",
  task: "bg-chart-3",
  reminder: "bg-chart-5",
};

function greeting(hour: number) {
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function OverviewPage() {
  const user = await requireUser();
  const now = new Date();
  const o = await getOverview(user.id, now);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: o.tz, hour: "2-digit", hour12: false }).format(now));
  const gmail = o.connections.find((c) => c.provider === "gmail");
  const hasAcademicData = o.courseCount > 0 || o.classesToday.length > 0 || o.assignments.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{fmtDate(now, o.tz, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {greeting(hour)}, {user.name.split(" ")[0]}
          </h1>
        </div>
        <LiveClock tz={o.tz} />
      </div>

      {hasAcademicData ? (
        <Suspense fallback={<Skeleton className="h-40 rounded-xl" />}>
          <AcademicStanding userId={user.id} now={now} />
        </Suspense>
      ) : null}

      {/* Status strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Classes today" value={o.classesToday.filter((c) => c.status === "SCHEDULED").length} href="/timetable" />
        <Stat label="Due in 7 days" value={o.assignments.length} href="/assignments?filter=week" />
        <Stat label="Overdue" value={o.overdueCount} href="/assignments?filter=overdue" tone={o.overdueCount > 0 ? "danger" : undefined} />
        <Stat label="Tasks open today" value={o.tasks.length} href="/tasks" />
      </div>

      {!hasAcademicData ? (
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
          <p className="font-medium">Start by adding your semester</p>
          <p className="mt-1 text-muted-foreground">
            Connect your LMS calendar for deadlines, import Qalam data, or add courses and classes yourself. Orbit never shows sample data as if it were yours.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link href="/integrations" className="text-primary hover:underline">
              Connect sources →
            </Link>
            <Link href="/courses" className="text-primary hover:underline">
              Add courses →
            </Link>
            <Link href="/timetable" className="text-primary hover:underline">
              Build timetable →
            </Link>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Next class */}
        <SectionCard title={o.currentClass ? "In class now" : "Next class"} icon={Clock} href="/timetable" className="lg:col-span-1">
          {o.currentClass ? (
            <ClassBlock c={o.currentClass} tz={o.tz} live />
          ) : o.nextClass ? (
            <ClassBlock c={o.nextClass} tz={o.tz} />
          ) : (
            <Muted>No scheduled classes in the next 7 days. Add classes in Timetable.</Muted>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">Scheduled from your timetable — not confirmed attendance.</p>
        </SectionCard>

        {/* Agenda */}
        <SectionCard title="Today's agenda" icon={CalendarClock} href="/calendar" className="lg:col-span-2">
          {o.agenda.length === 0 ? (
            <Muted>Nothing scheduled for today.</Muted>
          ) : (
            <ol className="space-y-1.5">
              {o.agenda.map((a) => (
                <li key={a.id}>
                  <Link href={a.href} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted/60">
                    <span className="w-12 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{fmtTime(a.at, o.tz)}</span>
                    <span className={cn("h-5 w-1 shrink-0 rounded-full", KIND_STYLE[a.kind])} aria-hidden="true" />
                    <span className={cn("min-w-0 flex-1 truncate text-sm", a.status === "CANCELLED" && "line-through opacity-60")}>{a.title}</span>
                    {a.suggested ? <SuggestedBadge /> : null}
                    <SourceBadge source={a.source} />
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </SectionCard>

        {/* Deadlines */}
        <SectionCard title="Upcoming deadlines" icon={ClipboardList} href="/assignments" className="lg:col-span-2">
          {o.assignments.length === 0 ? (
            <Muted>No pending deadlines in the next 7 days{o.overdueCount ? `, but ${o.overdueCount} overdue` : ""}.</Muted>
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
                  {a.suggested ? <SuggestedBadge /> : null}
                  <SourceBadge source={a.source} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* Exams */}
        <SectionCard title="Exams & quizzes" icon={GraduationCap} href="/calendar">
          {o.exams.length === 0 ? (
            <Muted>No exams or quizzes in the next 14 days.</Muted>
          ) : (
            <ul className="space-y-2">
              {o.exams.map((e) => (
                <li key={e.id} className="text-sm">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium">{e.title}</span>
                    <SourceBadge source={e.source} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {fmtDateTime(e.startsAt, o.tz)} · <Countdown to={e.startsAt.toISOString()} />
                  </p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* Recent marks */}
        <SectionCard title="Recent marks" icon={BookOpen} href="/marks">
          {o.recentMarks.length === 0 ? (
            <Muted>No graded assessments yet.</Muted>
          ) : (
            <ul className="space-y-2">
              {o.recentMarks.map((m) => (
                <li key={m.id} className="flex items-center gap-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{m.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{courseLabel(m.course)}</p>
                  </div>
                  <span className="font-mono text-sm tabular-nums">
                    {m.obtainedMarks}/{m.maxMarks}
                  </span>
                  <SourceBadge source={m.source} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* Attendance today */}
        <SectionCard title="Today's attendance" icon={UserCheck} href="/attendance">
          {o.attendanceToday.length === 0 ? (
            <Muted>No attendance recorded for today yet.</Muted>
          ) : (
            <ul className="space-y-1.5">
              {o.attendanceToday.map((r) => (
                <li key={r.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{courseLabel(r.course)}</span>
                  <span className={cn("text-xs font-medium", r.status === "ABSENT" ? "text-destructive" : "text-success")}>{r.status.toLowerCase()}</span>
                  <SourceBadge source={r.source} />
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* Tasks */}
        <SectionCard title="Tasks due today" icon={CheckSquare} href="/tasks">
          {o.tasks.length === 0 ? (
            <Muted>No open tasks due today.</Muted>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {o.tasks.map((t) => (
                <li key={t.id} className="flex items-center gap-2">
                  <span className={cn("size-2 rounded-full", t.priority === 1 ? "bg-destructive" : t.priority === 2 ? "bg-warning" : "bg-muted-foreground/40")} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  {t.dueAt && t.dueAt < now ? <span className="text-xs text-destructive">overdue</span> : null}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* Email */}
        <SectionCard title="Email" icon={Mail} meta={gmail?.status === "CONNECTED" ? <FreshnessBadge lastSuccessAt={gmail.lastSuccessAt} /> : undefined}>
          {gmail?.status === "CONNECTED" ? (
            <Suspense fallback={<Skeleton className="h-24" />}>
              <InboxCard userId={user.id} />
            </Suspense>
          ) : gmail?.status === "NEEDS_REAUTH" ? (
            <ConnectPrompt title="Gmail needs reconnecting" body="Google access expired or was revoked." cta="Reconnect" />
          ) : (
            googleConfigured() ? (
              <ConnectPrompt title="Gmail not connected" body="Connect Gmail to see unread counts and suggested academic deadlines." />
            ) : (
              <ConnectPrompt
                title="Gmail not available yet"
                body="Google sign-in isn't configured on this deployment, so Gmail can't be connected. See docs/integrations.md."
                cta="View integrations"
              />
            )
          )}
        </SectionCard>

        {/* Notes & reminders */}
        <SectionCard title="Notes & reminders" icon={NotebookPen} href="/notes">
          {o.pinnedNotes.length === 0 && o.reminders.length === 0 && o.deliveries.length === 0 ? (
            <Muted>Pin notes or schedule reminders to see them here.</Muted>
          ) : (
            <div className="space-y-3 text-sm">
              {o.pinnedNotes.map((n) => (
                <Link key={n.id} href={`/notes/${n.id}`} className="flex items-center gap-2 hover:underline">
                  <Pin className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate">{n.title}</span>
                </Link>
              ))}
              {o.reminders.map((r) => (
                <div key={r.id} className="flex items-center gap-2">
                  <Bell className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{r.title}</span>
                  <span className="text-xs text-muted-foreground">{fmtDateTime(r.remindAt, o.tz)}</span>
                </div>
              ))}
              {o.deliveries.length ? (
                <div className="border-t pt-2">
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Recently delivered</p>
                  {o.deliveries.map((d) => (
                    <p key={d.id} className="truncate text-xs text-muted-foreground">
                      {d.reminder.title} · {fmtDateTime(d.sentAt!, o.tz)}
                    </p>
                  ))}
                </div>
              ) : null}
              <p className="text-[11px] text-muted-foreground">Orbit reminders are notifications, not phone alarms.</p>
            </div>
          )}
        </SectionCard>
      </div>

      <SourcesStrip connections={o.connections} />
    </div>
  );
}

function Stat({ label, value, href, tone }: { label: string; value: number; href: string; tone?: "danger" }) {
  return (
    <Link href={href} className="rounded-xl border bg-card px-4 py-3 shadow-xs transition-colors hover:bg-muted/40">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-2xl font-semibold tabular-nums", tone === "danger" && value > 0 && "text-destructive")}>{value}</p>
    </Link>
  );
}

function ClassBlock({ c, tz, live }: { c: { title: string; startsAt: Date; endsAt: Date; room?: string | null; source: string }; tz: string; live?: boolean }) {
  return (
    <div>
      <p className="text-lg font-semibold leading-snug">{c.title}</p>
      <p className="mt-0.5 text-sm text-muted-foreground">
        {fmtDate(c.startsAt, tz)} · {fmtTime(c.startsAt, tz)}–{fmtTime(c.endsAt, tz)}
        {c.room ? ` · ${c.room}` : ""}
      </p>
      <p className="mt-3 text-2xl font-semibold text-primary">
        {live ? (
          <>
            ends <Countdown to={c.endsAt.toISOString()} />
          </>
        ) : (
          <Countdown to={c.startsAt.toISOString()} prefix="starts in " />
        )}
      </p>
      <div className="mt-2">
        <SourceBadge source={c.source} />
      </div>
    </div>
  );
}

async function InboxCard({ userId }: { userId: string }) {
  const conn = await db.integrationConnection.findUnique({ where: { userId_provider: { userId, provider: "gmail" } } });
  if (!conn) return null;
  let inbox: Awaited<ReturnType<typeof readInboxSummary>> | null = null;
  let error: string | null = null;
  try {
    inbox = await readInboxSummary(conn, "is:unread newer_than:7d");
  } catch (e) {
    error = describeError(e);
  }
  if (!inbox) return <p className="text-sm text-destructive">Couldn&apos;t load Gmail: {error}</p>;
  const academic = inbox.messages.filter((m) => m.signals.length > 0);
  return (
    <div className="space-y-2 text-sm">
      <p>
        <span className="text-2xl font-semibold tabular-nums">{inbox.unread}</span> <span className="text-muted-foreground">unread in inbox</span>
      </p>
      {academic.slice(0, 3).map((m) => (
        <div key={m.id} className="rounded-md bg-muted/50 px-2 py-1.5">
          <p className="truncate font-medium">{m.subject || "(no subject)"}</p>
          <p className="truncate text-xs text-muted-foreground">{m.signals.map((s) => s.kind).join(", ")} · suggestion</p>
        </div>
      ))}
      <Link href="/integrations/gmail" className="text-xs text-primary hover:underline">
        Open inbox insights →
      </Link>
    </div>
  );
}

function SourcesStrip({ connections }: { connections: { provider: string; status: string; lastSuccessAt: Date | null }[] }) {
  if (connections.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border bg-card/50 px-4 py-3 text-xs">
      <span className="font-medium text-muted-foreground">Sources</span>
      {connections.map((c) => (
        <span key={c.provider} className="flex items-center gap-2">
          <span className="font-medium">{getProvider(c.provider)?.name ?? c.provider}</span>
          {c.status === "NEEDS_REAUTH" ? <span className="text-destructive">needs reconnect</span> : c.status === "ERROR" ? <span className="text-destructive">error</span> : <FreshnessBadge lastSuccessAt={c.lastSuccessAt} />}
        </span>
      ))}
    </div>
  );
}
