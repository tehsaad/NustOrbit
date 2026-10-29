"use client";

import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormDialog, SelectField, TextField } from "@/components/forms";
import { saveAssessment, saveGrade } from "@/server/actions/academics";

export type AssessmentDefaults = {
  id: string;
  courseId: string;
  title: string;
  category: string;
  obtainedMarks: number | null;
  maxMarks: number;
  weightPct: number | null;
  classAverage: number | null;
  heldAt: string;
};

const CATS = ["QUIZ", "ASSIGNMENT", "MIDTERM", "FINAL", "LAB", "PROJECT", "PRESENTATION", "OTHER"].map((c) => ({ value: c, label: c.charAt(0) + c.slice(1).toLowerCase() }));

export function AssessmentFormDialog({ courses, a, courseId }: { courses: { value: string; label: string }[]; a?: AssessmentDefaults; courseId?: string }) {
  return (
    <FormDialog
      trigger={
        a ? (
          <Button size="icon-xs" variant="ghost" aria-label={`Edit ${a.title}`}>
            <Pencil />
          </Button>
        ) : (
          <Button size="sm" disabled={courses.length === 0}>
            <Plus /> Add assessment
          </Button>
        )
      }
      title={a ? "Edit assessment" : "Add assessment"}
      description="Leave obtained marks blank for work that isn't graded yet; it then counts toward remaining weight."
      action={saveAssessment}
      wide
    >
      {(s) => (
        <div className="grid gap-3 sm:grid-cols-2">
          {a ? <input type="hidden" name="id" value={a.id} /> : null}
          <SelectField label="Course" name="courseId" state={s} options={courses} defaultValue={a?.courseId ?? courseId} required className="sm:col-span-2" />
          <TextField label="Title" name="title" required defaultValue={a?.title ?? ""} placeholder="Quiz 3" state={s} />
          <SelectField label="Type" name="category" state={s} options={CATS} defaultValue={a?.category ?? "QUIZ"} />
          <TextField label="Obtained marks" name="obtainedMarks" type="number" step="any" min={0} defaultValue={a?.obtainedMarks ?? ""} state={s} />
          <TextField label="Maximum marks" name="maxMarks" type="number" step="any" min={0} required defaultValue={a?.maxMarks ?? ""} state={s} />
          <TextField label="Weight (% of course)" name="weightPct" type="number" step="any" min={0} max={100} defaultValue={a?.weightPct ?? ""} state={s} hint="From the course outline" />
          <TextField label="Class average (marks)" name="classAverage" type="number" step="any" min={0} defaultValue={a?.classAverage ?? ""} state={s} hint="Only if announced; saved as manual input" />
          <TextField label="Date" name="heldAt" type="date" defaultValue={a?.heldAt ?? ""} state={s} />
        </div>
      )}
    </FormDialog>
  );
}

export function GradeFormDialog({ courses }: { courses: { value: string; label: string }[] }) {
  return (
    <FormDialog
      trigger={
        <Button size="sm" variant="outline" disabled={courses.length === 0}>
          <Plus /> Record official grade
        </Button>
      }
      title="Record an official course grade"
      description="Copy exactly from your result card or transcript. Orbit never converts percentages into grades."
      action={saveGrade}
    >
      {(s) => (
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label="Course" name="courseId" state={s} options={courses} required className="sm:col-span-2" />
          <TextField label="Term" name="term" placeholder="Fall 2026" state={s} />
          <TextField label="Letter grade" name="letter" placeholder="A" state={s} />
          <TextField label="Grade points" name="gradePoints" type="number" step="0.01" min={0} max={10} state={s} />
          <TextField label="Course percentage (if shown)" name="percentage" type="number" step="0.01" min={0} max={100} state={s} />
        </div>
      )}
    </FormDialog>
  );
}
