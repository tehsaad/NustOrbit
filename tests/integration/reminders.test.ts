import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { dispatchDueReminders } from "@/server/notify/dispatch";
import { makeUser } from "./helpers";

describe("reminder dispatch", () => {
  it("delivers each occurrence exactly once even when runs overlap", async () => {
    const userId = await makeUser("rem");
    const now = new Date();
    const r = await db.reminder.create({ data: { userId, title: "Submit lab", remindAt: new Date(now.getTime() - 60_000), channels: ["IN_APP"] } });
    await Promise.all([dispatchDueReminders(now), dispatchDueReminders(now)]);
    const deliveries = await db.notificationDelivery.findMany({ where: { reminderId: r.id } });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].status).toBe("SENT");
    expect((await db.reminder.findUniqueOrThrow({ where: { id: r.id } })).status).toBe("DONE");
  });

  it("advances recurring reminders to the next wall-clock occurrence", async () => {
    const userId = await makeUser("rec");
    const now = new Date("2026-11-02T03:30:00Z");
    const r = await db.reminder.create({ data: { userId, title: "Daily review", remindAt: new Date("2026-11-02T03:00:00Z"), recurrence: "DAILY", timezone: "Asia/Karachi", channels: ["IN_APP"] } });
    await dispatchDueReminders(now);
    const after = await db.reminder.findUniqueOrThrow({ where: { id: r.id } });
    expect(after.status).toBe("ACTIVE");
    expect(after.remindAt.toISOString()).toBe("2026-11-03T03:00:00.000Z");
  });

  it("records honest failures when a channel can't deliver, without retry loops", async () => {
    const userId = await makeUser("fail");
    const now = new Date();
    const r = await db.reminder.create({ data: { userId, title: "Push me", remindAt: new Date(now.getTime() - 1000), channels: ["PUSH"] } });
    await dispatchDueReminders(now);
    const d = await db.notificationDelivery.findFirstOrThrow({ where: { reminderId: r.id } });
    expect(d.status).toBe("FAILED");
    expect(d.lastError).toMatch(/not configured|No devices/);
  });

  it("skips occurrences missed by more than a day instead of spamming", async () => {
    const userId = await makeUser("stale");
    const now = new Date();
    const r = await db.reminder.create({ data: { userId, title: "Old", remindAt: new Date(now.getTime() - 3 * 86400_000), channels: ["IN_APP"] } });
    await dispatchDueReminders(now);
    const d = await db.notificationDelivery.findFirstOrThrow({ where: { reminderId: r.id } });
    expect(d.status).toBe("SKIPPED");
  });
});
