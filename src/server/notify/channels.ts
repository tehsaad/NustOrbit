import "server-only";
import webpush from "web-push";
import { db } from "@/server/db";
import { env, pushConfigured } from "@/server/env";
import { sendEmail } from "@/server/email";
import { log } from "@/server/log";

export type Payload = { title: string; body?: string | null; url?: string };

let vapidReady = false;
function ensureVapid() {
  if (vapidReady) return;
  const e = env();
  webpush.setVapidDetails(e.VAPID_SUBJECT!, e.VAPID_PUBLIC_KEY!, e.VAPID_PRIVATE_KEY!);
  vapidReady = true;
}

/** Sends to every registered device; prunes subscriptions the push service reports as gone. */
export async function sendPush(userId: string, payload: Payload): Promise<{ delivered: number; error?: string }> {
  if (!pushConfigured()) return { delivered: 0, error: "Web push is not configured" };
  ensureVapid();
  const subs = await db.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return { delivered: 0, error: "No devices have enabled notifications" };
  let delivered = 0;
  let lastError: string | undefined;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600, urgency: "high" });
      delivered++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) await db.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
      lastError = `Push service responded ${status ?? "with an error"}`;
      log.warn("push.failed", { status });
    }
  }
  return delivered > 0 ? { delivered } : { delivered, error: lastError };
}

export async function sendReminderEmail(userId: string, payload: Payload): Promise<{ delivered: number; error?: string }> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) return { delivered: 0, error: "User not found" };
  const ok = await sendEmail({ to: user.email, subject: `Reminder: ${payload.title}`, text: `${payload.title}\n\n${payload.body ?? ""}\n\n— Orbit` });
  return ok ? { delivered: 1 } : { delivered: 0, error: "Email is not configured or failed" };
}
