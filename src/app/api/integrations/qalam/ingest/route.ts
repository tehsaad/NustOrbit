import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/server/db";
import { getTimezone } from "@/server/prefs";
import { recordAudit } from "@/server/audit";
import { verifyQalamToken } from "@/server/integrations/qalam-token";
import { importQalamRecords } from "@/server/integrations/providers/qalam";

/**
 * Ingest endpoint for the Qalam browser extension. The extension reads the
 * student's own open Qalam pages in their logged-in browser, then POSTs the
 * normalized rows here. Authentication is a pairing token (Bearer) — never a
 * Qalam password, never cookies. See docs/qalam-integration.md.
 */

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 1_000_000; // ~1 MB
const MAX_ROWS = 2000;
const MIN_INTERVAL_MS = 5_000; // floor between ingests per connection

// The token is the authorization, not an origin or cookie, so a wildcard CORS
// origin is safe here: no credentials are sent and nothing is readable without
// the bearer token. The extension declares host_permissions for this origin.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: CORS });

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

const bodySchema = z.object({
  kind: z.enum(["marks", "attendance", "timetable", "results", "deadlines"]),
  rows: z.array(z.record(z.string(), z.string())).max(MAX_ROWS),
  // When the extension read the page (ISO). Drives the stale-overwrite guard.
  extractedAt: z.string().datetime().optional(),
});

export async function POST(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  const verified = await verifyQalamToken(token);
  if (!verified) return json({ error: "unauthorized" }, 401);

  // Reject oversize bodies before buffering the whole thing.
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return json({ error: "payload too large" }, 413);
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: "payload too large" }, 413);

  let parsed;
  try {
    parsed = bodySchema.parse(JSON.parse(raw));
  } catch {
    return json({ error: "invalid body" }, 400);
  }

  const conn = await db.integrationConnection.findUnique({ where: { id: verified.connectionId }, select: { lastSyncAt: true } });
  if (conn?.lastSyncAt && Date.now() - conn.lastSyncAt.getTime() < MIN_INTERVAL_MS) {
    return json({ error: "too many requests", retryAfterMs: MIN_INTERVAL_MS }, 429);
  }

  const extractedAt = parsed.extractedAt ? new Date(parsed.extractedAt) : new Date();
  const tz = await getTimezone(verified.userId);

  try {
    const report = await importQalamRecords(verified.userId, parsed.kind, parsed.rows, tz, extractedAt);
    await db.integrationConnection.update({
      where: { id: verified.connectionId },
      data: {
        status: "CONNECTED",
        accountLabel: "Browser extension",
        lastSyncAt: new Date(),
        lastSuccessAt: new Date(),
        lastError: null,
        config: { lastImport: { kind: parsed.kind, at: new Date().toISOString(), imported: report.imported, skipped: report.skipped.length, via: "extension" } },
      },
    });
    await recordAudit({ userId: verified.userId, action: "integration.extension_ingest", targetType: "integration", targetId: "qalam", metadata: { kind: parsed.kind, imported: report.imported, skipped: report.skipped.length } });
    return json({ ok: true, imported: report.imported, skipped: report.skipped.slice(0, 20) });
  } catch (e) {
    const message = e instanceof Error ? e.message : "import failed";
    await db.integrationConnection.update({ where: { id: verified.connectionId }, data: { lastError: message } }).catch(() => {});
    return json({ error: "import failed" }, 500);
  }
}
