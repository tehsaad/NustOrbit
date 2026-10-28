"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormDialog, SelectField, TextField } from "@/components/forms";
import { saveAttendance } from "@/server/actions/schedule";

export function AttendanceFormDialog({ courses, today }: { courses: { value: string; label: string }[]; today: string }) {
  return (
    <FormDialog
      trigger={
        <Button size="sm" disabled={courses.length === 0}>
          <Plus /> Record attendance
        </Button>
      }
      title="Record attendance"
      description="Manual records are labelled as maintained by you."
      action={saveAttendance}
    >
      {(s) => (
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField label="Course" name="courseId" state={s} options={courses} required className="sm:col-span-2" />
          <TextField label="Date" name="date" type="date" required defaultValue={today} state={s} />
          <SelectField
            label="Status"
            name="status"
            state={s}
            options={[
              { value: "PRESENT", label: "Present" },
              { value: "ABSENT", label: "Absent" },
              { value: "LATE", label: "Late" },
              { value: "LEAVE", label: "Leave" },
            ]}
          />
          <TextField label="Sessions (contact hours)" name="sessions" type="number" min={1} max={6} defaultValue={1} state={s} />
          <TextField label="Note" name="note" state={s} />
        </div>
      )}
    </FormDialog>
  );
}
