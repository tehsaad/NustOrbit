import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { makeUser } from "./helpers";
import { issueQalamToken, verifyQalamToken } from "@/server/integrations/qalam-token";
import { deleteCredentials } from "@/server/integrations/credentials";
import { importQalamRecords } from "@/server/integrations/providers/qalam";
import { POST } from "@/app/api/integrations/qalam/ingest/route";

const TZ = "Asia/Karachi";

async function qalamConnection() {
  const userId = await makeUser("qalam");
  const conn = await db.integrationConnection.create({ data: { userId, provider: "qalam", status: "CONNECTED" } });
  return { userId, connId: conn.id };
}

function ingestRequest(token: string | null, body: unknown) {
  return new Request("https://nustorbit.vercel.app/api/integrations/qalam/ingest", {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

const marksRow = { course: "CS-212 Data Structures", assessment: "Quiz 1", category: "QUIZ", obtained: "8", max: "10" };

describe("Qalam pairing token", () => {
  it("verifies a freshly issued token and rejects a tampered one", async () => {
    const { userId, connId } = await qalamConnection();
    const token = await issueQalamToken(connId);
    expect(await verifyQalamToken(token)).toEqual({ connectionId: connId, userId });
    expect(await verifyQalamToken(token + "x")).toBeNull();
    expect(await verifyQalamToken(`${connId}.wrong`)).toBeNull();
    expect(await verifyQalamToken(null)).toBeNull();
  });

  it("is revoked when credentials are deleted (disconnect)", async () => {
    const { connId } = await qalamConnection();
    const token = await issueQalamToken(connId);
    await deleteCredentials(connId);
    expect(await verifyQalamToken(token)).toBeNull();
    const res = await POST(ingestRequest(token, { kind: "marks", rows: [marksRow] }));
    expect(res.status).toBe(401);
  });
});

describe("importQalamRecords stale guard + idempotency", () => {
  it("does not overwrite newer stored data, and re-imports do not duplicate", async () => {
    const { userId } = await qalamConnection();
    const T1 = new Date("2026-01-01T00:00:00Z");
    const T2 = new Date("2026-06-01T00:00:00Z");
    const T3 = new Date("2026-09-01T00:00:00Z");

    await importQalamRecords(userId, "marks", [marksRow], TZ, T2); // create, obtained 8
    const stale = await importQalamRecords(userId, "marks", [{ ...marksRow, obtained: "9" }], TZ, T1); // older → ignored
    expect(stale).toMatchObject({ imported: 0, unchanged: 1 }); // reported as unchanged, not imported
    let a = await db.assessment.findFirstOrThrow({ where: { userId, source: "IMPORT" } });
    expect(a.obtainedMarks).toBe(8);

    await importQalamRecords(userId, "marks", [{ ...marksRow, obtained: "7" }], TZ, T3); // newer → overwrites
    a = await db.assessment.findFirstOrThrow({ where: { userId, source: "IMPORT" } });
    expect(a.obtainedMarks).toBe(7);

    expect(await db.assessment.count({ where: { userId, source: "IMPORT" } })).toBe(1); // idempotent
  });

  it("clamps a future extractedAt so later real imports still apply", async () => {
    const { userId } = await qalamConnection();
    const future = new Date(Date.now() + 7 * 24 * 3600_000); // clock running a week fast
    await importQalamRecords(userId, "marks", [marksRow], TZ, future); // clamped to now, not the future
    const r = await importQalamRecords(userId, "marks", [{ ...marksRow, obtained: "5" }], TZ, new Date());
    expect(r).toMatchObject({ imported: 1 }); // applied, not silently dropped as stale
    const a = await db.assessment.findFirstOrThrow({ where: { userId, source: "IMPORT" } });
    expect(a.obtainedMarks).toBe(5);
  });
});

describe("Qalam ingest route", () => {
  it("rejects a missing or malformed token with 401", async () => {
    const res = await POST(ingestRequest(null, { kind: "marks", rows: [marksRow] }));
    expect(res.status).toBe(401);
  });

  it("rejects an invalid body with 400", async () => {
    const { connId } = await qalamConnection();
    const token = await issueQalamToken(connId);
    const res = await POST(ingestRequest(token, { kind: "nope", rows: "x" }));
    expect(res.status).toBe(400);
  });

  it("imports on the first call and rate-limits an immediate second call", async () => {
    const { userId, connId } = await qalamConnection();
    const token = await issueQalamToken(connId);

    const ok = await POST(ingestRequest(token, { kind: "marks", rows: [marksRow] }));
    expect(ok.status).toBe(200);
    expect(await db.assessment.count({ where: { userId, source: "IMPORT" } })).toBe(1);

    const again = await POST(ingestRequest(token, { kind: "marks", rows: [marksRow] }));
    expect(again.status).toBe(429);
  });
});
