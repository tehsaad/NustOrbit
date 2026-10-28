"use client";

import { Bell, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormDialog, SelectField, TextAreaField, TextField } from "@/components/forms";
import { saveEvent } from "@/server/actions/schedule";
import { saveReminder } from "@/server/actions/productivity";

const KINDS = ["STUDY", "EXAM", "QUIZ", "DEADLINE", "CLASS", "PERSONAL", "OTHER"].map((k) => ({ value: k, label: k.charAt(0) + k.slice(1).toLowerCase() }));

export type EventDefaults = { id: string; title: string; kind: string; courseId: string | null; startsAt: string; endsAt: string; allDay: boolean; location: string | null; description: string | null };

export function EventFormDialog({ courses, ev, defaultOpen, tz }: { courses: { value: string; label: string }[]; ev?: EventDefaults; defaultOpen?: boolean; tz: string }) {
  return (
    <FormDialog
      defaultOpen={defaultOpen}
      trigger={
        ev ? (
          <Button size="xs" variant="ghost">
            <Pencil /> Edit
          </Button>
        ) : (
          <Button size="sm">
            <Plus /> New event
          </Button>
        )
      }
      title={ev ? "Edit event" : "New Orbit event"}
      description={`Times are in ${tz}. Orbit events stay in Orbit unless you explicitly push them to Google.`}
      action={saveEvent}
      wide
    >
      {(s) => (
        <div className="grid gap-3 sm:grid-cols-2">
          {ev ? <input type="hidden" name="id" value={ev.id} /> : null}
          <TextField label="Title" name="title" required defaultValue={ev?.title ?? ""} state={s} className="sm:col-span-2" />
          <SelectField label="Type" name="kind" state={s} options={KINDS} defaultValue={ev?.kind ?? "STUDY"} />
          <SelectField label="Course" name="courseId" state={s} options={[{ value: "none", label: "No course" }, ...courses]} defaultValue={ev?.courseId ?? "none"} />
          <TextField label="Starts" name="startsAt" type="datetime-local" required defaultValue={ev?.startsAt ?? ""} state={s} />
          <TextField label="Ends" name="endsAt" type="datetime-local" defaultValue={ev?.endsAt ?? ""} state={s} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="allDay" defaultChecked={ev?.allDay} className="size-4" /> All day
          </label>
          <TextField label="Location" name="location" defaultValue={ev?.location ?? ""} state={s} />
          {!ev ? <TextField label="Remind me (minutes before)" name="remindMinutes" type="number" min={0} placeholder="e.g. 30" state={s} hint="Creates an Orbit reminder, not a phone alarm" /> : null}
          <TextAreaField label="Notes" name="description" rows={3} defaultValue={ev?.description ?? ""} state={s} className="sm:col-span-2" />
        </div>
      )}
    </FormDialog>
  );
}

export function ReminderFormDialog() {
  return (
    <FormDialog
      trigger={
        <Button size="sm" variant="outline">
          <Bell /> New reminder
        </Button>
      }
      title="New reminder"
      description="Orbit sends this as a notification on the channels you pick. It is not an alarm in your phone's clock app."
      action={saveReminder}
    >
      {(s) => (
        <div className="grid gap-3">
          <TextField label="What" name="title" required state={s} />
          <TextField label="Details" name="body" state={s} />
          <TextField label="When" name="remindAt" type="datetime-local" required state={s} />
          <SelectField
            label="Repeat"
            name="recurrence"
            state={s}
            options={[
              { value: "NONE", label: "Once" },
              { value: "DAILY", label: "Every day" },
              { value: "WEEKDAYS", label: "Weekdays" },
              { value: "WEEKLY", label: "Every week" },
            ]}
          />
          <fieldset className="grid gap-1 text-sm">
            <legend className="mb-1 text-sm font-medium">Channels</legend>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="channels" value="PUSH" defaultChecked className="size-4" /> Push notification
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="channels" value="IN_APP" defaultChecked className="size-4" /> In Orbit
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="channels" value="EMAIL" className="size-4" /> Email (if configured)
            </label>
          </fieldset>
        </div>
      )}
    </FormDialog>
  );
}
