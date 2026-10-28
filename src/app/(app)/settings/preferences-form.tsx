"use client";

import { SelectField, SubmitButton, TextField, useFormAction } from "@/components/forms";
import { savePreferences } from "@/server/actions/schedule";

type Prefs = {
  timezone: string;
  attendanceThresholdPct: number | null;
  attendancePolicyNote: string | null;
  attendanceLateAs: string;
  attendanceLeaveAs: string;
  defaultTargetPct: number | null;
  weekStartsOn: number;
  defaultReminderMinutes: number;
  notifyPush: boolean;
  notifyEmail: boolean;
};

const ZONES = ["Asia/Karachi", "UTC", "Asia/Dubai", "Asia/Riyadh", "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "Asia/Kolkata", "Asia/Shanghai", "Australia/Sydney"];

export function PreferencesForm({ prefs }: { prefs: Prefs }) {
  const { state, formAction, pending } = useFormAction(savePreferences);
  const zones = ZONES.includes(prefs.timezone) ? ZONES : [prefs.timezone, ...ZONES];
  return (
    <form action={formAction} className="grid gap-4 sm:grid-cols-2">
      <SelectField label="Timezone" name="timezone" state={state} defaultValue={prefs.timezone} options={zones.map((z) => ({ value: z, label: z }))} />
      <SelectField
        label="Week starts on"
        name="weekStartsOn"
        state={state}
        defaultValue={String(prefs.weekStartsOn)}
        options={[
          { value: "1", label: "Monday" },
          { value: "0", label: "Sunday" },
          { value: "6", label: "Saturday" },
        ]}
      />
      <div className="sm:col-span-2">
        <h3 className="text-sm font-semibold">Attendance policy</h3>
        <p className="text-xs text-muted-foreground">
          Orbit doesn&apos;t assume a minimum attendance. Enter the threshold from your official academic regulations or course outline. Leave blank to hide
          allowance calculations.
        </p>
      </div>
      <TextField label="Minimum attendance (%)" name="attendanceThresholdPct" type="number" min={1} max={100} step="0.1" defaultValue={prefs.attendanceThresholdPct ?? ""} state={state} />
      <TextField label="Policy source (for your reference)" name="attendancePolicyNote" defaultValue={prefs.attendancePolicyNote ?? ""} placeholder="e.g. UG regulations 2024, §x" state={state} />
      <SelectField
        label="Late marks count as"
        name="attendanceLateAs"
        state={state}
        defaultValue={prefs.attendanceLateAs}
        options={[
          { value: "present", label: "Present" },
          { value: "absent", label: "Absent" },
        ]}
      />
      <SelectField
        label="Leave counts as"
        name="attendanceLeaveAs"
        state={state}
        defaultValue={prefs.attendanceLeaveAs}
        options={[
          { value: "absent", label: "Absent" },
          { value: "present", label: "Present" },
          { value: "excluded", label: "Excluded from total" },
        ]}
      />
      <div className="sm:col-span-2">
        <h3 className="text-sm font-semibold">Planning & reminders</h3>
      </div>
      <TextField label="Default course target (%)" name="defaultTargetPct" type="number" min={0} max={100} step="0.1" defaultValue={prefs.defaultTargetPct ?? ""} state={state} />
      <TextField label="Default alert before events (minutes)" name="defaultReminderMinutes" type="number" min={0} max={10080} defaultValue={prefs.defaultReminderMinutes} state={state} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="notifyPush" defaultChecked={prefs.notifyPush} className="size-4" /> Push notifications
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="notifyEmail" defaultChecked={prefs.notifyEmail} className="size-4" /> Email notifications (if configured)
      </label>
      <div className="sm:col-span-2">
        <SubmitButton pending={pending}>Save preferences</SubmitButton>
      </div>
    </form>
  );
}
