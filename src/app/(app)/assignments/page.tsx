import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, ExternalLink, Trash2 } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getTimezone } from "@/server/prefs";
import { courseOptions } from "@/server/queries/courses";
import { dueBucket, matchesFilter, type AssignmentFilter } from "@/domain/deadlines";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { SourceBadge, SuggestedBadge } from "@/components/source-badge";
import { ConfirmAction, InlineAction } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Countdown } from "@/components/live-clock";
import { AssignmentFormDialog } from "@/components/modules/assignment-form";
import { Checklist } from "@/components/modules/checklist";
import { confirmSuggestedAssignment, deleteAssignment, setAssignmentPersonalStatus } from "@/server/actions/academics";
import { courseLabel, fmtDateTime, toLocalInput } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Assignments" };

const FILTERS: { id: AssignmentFilter; label: string }[] = [
  { id: "pending", label: "Pending" },
  { id: "today", label: "Due today" },
  { id: "week", label: "This week" },
  { id: "overdue", label: "Overdue" },
  { id: "submitted", label: "Submitted" },
  { id: "graded", label: "Graded" },
  { id: "all", label: "All" },
];

const UNI: Record<string, { label: string; className: string }> = {
  UNKNOWN: { label: "University status unknown", className: "text-muted-foreground" },
  NOT_SUBMITTED: { label: "Not submitted (per LMS)", className: "text-warning" },
  SUBMITTED: { label: "Submitted (per LMS)", className: "text-success" },
  GRADED: { label: "Graded (per LMS)", className: "text-success" },
};

const MINE: Record<string, string> = { TODO: "Not started", IN_PROGRESS: "In progress", DONE: "Done (my side)" };

export default async function AssignmentsPage({ searchParams }: { searchParams: Promise<{ filter?: string; new?: string; course?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const filter = (FILTERS.find((f) => f.id === sp.filter)?.id ?? "pending") as AssignmentFilter;
  const [tz, options, all] = await Promise.all([
    getTimezone(user.id),
    courseOptions(user.id),
    db.assignment.findMany({ where: { userId: user.id, ...(sp.course ? { courseId: sp.course } : {}) }, include: { course: true, submissions: { orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }] }),
  ]);
  const now = new Date();
  const list = all.filter((a) => matchesFilter(a, filter, now, tz));
  const counts = Object.fromEntries(FILTERS.map((f) => [f.id, all.filter((a) => matchesFilter(a, f.id, now, tz)).length]));

  return (
    <div>
      <PageHeader title="Assignments" description="Deadlines from every source. University status and your own progress are tracked separately." actions={<AssignmentFormDialog courses={options} defaultOpen={sp.new === "1"} />} />
      <nav aria-label="Filters" className="mb-4 flex gap-1 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <Link
            key={f.id}
            href={`/assignments?filter=${f.id}`}
            aria-current={filter === f.id ? "page" : undefined}
            className={cn("shrink-0 rounded-full border px-3 py-1 text-sm", filter === f.id ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}
          >
            {f.label} <span className="tabular-nums opacity-70">{counts[f.id]}</span>
          </Link>
        ))}
      </nav>
      {list.length === 0 ? (
        <EmptyState icon={ClipboardList} title={all.length === 0 ? "No assignments yet" : "Nothing in this view"} description={all.length === 0 ? "Connect the LMS calendar to import deadlines, or add assignments yourself." : undefined} />
      ) : (
        <ul className="space-y-3">
          {list.map((a) => {
            const bucket = dueBucket(a.dueAt, now, tz);
            const confirmed = a.universityStatus === "SUBMITTED" || a.universityStatus === "GRADED";
            const checklist = Array.isArray(a.checklist) ? (a.checklist as { text: string; done: boolean }[]) : [];
            return (
              <li key={a.id} className={cn("rounded-xl border bg-card p-4 shadow-xs", a.suggested && "border-dashed border-amber-500/50")}>
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-medium">{a.title}</h2>
                      <SourceBadge source={a.source} />
                      {a.suggested ? <SuggestedBadge /> : null}
                    </div>
                    <p className="text-xs text-muted-foreground">{courseLabel(a.course)}</p>
                  </div>
                  <div className="text-right text-sm">
                    {a.dueAt ? (
                      <>
                        <p className={cn("font-medium", !confirmed && bucket === "overdue" && "text-destructive", !confirmed && bucket === "today" && "text-warning")}>
                          {!confirmed && bucket === "overdue" ? "Overdue" : <Countdown to={a.dueAt.toISOString()} prefix="due in " />}
                        </p>
                        <p className="text-xs text-muted-foreground">{fmtDateTime(a.dueAt, tz)}</p>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">No deadline</p>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                  <span className={UNI[a.universityStatus].className}>{UNI[a.universityStatus].label}</span>
                  {a.submissions[0]?.submittedAt ? <span className="text-muted-foreground">submitted {fmtDateTime(a.submissions[0].submittedAt, tz)}</span> : null}
                  {a.obtainedMarks != null ? (
                    <span>
                      Grade {a.obtainedMarks}
                      {a.maxMarks ? `/${a.maxMarks}` : ""}
                    </span>
                  ) : a.maxMarks ? (
                    <span className="text-muted-foreground">Out of {a.maxMarks}</span>
                  ) : null}
                  {a.weightPct != null ? <span className="text-muted-foreground">{a.weightPct}% of course</span> : null}
                  <InlineAction action={setAssignmentPersonalStatus} hidden={{ id: a.id, personalStatus: a.personalStatus === "DONE" ? "TODO" : a.personalStatus === "TODO" ? "IN_PROGRESS" : "DONE" }}>
                    <button type="submit" className="rounded-full border px-2 py-0.5 hover:bg-muted" title="Cycle my progress">
                      Me: {MINE[a.personalStatus]}
                    </button>
                  </InlineAction>
                </div>
                {a.feedback ? <p className="mt-2 text-sm">Feedback: {a.feedback}</p> : null}
                {a.notes ? <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{a.notes}</p> : null}
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-muted-foreground">
                    Checklist {checklist.length ? `(${checklist.filter((c) => c.done).length}/${checklist.length})` : ""}
                  </summary>
                  <div className="mt-2">
                    <Checklist assignmentId={a.id} initial={checklist} />
                  </div>
                </details>
                <div className="mt-2 flex flex-wrap items-center justify-end gap-1">
                  {a.suggested ? (
                    <InlineAction action={confirmSuggestedAssignment} hidden={{ id: a.id }}>
                      <Button type="submit" size="xs" variant="outline">
                        Confirm suggestion
                      </Button>
                    </InlineAction>
                  ) : null}
                  {a.url ? (
                    <Button asChild size="xs" variant="ghost">
                      <a href={a.url} target="_blank" rel="noreferrer noopener">
                        <ExternalLink /> Open original
                      </a>
                    </Button>
                  ) : null}
                  <AssignmentFormDialog
                    courses={options}
                    a={{ id: a.id, title: a.title, courseId: a.courseId, dueAt: toLocalInput(a.dueAt, tz), maxMarks: a.maxMarks, weightPct: a.weightPct, url: a.url, description: a.description, notes: a.notes, personalStatus: a.personalStatus }}
                  />
                  <ConfirmAction
                    action={deleteAssignment}
                    hidden={{ id: a.id }}
                    title="Delete assignment?"
                    description={a.source === "LMS" ? "It will come back on the next LMS sync if it is still in your calendar." : "This can't be undone."}
                    trigger={
                      <Button size="icon-xs" variant="ghost" aria-label="Delete">
                        <Trash2 />
                      </Button>
                    }
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
