import Link from "next/link";
import { AlertTriangle, CheckCircle2, GraduationCap, TrendingUp } from "lucide-react";
import { getAcademicStanding } from "@/server/queries/academics";
import { cn } from "@/lib/utils";

const DOT: Record<string, string> = { high: "bg-destructive", medium: "bg-warning", low: "bg-muted-foreground/50" };

function Tile({ label, value, hint, href }: { label: string; value: string; hint?: string; href?: string }) {
  const body = (
    <>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </>
  );
  return href ? (
    <Link href={href} className="rounded-xl border bg-card px-4 py-3 shadow-xs transition-colors hover:bg-muted/40">
      {body}
    </Link>
  ) : (
    <div className="rounded-xl border bg-card px-4 py-3 shadow-xs">{body}</div>
  );
}

/** Academics-first header block: GPA/CGPA and the courses that need attention, with transparent reasons. */
export async function AcademicStanding({ userId, now }: { userId: string; now: Date }) {
  const s = await getAcademicStanding(userId, now);
  if (s.courseCount === 0) return null;

  return (
    <section aria-label="Academic standing" className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="CGPA"
          value={s.cgpa != null ? s.cgpa.toFixed(2) : "—"}
          hint={s.cgpa != null ? `from ${s.gradeCount} recorded grade${s.gradeCount === 1 ? "" : "s"}` : "record official grades"}
          href="/marks"
        />
        <Tile
          label={s.latestTerm ? `GPA · ${s.latestTerm}` : "Semester GPA"}
          value={s.semesterGpa != null ? s.semesterGpa.toFixed(2) : "—"}
          hint={s.semesterGpa != null ? "credit-weighted" : "needs grade points"}
          href="/marks"
        />
        <Tile label="Active courses" value={String(s.courseCount)} hint={s.credits ? `${s.credits} credit hours` : undefined} href="/courses" />
        <Tile label="Graded assessments" value={String(s.gradedAssessmentCount)} hint="across all courses" href="/marks" />
      </div>

      <div className="rounded-xl border bg-card p-4 shadow-xs">
        <header className="mb-3 flex items-center gap-2">
          {s.attention.length ? <AlertTriangle className="size-4 text-warning" aria-hidden="true" /> : <CheckCircle2 className="size-4 text-success" aria-hidden="true" />}
          <h2 className="text-sm font-semibold">Courses needing attention</h2>
          <Link href="/academics" className="ml-auto text-xs text-primary hover:underline">
            Academics →
          </Link>
        </header>
        {s.attention.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <TrendingUp className="size-4 text-success" aria-hidden="true" /> All courses on track — no attendance, deadline or target flags right now.
          </p>
        ) : (
          <ul className="divide-y">
            {s.attention.map((c) => (
              <li key={c.id} className="flex items-start gap-3 py-2">
                <GraduationCap className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <Link href={`/courses/${c.id}`} className="text-sm font-medium hover:underline">
                    {c.label}
                  </Link>
                  <ul className="mt-0.5 space-y-0.5">
                    {c.reasons.map((r, i) => (
                      <li key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className={cn("size-1.5 shrink-0 rounded-full", DOT[r.severity])} aria-hidden="true" />
                        {r.text}
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[11px] text-muted-foreground">Flags use only your real data — attendance appears only if you&apos;ve set a minimum, targets only if you&apos;ve set one.</p>
      </div>
    </section>
  );
}
