import type { Metadata } from "next";
import Link from "next/link";
import { CheckSquare, Trash2 } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getTimezone } from "@/server/prefs";
import { courseOptions } from "@/server/queries/courses";
import { dueBucket } from "@/domain/deadlines";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ConfirmAction, InlineAction } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { deleteTask, toggleTask } from "@/server/actions/productivity";
import { courseLabel, fmtDateTime, toLocalInput } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TaskFormDialog } from "./task-form";

export const metadata: Metadata = { title: "Tasks" };

const GROUPS = [
  { id: "overdue", label: "Overdue" },
  { id: "today", label: "Today" },
  { id: "this-week", label: "This week" },
  { id: "later", label: "Later" },
  { id: "no-date", label: "No date" },
] as const;

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ new?: string; done?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const showDone = sp.done === "1";
  const [tz, options, tasks, assignments] = await Promise.all([
    getTimezone(user.id),
    courseOptions(user.id),
    db.task.findMany({ where: { userId: user.id, ...(showDone ? { status: "DONE" } : { status: { not: "DONE" } }) }, include: { course: true, assignment: { select: { title: true } } }, orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { priority: "asc" }], take: 300 }),
    db.assignment.findMany({ where: { userId: user.id, universityStatus: { notIn: ["SUBMITTED", "GRADED"] } }, select: { id: true, title: true }, orderBy: { dueAt: "asc" }, take: 100 }),
  ]);
  const now = new Date();
  const assignmentOptions = assignments.map((a) => ({ value: a.id, label: a.title }));

  return (
    <div>
      <PageHeader
        title="Tasks"
        description="Personal work: reading, studying, revision and coursework steps."
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href={showDone ? "/tasks" : "/tasks?done=1"}>{showDone ? "Open tasks" : "Completed"}</Link>
            </Button>
            <TaskFormDialog courses={options} assignments={assignmentOptions} defaultOpen={sp.new === "1"} />
          </>
        }
      />
      {tasks.length === 0 ? (
        <EmptyState icon={CheckSquare} title={showDone ? "Nothing completed yet" : "No open tasks"} description="Break assignments into steps or plan study sessions." />
      ) : (
        <div className="space-y-6">
          {(showDone ? [{ id: "all", label: "Completed" }] : GROUPS).map((g) => {
            const list = showDone ? tasks : tasks.filter((t) => dueBucket(t.dueAt, now, tz) === g.id);
            if (list.length === 0) return null;
            return (
              <section key={g.id}>
                <h2 className={cn("mb-2 text-sm font-semibold", g.id === "overdue" ? "text-destructive" : "text-muted-foreground")}>
                  {g.label} <span className="font-normal">({list.length})</span>
                </h2>
                <ul className="divide-y rounded-xl border bg-card">
                  {list.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 px-3 py-2">
                      <InlineAction action={toggleTask} hidden={{ id: t.id }}>
                        <button type="submit" aria-label={t.status === "DONE" ? `Reopen ${t.title}` : `Complete ${t.title}`} className={cn("grid size-5 place-items-center rounded-full border-2", t.status === "DONE" ? "border-success bg-success text-white" : t.priority === 1 ? "border-destructive" : "border-muted-foreground/50")}>
                          {t.status === "DONE" ? "✓" : null}
                        </button>
                      </InlineAction>
                      <div className="min-w-0 flex-1">
                        <p className={cn("truncate text-sm", t.status === "DONE" && "text-muted-foreground line-through")}>{t.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[t.kind.toLowerCase(), t.course ? courseLabel(t.course) : null, t.assignment ? `for ${t.assignment.title}` : null, t.dueAt ? fmtDateTime(t.dueAt, tz) : null].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                      <TaskFormDialog
                        courses={options}
                        assignments={assignmentOptions}
                        task={{ id: t.id, title: t.title, notes: t.notes, kind: t.kind, priority: t.priority, dueAt: toLocalInput(t.dueAt, tz), courseId: t.courseId, assignmentId: t.assignmentId }}
                      />
                      <ConfirmAction
                        action={deleteTask}
                        hidden={{ id: t.id }}
                        title="Delete task?"
                        description={`“${t.title}” will be removed.`}
                        trigger={
                          <Button size="icon-xs" variant="ghost" aria-label="Delete task">
                            <Trash2 />
                          </Button>
                        }
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
