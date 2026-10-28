"use client";

import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormDialog, TextField } from "@/components/forms";
import { saveCourse } from "@/server/actions/academics";

export type CourseDefaults = {
  id?: string;
  name?: string;
  code?: string | null;
  instructor?: string | null;
  creditHours?: number | null;
  term?: string | null;
  url?: string | null;
  targetPct?: number | null;
  attendanceThresholdPct?: number | null;
};

export function CourseFormDialog({ course, variant = "add" }: { course?: CourseDefaults; variant?: "add" | "edit" }) {
  const c = course ?? {};
  return (
    <FormDialog
      trigger={
        variant === "add" ? (
          <Button size="sm">
            <Plus /> Add course
          </Button>
        ) : (
          <Button size="icon-sm" variant="ghost" aria-label="Edit course">
            <Pencil />
          </Button>
        )
      }
      title={c.id ? "Edit course" : "Add course"}
      action={saveCourse}
      wide
    >
      {(s) => (
        <div className="grid gap-3 sm:grid-cols-2">
          {c.id ? <input type="hidden" name="id" value={c.id} /> : null}
          <TextField label="Course name" name="name" required defaultValue={c.name ?? ""} state={s} className="sm:col-span-2" />
          <TextField label="Code" name="code" defaultValue={c.code ?? ""} placeholder="CS-212" state={s} />
          <TextField label="Credit hours" name="creditHours" type="number" step="0.5" min={0} max={12} defaultValue={c.creditHours ?? ""} state={s} />
          <TextField label="Instructor" name="instructor" defaultValue={c.instructor ?? ""} state={s} />
          <TextField label="Term" name="term" defaultValue={c.term ?? ""} placeholder="Fall 2026" state={s} />
          <TextField label="Target %" name="targetPct" type="number" step="0.1" min={0} max={100} defaultValue={c.targetPct ?? ""} state={s} hint="Used by the marks planner" />
          <TextField label="Attendance minimum % (override)" name="attendanceThresholdPct" type="number" step="0.1" min={1} max={100} defaultValue={c.attendanceThresholdPct ?? ""} state={s} hint="Only if this course has its own rule" />
          <TextField label="Course page URL" name="url" type="url" defaultValue={c.url ?? ""} state={s} className="sm:col-span-2" />
        </div>
      )}
    </FormDialog>
  );
}
