import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/server/db";
import { putCredential, getCredential } from "./credentials";
import { QALAM_SOURCE } from "./providers/qalam";

/**
 * Pairing token for the Qalam browser extension. The extension never sees a
 * Qalam password — it authenticates to Orbit's ingest endpoint with this token,
 * which authorizes imports for exactly one connection (one user).
 *
 * Token shape: `<connectionId>.<secret>` (secret is 32 random bytes, hex).
 * Only SHA-256(secret) is stored, inside the existing encrypted credential
 * vault under kind "ingest_token", so `deleteCredentials` on disconnect revokes
 * it for free. The plaintext token is shown to the student once, at issue time,
 * and never again.
 */

const sha256hex = (s: string) => createHash("sha256").update(s).digest("hex");

/** Mint a fresh token for a connection, replacing any previous one. Returns the plaintext token (show once). */
export async function issueQalamToken(connectionId: string): Promise<string> {
  const secret = randomBytes(32).toString("hex");
  await putCredential(connectionId, "ingest_token", sha256hex(secret));
  return `${connectionId}.${secret}`;
}

export type VerifiedToken = { connectionId: string; userId: string };

/**
 * Verify a bearer token. Returns the owning connection + user on success, or
 * null for any failure (malformed, unknown connection, wrong provider, or
 * mismatched secret). The secret comparison is constant-time.
 */
export async function verifyQalamToken(raw: string | null | undefined): Promise<VerifiedToken | null> {
  if (!raw) return null;
  const dot = raw.indexOf(".");
  if (dot <= 0) return null;
  const connectionId = raw.slice(0, dot);
  const secret = raw.slice(dot + 1);
  if (!secret) return null;

  const stored = await getCredential(connectionId, "ingest_token");
  if (!stored) return null;

  const a = Buffer.from(stored.value, "hex");
  const b = Buffer.from(sha256hex(secret), "hex");
  // Both are SHA-256 digests (32 bytes). Unequal lengths can't be timingSafeEqual'd.
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const conn = await db.integrationConnection.findUnique({ where: { id: connectionId }, select: { id: true, userId: true, provider: true, status: true } });
  if (!conn || conn.provider !== "qalam" || conn.status === "DISCONNECTED") return null;
  return { connectionId: conn.id, userId: conn.userId };
}

/** Source label records imported through this path carry (shared with CSV import). */
export { QALAM_SOURCE };
