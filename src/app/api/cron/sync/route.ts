import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { isAuthorizedCron } from "@/server/cron-auth";
import { runSync } from "@/server/integrations/sync";
import { SYNC_HANDLERS } from "@/server/integrations/handlers";

export const maxDuration = 300;

const MIN_INTERVAL_MS = 3 * 3600_000;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const cutoff = new Date(Date.now() - MIN_INTERVAL_MS);
  // NEEDS_REAUTH / DISCONNECTED / PAUSED connections are not polled.
  const due = await db.integrationConnection.findMany({
    where: { provider: { in: Object.keys(SYNC_HANDLERS) }, status: { in: ["CONNECTED", "ERROR"] }, OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: cutoff } }] },
    take: 20,
  });
  const results = [];
  for (const c of due) {
    const r = await runSync(c, "cron", SYNC_HANDLERS[c.provider]);
    results.push({ provider: c.provider, status: r.status });
  }
  return NextResponse.json({ ran: results.length, results });
}
