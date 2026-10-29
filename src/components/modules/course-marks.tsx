import { Trash2 } from "lucide-react";
import { computeStanding, gapToClassAverage } from "@/domain/grades";
import { SourceBadge } from "@/components/source-badge";
import { ConfirmAction } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { deleteAssessment } from "@/server/actions/academics";
import { AssessmentFormDialog } from "./assessment-form";
import { MarksChart } from "./marks-chart";
import { TargetPlanner } from "./target-planner";
import { courseLabel, pct, toDateInput } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Assessment, Course } from "@/generated/prisma/client";

export function CourseMarks({ course, assessments, courseOptions, tz, defaultTarget }: { course: Course; assessments: Assessment[]; courseOptions: { value: string; label: string }[]; tz: string; defaultTarget: number | null }) {
  const standing = computeStanding(assessments);
  const graded = assessments.filter((a) => a.obtainedMarks != null).sort((a, b) => (a.heldAt?.getTime() ?? a.createdAt.getTime()) - (b.heldAt?.getTime() ?? b.createdAt.getTime()));
  const chart = graded.map((a) => ({ label: a.title.slice(0, 14), you: (a.obtainedMarks! / a.maxMarks) * 100, avg: a.classAverage != null ? (a.classAverage / a.maxMarks) * 100 : null }));

  return (
    <section className="rounded-xl border bg-card p-4 shadow-xs">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="font-semibold">{courseLabel(course)}</h2>
        <SourceBadge source={course.source} />
        <div className="ml-auto">
          <AssessmentFormDialog courses={courseOptions} courseId={course.id} />
        </div>
      </header>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Raw percentage" value={pct(standing.rawPct)} hint={`${standing.rawObtained}/${standing.rawMax} marks, unweighted`} />
        <Metric label="Weighted so far" value={pct(standing.weightedPctSoFar)} hint={`on ${standing.gradedWeight}% graded weight`} />
        <Metric label="Earned contribution" value={`${standing.earnedPoints} pts`} hint="of the 100-point course total" />
        <Metric label="Remaining weight" value={`${standing.remainingWeight}%`} hint={standing.maxAttainablePct != null ? `max attainable ${standing.maxAttainablePct}%` : "add weights to plan"} />
      </dl>

      {standing.warnings.length ? (
        <ul className="mt-3 space-y-1 text-xs text-warning">
          {standing.warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <MarksChart data={chart} />
        <TargetPlanner standing={standing} initialTarget={course.targetPct ?? defaultTarget} id={course.id} />
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="py-2 font-normal">Assessment</th>
              <th className="py-2 font-normal">Marks</th>
              <th className="py-2 font-normal">%</th>
              <th className="py-2 font-normal">Weight</th>
              <th className="py-2 font-normal">Contribution</th>
              <th className="py-2 font-normal">Class avg</th>
              <th className="py-2 font-normal">vs avg</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {assessments.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-4 text-center text-muted-foreground">
                  No assessments yet.
                </td>
              </tr>
            ) : (
              assessments.map((a) => {
                const p = a.obtainedMarks != null ? (a.obtainedMarks / a.maxMarks) * 100 : null;
                const contrib = p != null && a.weightPct != null ? (p / 100) * a.weightPct : null;
                const gap = gapToClassAverage(a);
                return (
                  <tr key={a.id} className="border-b last:border-0">
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{a.title}</span>
                        <span className="text-[10px] uppercase text-muted-foreground">{a.category.toLowerCase()}</span>
                        <SourceBadge source={a.source} />
                      </div>
                    </td>
                    <td className="py-2 tabular-nums">{a.obtainedMarks != null ? `${a.obtainedMarks}/${a.maxMarks}` : <span className="text-muted-foreground">pending/{a.maxMarks}</span>}</td>
                    <td className="py-2 tabular-nums">{pct(p)}</td>
                    <td className="py-2 tabular-nums">{a.weightPct != null ? `${a.weightPct}%` : "—"}</td>
                    <td className="py-2 tabular-nums">{contrib != null ? `${contrib.toFixed(2)} pts` : "—"}</td>
                    <td className="py-2 tabular-nums">
                      {a.classAverage != null ? (
                        <span title={a.classAverageSrc === "MANUAL" ? "Entered manually" : "From source"}>
                          {a.classAverage}
                          {a.classAverageSrc === "MANUAL" ? <span className="ml-1 text-[10px] text-muted-foreground">(manual)</span> : null}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={cn("py-2 tabular-nums", gap != null && (gap >= 0 ? "text-success" : "text-destructive"))}>{gap != null ? `${gap > 0 ? "+" : ""}${gap} pp` : "—"}</td>
                    <td className="py-2 text-right">
                      <AssessmentFormDialog
                        courses={courseOptions}
                        a={{ id: a.id, courseId: a.courseId, title: a.title, category: a.category, obtainedMarks: a.obtainedMarks, maxMarks: a.maxMarks, weightPct: a.weightPct, classAverage: a.classAverage, heldAt: toDateInput(a.heldAt, tz) }}
                      />
                      <ConfirmAction
                        action={deleteAssessment}
                        hidden={{ id: a.id }}
                        title="Delete assessment?"
                        description={`“${a.title}” will be removed.${a.source !== "MANUAL" ? " It may be re-imported on the next sync." : ""}`}
                        trigger={
                          <Button size="icon-xs" variant="ghost" aria-label={`Delete ${a.title}`}>
                            <Trash2 />
                          </Button>
                        }
                      />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
      <dd className="text-[11px] text-muted-foreground">{hint}</dd>
    </div>
  );
}
