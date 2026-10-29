import type { Metadata } from "next";
import { BookOpen, Trash2 } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getPrefs } from "@/server/prefs";
import { courseOptions } from "@/server/queries/courses";
import { creditWeightedGpa } from "@/domain/grades";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { SectionCard } from "@/components/section-card";
import { SourceBadge } from "@/components/source-badge";
import { ConfirmAction } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { CourseMarks } from "@/components/modules/course-marks";
import { GradeFormDialog } from "@/components/modules/assessment-form";
import { deleteGrade } from "@/server/actions/academics";
import { courseLabel } from "@/lib/format";

export const metadata: Metadata = { title: "Marks" };

export default async function MarksPage() {
  const user = await requireUser();
  const prefs = await getPrefs(user.id);
  const [courses, options, grades] = await Promise.all([
    db.course.findMany({ where: { userId: user.id, archived: false }, include: { assessments: { orderBy: [{ heldAt: "asc" }, { createdAt: "asc" }] } }, orderBy: [{ code: "asc" }, { name: "asc" }] }),
    courseOptions(user.id),
    db.grade.findMany({ where: { userId: user.id }, include: { course: true }, orderBy: [{ term: "desc" }, { updatedAt: "desc" }] }),
  ]);
  const byTerm = new Map<string, typeof grades>();
  for (const g of grades) byTerm.set(g.term ?? "Unspecified term", [...(byTerm.get(g.term ?? "Unspecified term") ?? []), g]);
  const cgpa = creditWeightedGpa(grades.map((g) => ({ gradePoints: g.gradePoints, creditHours: g.course.creditHours })));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Marks"
        description="Raw percentage, weighted contribution, and official grades are shown separately. Orbit never invents a grading or GPA scale."
        actions={<GradeFormDialog courses={options} />}
      />
      {courses.length === 0 ? (
        <EmptyState icon={BookOpen} title="No courses yet" description="Add a course first, then record assessments as marks are released." />
      ) : (
        courses.map((c) => <CourseMarks key={c.id} course={c} assessments={c.assessments} courseOptions={options} tz={prefs.timezone} defaultTarget={prefs.defaultTargetPct} />)
      )}

      <SectionCard title="Official grades, semester GPA & CGPA">
        {grades.length === 0 ? (
          <p className="text-sm text-muted-foreground">Record official grades from your result card (or import Qalam results) to see GPA. Orbit only averages grade points you provide.</p>
        ) : (
          <div className="space-y-4">
            {[...byTerm.entries()].map(([term, rows]) => {
              const gpa = creditWeightedGpa(rows.map((g) => ({ gradePoints: g.gradePoints, creditHours: g.course.creditHours })));
              return (
                <div key={term}>
                  <div className="flex items-baseline gap-3">
                    <h3 className="text-sm font-semibold">{term}</h3>
                    <span className="text-xs text-muted-foreground">Semester GPA {gpa != null ? <span className="font-semibold text-foreground">{gpa.toFixed(2)}</span> : "— (needs grade points and credit hours)"}</span>
                  </div>
                  <ul className="mt-1 divide-y text-sm">
                    {rows.map((g) => (
                      <li key={g.id} className="flex items-center gap-2 py-1.5">
                        <span className="min-w-0 flex-1 truncate">{courseLabel(g.course)}</span>
                        <span className="tabular-nums text-muted-foreground">{g.course.creditHours ?? "?"} cr</span>
                        <span className="w-10 text-right font-semibold">{g.letter ?? "—"}</span>
                        <span className="w-12 text-right tabular-nums">{g.gradePoints?.toFixed(2) ?? "—"}</span>
                        <SourceBadge source={g.source} />
                        <ConfirmAction
                          action={deleteGrade}
                          hidden={{ id: g.id }}
                          title="Delete grade?"
                          description="This official grade record will be removed from Orbit."
                          trigger={
                            <Button size="icon-xs" variant="ghost" aria-label="Delete grade">
                              <Trash2 />
                            </Button>
                          }
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            <p className="border-t pt-3 text-sm">
              CGPA (from recorded grades): <span className="font-semibold">{cgpa != null ? cgpa.toFixed(2) : "—"}</span>
              <span className="ml-2 text-xs text-muted-foreground">Credit-weighted mean of the grade points above; your official CGPA is the one on your transcript.</span>
            </p>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
