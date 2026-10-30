"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/server/db";
import { requireUser } from "@/server/auth/session";
import { getTimezone } from "@/server/prefs";
import { recordAudit } from "@/server/audit";
import { googleConfigured } from "@/server/env";
import type { ActionResult } from "@/lib/action-result";
import { putCredential, deleteCredentials } from "@/server/integrations/credentials";
import { runSync } from "@/server/integrations/sync";
import { SYNC_HANDLERS } from "@/server/integrations/handlers";
import { getProvider } from "@/server/integrations/registry";
import { exchangeMoodleToken, importLmsData, lmsAllowedHosts, lmsBaseUrl, MoodleCalendarFeedProvider } from "@/server/integrations/providers/lms";
import { importQalamCsv, type QalamImportKind } from "@/server/integrations/providers/qalam";
import { beginGoogleAuth, pushEventToGoogle, revokeGoogle } from "@/server/integrations/providers/google";
import { describeError } from "@/server/integrations/errors";
import { sendPush } from "@/server/notify/channels";

const MAX_UPLOAD = 2 * 1024 * 1024;

async function readUpload(fd: FormData, name = "file"): Promise<string | ActionResult> {
  const file = fd.get(name);
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose a file to import." };
  if (file.size > MAX_UPLOAD) return { ok: false, error: "File is larger than 2 MB." };
  return file.text();
}

function finish(message: string): ActionResult {
  revalidatePath("/", "layout");
  return { ok: true, message };
}

async function connectionFor(userId: string, provider: string) {
  return db.integrationConnection.upsert({ where: { userId_provider: { userId, provider } }, create: { userId, provider }, update: {} });
}

// ── LMS ──────────────────────────────────────────────────

export async function connectLmsFeed(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const url = z.string().trim().url().max(2000).safeParse(fd.get("url"));
  if (!url.success) return { ok: false, error: "Paste the full calendar export link.", fieldErrors: { url: ["Invalid URL"] } };
  const parsed = new URL(url.data);
  if (parsed.protocol !== "https:" || !lmsAllowedHosts().includes(parsed.hostname.toLowerCase())) {
    return { ok: false, error: `The link must start with https://${lmsAllowedHosts()[0]}/`, fieldErrors: { url: ["Wrong host"] } };
  }
  const conn = await connectionFor(user.id, "lms");
  await putCredential(conn.id, "ical_url", url.data);
  const updated = await db.integrationConnection.update({
    where: { id: conn.id },
    data: { status: "CONNECTED", accountLabel: "Calendar export link", grantedScopes: ["calendar-export"], lastError: null, config: { method: "ical_url" } },
  });
  await recordAudit({ userId: user.id, action: "integration.connected", targetType: "integration", targetId: "lms", metadata: { method: "ical_url" } });
  const r = await runSync(updated, "connect", SYNC_HANDLERS.lms);
  revalidatePath("/", "layout");
  if (r.status === "FAILED") return { ok: false, error: `Saved, but the first sync failed: ${r.error}` };
  return { ok: true, message: `LMS connected. ${"created" in r ? r.created : 0} new items imported.` };
}

export async function connectLmsToken(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const token = z.string().trim().regex(/^[a-f0-9]{32}$/i, "Moodle tokens are 32 hexadecimal characters").safeParse(fd.get("token"));
  if (!token.success) return { ok: false, error: token.error.issues[0].message, fieldErrors: { token: [token.error.issues[0].message] } };
  const conn = await connectionFor(user.id, "lms");
  await putCredential(conn.id, "api_token", token.data);
  const updated = await db.integrationConnection.update({
    where: { id: conn.id },
    data: { status: "CONNECTED", accountLabel: "Web-service token", grantedScopes: ["moodle_mobile_app"], lastError: null, config: { method: "api_token" } },
  });
  await recordAudit({ userId: user.id, action: "integration.connected", targetType: "integration", targetId: "lms", metadata: { method: "api_token" } });
  const r = await runSync(updated, "connect", SYNC_HANDLERS.lms);
  revalidatePath("/", "layout");
  if (r.status === "FAILED") return { ok: false, error: `Token saved, but the LMS rejected it or failed: ${r.error}` };
  return { ok: true, message: "LMS web-service token verified and synced." };
}

/**
 * Connects the LMS with a NUST username + password via Moodle's official
 * `login/token.php`. The password is used once to obtain a web-service token,
 * then dropped — only the encrypted token is stored. Never logged.
 */
export async function connectLmsLogin(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = z
    .object({ username: z.string().trim().min(1, "Enter your LMS username").max(150), password: z.string().min(1, "Enter your LMS password").max(256) })
    .safeParse({ username: fd.get("username"), password: fd.get("password") });
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const i of parsed.error.issues) (fieldErrors[String(i.path[0])] ??= []).push(i.message);
    return { ok: false, error: "Enter your LMS username and password.", fieldErrors };
  }
  let token: string;
  try {
    token = await exchangeMoodleToken(lmsBaseUrl(), parsed.data.username, parsed.data.password);
  } catch (e) {
    // describeError never includes the password; the exchange function doesn't put it in messages.
    return { ok: false, error: describeError(e) };
  }
  const conn = await connectionFor(user.id, "lms");
  await putCredential(conn.id, "api_token", token);
  const updated = await db.integrationConnection.update({
    where: { id: conn.id },
    // Store the username as a label only (useful for "signed in as"); never the password.
    data: { status: "CONNECTED", accountLabel: parsed.data.username, grantedScopes: ["moodle_mobile_app"], lastError: null, config: { method: "password_login" } },
  });
  await recordAudit({ userId: user.id, action: "integration.connected", targetType: "integration", targetId: "lms", metadata: { method: "password_login" } });
  const r = await runSync(updated, "connect", SYNC_HANDLERS.lms);
  revalidatePath("/", "layout");
  if (r.status === "FAILED") return { ok: false, error: `Signed in, but the first sync failed: ${r.error}` };
  return { ok: true, message: `LMS connected as ${parsed.data.username}. ${"created" in r ? r.created : 0} items imported.` };
}

export async function importLmsIcsFile(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const text = await readUpload(fd);
  if (typeof text !== "string") return text;
  try {
    const counts = await importLmsData(user.id, new MoodleCalendarFeedProvider(async () => text));
    const conn = await connectionFor(user.id, "lms");
    await db.integrationConnection.update({ where: { id: conn.id }, data: { config: { ...((conn.config as object) ?? {}), lastFileImportAt: new Date().toISOString() } } });
    await recordAudit({ userId: user.id, action: "integration.file_import", targetType: "integration", targetId: "lms", metadata: counts });
    return finish(`Imported ${counts.created} new and ${counts.updated} updated LMS items.`);
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

// ── Qalam ────────────────────────────────────────────────

export async function importQalam(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const kind = z.enum(["marks", "attendance", "timetable", "results", "deadlines"]).safeParse(fd.get("kind"));
  if (!kind.success) return { ok: false, error: "Choose what you are importing." };
  const text = await readUpload(fd);
  if (typeof text !== "string") return text;
  const report = await importQalamCsv(user.id, kind.data as QalamImportKind, text, await getTimezone(user.id));
  const conn = await connectionFor(user.id, "qalam");
  await db.integrationConnection.update({
    where: { id: conn.id },
    data: { accountLabel: "CSV import", lastSuccessAt: new Date(), lastSyncAt: new Date(), config: { lastImport: { kind: kind.data, at: new Date().toISOString(), ...report, skipped: report.skipped.slice(0, 20) } } },
  });
  await recordAudit({ userId: user.id, action: "integration.file_import", targetType: "integration", targetId: "qalam", metadata: { kind: kind.data, imported: report.imported, skipped: report.skipped.length } });
  revalidatePath("/", "layout");
  if (report.imported === 0) return { ok: false, error: `Nothing imported. ${report.skipped[0] ? `Row ${report.skipped[0].row}: ${report.skipped[0].reason}` : "The file had no data rows."}` };
  return { ok: true, message: `Imported ${report.imported} rows${report.skipped.length ? `, skipped ${report.skipped.length}` : ""}.` };
}

// ── Google ───────────────────────────────────────────────

export async function startGoogleConnect(fd: FormData): Promise<void> {
  const user = await requireUser();
  const provider = z.enum(["gmail", "google-calendar"]).parse(fd.get("provider"));
  if (!googleConfigured()) redirect(`/integrations?error=${encodeURIComponent("Google OAuth is not configured on this deployment.")}`);
  const url = await beginGoogleAuth(user.id, provider);
  redirect(url);
}

export async function pushEventToGoogleAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const conn = await db.integrationConnection.findUnique({ where: { userId_provider: { userId: user.id, provider: "google-calendar" } } });
  if (!conn || conn.status !== "CONNECTED") return { ok: false, error: "Connect Google Calendar first." };
  try {
    await pushEventToGoogle(conn, String(fd.get("id") ?? ""));
    await recordAudit({ userId: user.id, action: "calendar.pushed_to_google", targetType: "event", targetId: String(fd.get("id")) });
    return finish("Event saved to Google Calendar");
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

// ── Common ───────────────────────────────────────────────

export async function syncNow(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const provider = String(fd.get("provider") ?? "");
  const handler = SYNC_HANDLERS[provider];
  if (!handler) return { ok: false, error: "This integration does not sync." };
  const conn = await db.integrationConnection.findUnique({ where: { userId_provider: { userId: user.id, provider } } });
  if (!conn) return { ok: false, error: "Not connected." };
  if (conn.status === "NEEDS_REAUTH") return { ok: false, error: "Reconnect this integration first." };
  const r = await runSync(conn, "manual", handler);
  revalidatePath("/", "layout");
  if (r.status === "SKIPPED" || r.status === "FAILED") return { ok: false, error: r.error };
  return { ok: true, message: `Synced: ${r.created} new, ${r.updated} updated.` };
}

export async function disconnectIntegration(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const provider = String(fd.get("provider") ?? "");
  if (!getProvider(provider)) return { ok: false, error: "Unknown integration." };
  const purge = fd.get("purge") === "on";
  const conn = await db.integrationConnection.findUnique({ where: { userId_provider: { userId: user.id, provider } } });
  if (!conn) return { ok: false, error: "Not connected." };
  if (provider === "gmail" || provider === "google-calendar") await revokeGoogle(conn);
  else await deleteCredentials(conn.id);
  await db.integrationConnection.update({ where: { id: conn.id }, data: { status: "DISCONNECTED", grantedScopes: [], lastError: null, syncLockedUntil: null } });
  if (purge) {
    const source = provider === "lms" ? "LMS" : provider === "google-calendar" ? "GOOGLE_CALENDAR" : provider === "qalam" ? "IMPORT" : null;
    if (source) {
      await db.$transaction([
        db.calendarEvent.deleteMany({ where: { userId: user.id, source } }),
        db.assignment.deleteMany({ where: { userId: user.id, source } }),
        db.assessment.deleteMany({ where: { userId: user.id, source } }),
        db.attendanceRecord.deleteMany({ where: { userId: user.id, source } }),
        db.timetableEntry.deleteMany({ where: { userId: user.id, source } }),
        db.grade.deleteMany({ where: { userId: user.id, source } }),
      ]);
    }
  }
  await recordAudit({ userId: user.id, action: "integration.disconnected", targetType: "integration", targetId: provider, metadata: { purge } });
  return finish(purge ? "Disconnected and imported data removed" : "Disconnected. Credentials deleted.");
}

export async function sendTestPush(_: ActionResult): Promise<ActionResult> {
  const user = await requireUser();
  const r = await sendPush(user.id, { title: "Orbit test notification", body: "Notifications are working on this device.", url: "/settings" });
  if (r.delivered === 0) return { ok: false, error: r.error ?? "Not delivered" };
  return { ok: true, message: `Sent to ${r.delivered} device${r.delivered === 1 ? "" : "s"}` };
}

/** Turns an email the student picked into a *suggested* assignment (must be confirmed later). */
export async function createSuggestionFromEmail(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const p = z
    .object({ messageId: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/), title: z.string().trim().min(1).max(200), dueAt: z.string().max(30).optional(), kind: z.enum(["assignment", "exam"]) })
    .safeParse(Object.fromEntries(fd));
  if (!p.success) return { ok: false, error: "Check the title and date." };
  const tz = await getTimezone(user.id);
  const { localToUtc } = await import("./util");
  const due = localToUtc(p.data.dueAt || undefined, tz);
  const url = `https://mail.google.com/mail/u/0/#all/${p.data.messageId}`;
  if (p.data.kind === "exam") {
    if (!due) return { ok: false, error: "An exam suggestion needs a date." };
    await db.calendarEvent.upsert({
      where: { userId_source_externalId: { userId: user.id, source: "GMAIL", externalId: p.data.messageId } },
      create: { userId: user.id, source: "GMAIL", externalId: p.data.messageId, title: p.data.title, kind: "EXAM", startsAt: due, endsAt: new Date(due.getTime() + 2 * 3600_000), suggested: true, readOnly: false, url },
      update: { title: p.data.title, startsAt: due, endsAt: new Date(due.getTime() + 2 * 3600_000) },
    });
  } else {
    await db.assignment.upsert({
      where: { userId_source_externalId: { userId: user.id, source: "GMAIL", externalId: p.data.messageId } },
      create: { userId: user.id, source: "GMAIL", externalId: p.data.messageId, title: p.data.title, dueAt: due ?? null, suggested: true, url },
      update: { title: p.data.title, dueAt: due ?? null },
    });
  }
  return finish("Added as a suggestion. Confirm it once you've checked the details.");
}
