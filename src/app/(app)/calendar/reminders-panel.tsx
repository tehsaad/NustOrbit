import { Pause, Play, Trash2 } from "lucide-react";
import { db } from "@/server/db";
import { SectionCard } from "@/components/section-card";
import { ConfirmAction, InlineAction } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { deleteReminder, setReminderStatus } from "@/server/actions/productivity";
import { fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const REC: Record<string, string> = { NONE: "once", DAILY: "daily", WEEKDAYS: "weekdays", WEEKLY: "weekly" };

export async function RemindersPanel({ userId, tz }: { userId: string; tz: string }) {
  const [reminders, deliveries] = await Promise.all([
    db.reminder.findMany({ where: { userId, status: { in: ["ACTIVE", "PAUSED"] } }, orderBy: { remindAt: "asc" }, take: 30 }),
    db.notificationDelivery.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 15, include: { reminder: { select: { title: true } } } }),
  ]);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SectionCard title="Reminders">
        {reminders.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reminders scheduled.</p>
        ) : (
          <ul className="divide-y text-sm">
            {reminders.map((r) => (
              <li key={r.id} className={cn("flex items-center gap-2 py-2", r.status === "PAUSED" && "opacity-60")}>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{r.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmtDateTime(r.remindAt, tz)} · {REC[r.recurrence]} · {r.channels.join(", ").toLowerCase()}
                  </p>
                </div>
                <InlineAction action={setReminderStatus} hidden={{ id: r.id, status: r.status === "ACTIVE" ? "PAUSED" : "ACTIVE" }}>
                  <Button type="submit" size="icon-xs" variant="ghost" aria-label={r.status === "ACTIVE" ? "Pause" : "Resume"}>
                    {r.status === "ACTIVE" ? <Pause /> : <Play />}
                  </Button>
                </InlineAction>
                <ConfirmAction
                  action={deleteReminder}
                  hidden={{ id: r.id }}
                  title="Delete reminder?"
                  description="It will no longer be delivered."
                  trigger={
                    <Button size="icon-xs" variant="ghost" aria-label="Delete">
                      <Trash2 />
                    </Button>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      <SectionCard title="Delivery history">
        {deliveries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing delivered yet. Reminders are dispatched by the scheduler every few minutes.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {deliveries.map((d) => (
              <li key={d.id} className="flex gap-2">
                <span className={cn("w-14 font-medium", d.status === "SENT" ? "text-success" : d.status === "FAILED" ? "text-destructive" : "text-muted-foreground")}>{d.status.toLowerCase()}</span>
                <span className="w-12 text-muted-foreground">{d.channel.toLowerCase()}</span>
                <span className="min-w-0 flex-1 truncate">{d.reminder.title}</span>
                <span className="text-muted-foreground">{fmtDateTime(d.scheduledFor, tz)}</span>
                {d.lastError ? <span className="max-w-40 truncate text-destructive" title={d.lastError}>{d.lastError}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
