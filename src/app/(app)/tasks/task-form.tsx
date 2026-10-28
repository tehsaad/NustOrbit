"use client";

import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormDialog, SelectField, TextAreaField, TextField } from "@/components/forms";
import { saveTask } from "@/server/actions/productivity";

type Opt = { value: string; label: string };
type TaskDefaults = { id: string; title: string; notes: string | null; kind: string; priority: number; dueAt: string; courseId: string | null; assignmentId: string | null };

export function TaskFormDialog({ courses, assignments, task, defaultOpen }: { courses: Opt[]; assignments: Opt[]; task?: TaskDefaults; defaultOpen?: boolean }) {
  return (
    <FormDialog
      defaultOpen={defaultOpen}
      trigger={
        task ? (
          <Button size="icon-xs" variant="ghost" aria-label={`Edit ${task.title}`}>
            <Pencil />
          </Button>
        ) : (
          <Button size="sm">
            <Plus /> New task
          </Button>
        )
      }
      title={task ? "Edit task" : "New task"}
      action={saveTask}
    >
      {(s) => (
        <div className="grid gap-3 sm:grid-cols-2">
          {task ? <input type="hidden" name="id" value={task.id} /> : null}
          <TextField label="Task" name="title" required defaultValue={task?.title ?? ""} state={s} className="sm:col-span-2" />
          <SelectField
            label="Kind"
            name="kind"
            state={s}
            defaultValue={task?.kind ?? "STUDY"}
            options={["READING", "STUDY", "REVISION", "COURSEWORK", "PERSONAL", "OTHER"].map((k) => ({ value: k, label: k.charAt(0) + k.slice(1).toLowerCase() }))}
          />
          <SelectField
            label="Priority"
            name="priority"
            state={s}
            defaultValue={String(task?.priority ?? 2)}
            options={[
              { value: "1", label: "High" },
              { value: "2", label: "Normal" },
              { value: "3", label: "Low" },
            ]}
          />
          <TextField label="Due" name="dueAt" type="datetime-local" defaultValue={task?.dueAt ?? ""} state={s} />
          <SelectField label="Course" name="courseId" state={s} options={[{ value: "none", label: "No course" }, ...courses]} defaultValue={task?.courseId ?? "none"} />
          <SelectField label="Linked assignment" name="assignmentId" state={s} options={[{ value: "none", label: "None" }, ...assignments]} defaultValue={task?.assignmentId ?? "none"} className="sm:col-span-2" />
          <TextAreaField label="Notes" name="notes" rows={3} defaultValue={task?.notes ?? ""} state={s} className="sm:col-span-2" />
        </div>
      )}
    </FormDialog>
  );
}
