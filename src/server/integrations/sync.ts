import "server-only";
import { db } from "@/server/db";
import { log } from "@/server/log";
import { recordAudit } from "@/server/audit";
import { ProviderAuthError, ProviderConfigError, describeError } from "./errors";
import type { IntegrationConnection } from "@/generated/prisma/client";

export type SyncCounts = { created: number; updated: number; warnings?: string[] };
export type SyncHandler = (connection: IntegrationConnection) => Promise<SyncCounts>;

const LEASE_MS = 5 * 60_000;
const RUN_TIMEOUT_MS = 60_000;

/**
 * Runs one sync for a connection with:
 * - a DB lease so concurrent triggers (cron + manual) don't overlap,
 * - a hard timeout,
 * - status bookkeeping (SyncRun + connection.lastSyncAt/lastSuccessAt/lastError),
 * - auth failures moving the connection to NEEDS_REAUTH (pausing future syncs).
 */
export async function runSync(connection: IntegrationConnection, trigger: "manual" | "cron" | "connect", handler: SyncHandler) {
  const now = new Date();
  const lease = await db.integrationConnection.updateMany({
    where: { id: connection.id, status: { in: ["CONNECTED", "ERROR"] }, OR: [{ syncLockedUntil: null }, { syncLockedUntil: { lt: now } }] },
    data: { syncLockedUntil: new Date(now.getTime() + LEASE_MS) },
  });
  if (lease.count === 0) {
    return { status: "SKIPPED" as const, error: "A sync is already running or the connection is not active." };
  }

  const run = await db.syncRun.create({ data: { userId: connection.userId, connectionId: connection.id, provider: connection.provider, trigger } });
  try {
    const counts = await Promise.race([
      handler(connection),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Sync timed out")), RUN_TIMEOUT_MS)),
    ]);
    const status = counts.warnings?.length ? ("PARTIAL" as const) : ("SUCCESS" as const);
    await db.$transaction([
      db.syncRun.update({ where: { id: run.id }, data: { status, created: counts.created, updated: counts.updated, error: counts.warnings?.join("\n").slice(0, 2000) ?? null, finishedAt: new Date() } }),
      db.integrationConnection.update({
        where: { id: connection.id },
        data: { status: "CONNECTED", lastSyncAt: new Date(), lastSuccessAt: new Date(), lastError: null, syncLockedUntil: null },
      }),
    ]);
    return { status, ...counts };
  } catch (e) {
    const message = describeError(e);
    const needsReauth = e instanceof ProviderAuthError;
    log.warn("sync.failed", { provider: connection.provider, connectionId: connection.id, error: message, needsReauth });
    await db.$transaction([
      db.syncRun.update({ where: { id: run.id }, data: { status: "FAILED", error: message, finishedAt: new Date() } }),
      db.integrationConnection.update({
        where: { id: connection.id },
        data: { status: needsReauth ? "NEEDS_REAUTH" : "ERROR", lastSyncAt: new Date(), lastError: message, syncLockedUntil: null },
      }),
    ]);
    if (needsReauth) await recordAudit({ userId: connection.userId, action: "integration.needs_reauth", targetType: "integration", targetId: connection.provider });
    return { status: "FAILED" as const, error: message, configError: e instanceof ProviderConfigError };
  }
}
