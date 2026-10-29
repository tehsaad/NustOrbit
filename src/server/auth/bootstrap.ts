import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { hashPassword } from "@/server/crypto/password";
import { INVITE_PREFIX, TOKEN_RE, hashInviteToken } from "./bootstrap-token";

export async function userCount(): Promise<number> {
  return db.user.count();
}

export type ClaimResult = { ok: true; email: string } | { ok: false; error: string };

const INVALID = "This setup link is invalid, expired or already used. Ask for a new one with `npm run admin:invite`.";

/**
 * Consumes a bootstrap invite and creates the single administrator.
 * - The token is checked (cheap hash lookup) before any password hashing.
 * - Consumption, the zero-users check and account creation happen in one
 *   Serializable transaction, so replays and concurrent claims can't both win.
 * - All remaining invites are deleted, which permanently disables bootstrap.
 */
export async function claimInvite(input: { token: string; name: string; password: string }): Promise<ClaimResult> {
  if (!TOKEN_RE.test(input.token)) return { ok: false, error: INVALID };
  const valueHash = hashInviteToken(input.token);
  const invite = await db.verification.findFirst({
    where: { identifier: { startsWith: INVITE_PREFIX }, value: valueHash, expiresAt: { gt: new Date() } },
  });
  if (!invite) return { ok: false, error: INVALID };
  const email = invite.identifier.slice(INVITE_PREFIX.length).toLowerCase();
  const passwordHash = await hashPassword(input.password);

  try {
    await db.$transaction(
      async (tx) => {
        const consumed = await tx.verification.deleteMany({ where: { id: invite.id, value: valueHash, expiresAt: { gt: new Date() } } });
        if (consumed.count !== 1) throw new Error("INVITE_GONE");
        if ((await tx.user.count()) > 0) throw new Error("ALREADY_SET_UP");
        const userId = randomUUID();
        await tx.user.create({ data: { id: userId, name: input.name, email, emailVerified: true } });
        await tx.account.create({ data: { id: randomUUID(), accountId: userId, providerId: "credential", userId, password: passwordHash } });
        await tx.userPreference.create({ data: { userId, timezone: process.env.ORBIT_TIMEZONE ?? "Asia/Karachi" } });
        await tx.verification.deleteMany({ where: { identifier: { startsWith: INVITE_PREFIX } } });
        await tx.auditEvent.create({ data: { userId, action: "auth.bootstrap.admin_claimed" } });
      },
      // Generous waits: the first request may hit a database waking from scale-to-zero.
      { isolationLevel: "Serializable", maxWait: 15_000, timeout: 20_000 },
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    // Serialization failures (P2034) mean a concurrent claim won.
    if (msg === "INVITE_GONE" || msg === "ALREADY_SET_UP" || (error as { code?: string }).code === "P2034") return { ok: false, error: INVALID };
    throw error;
  }
  return { ok: true, email };
}
