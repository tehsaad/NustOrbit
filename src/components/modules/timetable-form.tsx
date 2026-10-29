"use client";

import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormDialog, SelectField, TextField } from "@/components/forms";
import { saveTimetableEntry } from "@/server/actions/schedule";

export type SlotDefaults = { id: string; courseId: string | null; title: string; kind: string; dayOfWeek: number; startTime: string; endTime: string; room: string | null; campus: string | null; instructor: string | null };

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function SlotFormDialog({ courses, slot }: { courses: { value: string; label: string }[]; slot?: SlotDefaults }) {
  return (
    <FormDialog
      trigger={
        slot ? (
          <Button size="icon-xs" variant="ghost" aria-label={`Edit ${slot.title}`}>
            <Pencil />
          </Button>
        ) : (
          <Button size="sm">
            <Plus /> Add class
          </Button>
        )
      }
      title={slot ? "Edit class" : "Add weekly class"}
      description="Times are local to your timezone setting. This is your schedule, not attendance."
      action={saveTimetableEntry}
      wide
    >
      {(s) => (
        <div className="grid gap-3 sm:grid-cols-2">
          {slot ? <input type="hidden" name="id" value={slot.id} /> : null}
          <SelectField label="Course" name="courseId" state={s} options={[{ value: "none", label: "No course (custom title)" }, ...courses]} defaultValue={slot?.courseId ?? courses[0]?.value ?? "none"} />
          <TextField label="Title (optional with course)" name="title" defaultValue={slot && !slot.courseId ? slot.title : ""} state={s} />
          <SelectField label="Day" name="dayOfWeek" state={s} options={DAYS.map((d, i) => ({ value: String(i), label: d }))} defaultValue={String(slot?.dayOfWeek ?? 1)} />
          <SelectField
            label="Type"
            name="kind"
            state={s}
            defaultValue={slot?.kind ?? "LECTURE"}
            options={["LECTURE", "LAB", "TUTORIAL", "OTHER"].map((k) => ({ value: k, label: k.charAt(0) + k.slice(1).toLowerCase() }))}
          />
          <TextField label="Starts" name="startTime" type="time" required defaultValue={slot?.startTime ?? "09:00"} state={s} />
          <TextField label="Ends" name="endTime" type="time" required defaultValue={slot?.endTime ?? "09:50"} state={s} />
          <TextField label="Room" name="room" defaultValue={slot?.room ?? ""} state={s} />
          <TextField label="Campus / building" name="campus" defaultValue={slot?.campus ?? ""} state={s} />
          <TextField label="Instructor" name="instructor" defaultValue={slot?.instructor ?? ""} state={s} className="sm:col-span-2" />
        </div>
      )}
    </FormDialog>
  );
}
