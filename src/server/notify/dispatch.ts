import "server-only";
import { db } from "@/server/db";
import { nextOccurrence, MAX_DELIVERY_ATTEMPTS, retryDelayMs } from "@/domain/reminders";
import { sendPush, sendReminderEmail, type Payload } from "./channels";
import { log } from "@/server/log";
import type { Reminder } from "@/generated/prisma/client";

async function deliver(channel: string, userId: string, payload: Payload): Promise<{ delivered: number; error?: string }> {
  if (channel === "PUSH") return sendPush(userId, payload);
  if (channel === "EMAIL") return sendReminderEmail(userId, payload);
  // IN_APP deliveries are shown in Orbit's notification list; recording them is the delivery.
  return { delivered: 1 };
}

async function attempt(deliveryId: string, channel: string, reminder: Pick<Reminder, "userId" | "title" | "body" | "targetType" | "targetId">) {
  const url = reminder.targetType === "assignment" ? "/assignments" : reminder.targetType === "event" ? "/calendar" : "/";
  const r = await deliver(channel, reminder.userId, { title: reminder.title, body: reminder.body, url });
  const current = await db.notificationDelivery.update({ where: { id: deliveryId }, data: { attempts: { increment: 1 } } });
  if (r.delivered > 0) {
    await db.notificationDelivery.update({ where: { id: deliveryId }, data: { status: "SENT", sentAt: new Date(), lastError: null } });
  } else {
    const giveUp = current.attempts >= MAX_DELIVERY_ATTEMPTS || r.error?.includes("not configured") || r.error?.includes("No devices");
    await db.notificationDelivery.update({ where: { id: deliveryId }, data: { status: giveUp ? "FAILED" : "PENDING", lastError: r.error ?? "Unknown error" } });
  }
}

/**
 * Fires due reminders. Safe to call concurrently and repeatedly:
 * each (reminder, occurrence, channel) gets exactly one NotificationDelivery
 * row thanks to a unique constraint, and the reminder is advanced with a
 * compare-and-set on its remindAt.
 */
export async function dispatchDueReminders(now = new Date(), limit = 100) {
  const due = await db.reminder.findMany({ where: { status: "ACTIVE", remindAt: { lte: now } }, orderBy: { remindAt: "asc" }, take: limit });
  let fired = 0;
  for (const r of due) {
    const next = nextOccurrence(r.remindAt, r.recurrence, r.timezone, now);
    // Claim this occurrence; if another run already advanced it, skip.
    const claimed = await db.reminder.updateMany({
      where: { id: r.id, remindAt: r.remindAt, status: "ACTIVE" },
      data: next ? { remindAt: next, lastFiredAt: now } : { status: "DONE", lastFiredAt: now },
    });
    if (claimed.count === 0) continue;
    // Skip occurrences that are more than a day stale (e.g. after long downtime) instead of spamming.
    const stale = now.getTime() - r.remindAt.getTime() > 24 * 3600_000;
    for (const channel of r.channels) {
      try {
        const d = await db.notificationDelivery.create({
          data: { userId: r.userId, reminderId: r.id, channel, scheduledFor: r.remindAt, status: stale ? "SKIPPED" : "PENDING", lastError: stale ? "Missed while Orbit was not running" : null },
        });
        if (!stale) await attempt(d.id, channel, r);
      } catch (e) {
        // Unique violation means this occurrence/channel was already handled.
        if ((e as { code?: string }).code !== "P2002") log.error("reminder.delivery_failed", { reminderId: r.id, error: e });
      }
    }
    fired++;
  }

  // Bounded retries with backoff for transient failures.
  const pending = await db.notificationDelivery.findMany({ where: { status: "PENDING", attempts: { gt: 0, lt: MAX_DELIVERY_ATTEMPTS } }, include: { reminder: true }, take: limit });
  let retried = 0;
  for (const d of pending) {
    if (d.updatedAt.getTime() + retryDelayMs(d.attempts) > now.getTime()) continue;
    await attempt(d.id, d.channel, d.reminder);
    retried++;
  }
  return { due: due.length, fired, retried };
}
