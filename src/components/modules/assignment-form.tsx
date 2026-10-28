"use client";

import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormDialog, SelectField, TextAreaField, TextField } from "@/components/forms";
import { saveAssignment } from "@/server/actions/academics";

export type AssignmentDefaults = {
  id: string;
  title: string;
  courseId: string | null;
  dueAt: string;
  maxMarks: number | null;
  weightPct: number | null;
  url: string | null;
  description: string | null;
  notes: string | null;
  personalStatus: string;
};

export function AssignmentFormDialog({ courses, a, defaultOpen }: { courses: { value: string; label: string }[]; a?: AssignmentDefaults; defaultOpen?: boolean }) {
  return (
    <FormDialog
      defaultOpen={defaultOpen}
      trigger={
        a ? (
          <Button size="icon-xs" variant="ghost" aria-label={`Edit ${a.title}`}>
            <Pencil />
          </Button>
        ) : (
          <Button size="sm">
            <Plus /> Add assignment
          </Button>
        )
      }
      title={a ? "Edit assignment" : "Add assignment"}
      description="Your own status is separate from the university's. Only a university source can mark work as submitted."
      action={saveAssignment}
      wide
    >
      {(s) => (
        <div className="grid gap-3 sm:grid-cols-2">
          {a ? <input type="hidden" name="id" value={a.id} /> : null}
          <TextField label="Title" name="title" required defaultValue={a?.title ?? ""} state={s} className="sm:col-span-2" />
          <SelectField label="Course" name="courseId" state={s} options={[{ value: "none", label: "No course" }, ...courses]} defaultValue={a?.courseId ?? "none"} />
          <TextField label="Deadline" name="dueAt" type="datetime-local" defaultValue={a?.dueAt ?? ""} state={s} />
          <TextField label="Maximum marks" name="maxMarks" type="number" step="any" min={0} defaultValue={a?.maxMarks ?? ""} state={s} />
          <TextField label="Weight (% of course)" name="weightPct" type="number" step="any" min={0} max={100} defaultValue={a?.weightPct ?? ""} state={s} />
          <TextField label="University link" name="url" type="url" defaultValue={a?.url ?? ""} state={s} className="sm:col-span-2" />
          <SelectField
            label="My progress"
            name="personalStatus"
            state={s}
            defaultValue={a?.personalStatus ?? "TODO"}
            options={[
              { value: "TODO", label: "Not started" },
              { value: "IN_PROGRESS", label: "In progress" },
              { value: "DONE", label: "Done (my side)" },
            ]}
          />
          <TextAreaField label="Description" name="description" rows={2} defaultValue={a?.description ?? ""} state={s} className="sm:col-span-2" />
          <TextAreaField label="Personal notes" name="notes" rows={3} defaultValue={a?.notes ?? ""} state={s} className="sm:col-span-2" />
        </div>
      )}
    </FormDialog>
  );
}
