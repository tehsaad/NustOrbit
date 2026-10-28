import "server-only";
import { randomUUID, timingSafeEqual, createHash } from "node:crypto";
import { db } from "@/server/db";
import { hashPassword } from "@/server/crypto/password";

export async function userCount(): Promise<number> {
  return db.user.count();
}

export function setupTokenMatches(provided: string): boolean {
  const expected = process.env.SETUP_TOKEN;
  if (!expected || !provided) return false;
  // Compare fixed-length digests to avoid leaking length or content through timing.
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export type SetupResult = { ok: true } | { ok: false; error: string };

/**
 * Creates the single administrator account. Allowed only while the database has
 * zero users AND the caller knows SETUP_TOKEN. Runs in a serializable transaction
 * so two concurrent setup attempts cannot both succeed.
 */
export async function createInitialAdmin(input: { token: string; name: string; email: string; password: string }): Promise<SetupResult> {
  if (!setupTokenMatches(input.token)) return { ok: false, error: "Setup is unavailable or the setup token is invalid." };
  const passwordHash = await hashPassword(input.password);
  try {
    await db.$transaction(
      async (tx) => {
        const existing = await tx.user.count();
        if (existing > 0) throw new Error("ALREADY_SET_UP");
        const userId = randomUUID();
        await tx.user.create({
          data: { id: userId, name: input.name, email: input.email.toLowerCase(), emailVerified: true },
        });
        await tx.account.create({
          data: { id: randomUUID(), accountId: userId, providerId: "credential", userId, password: passwordHash },
        });
        await tx.userPreference.create({ data: { userId, timezone: process.env.ORBIT_TIMEZONE ?? "Asia/Karachi" } });
        await tx.auditEvent.create({ data: { userId, action: "auth.setup.admin_created" } });
      },
      { isolationLevel: "Serializable" },
    );
    return { ok: true };
  } catch (error) {
    if (error instanceof Error && error.message === "ALREADY_SET_UP") return { ok: false, error: "Setup is unavailable or the setup token is invalid." };
    throw error;
  }
}
