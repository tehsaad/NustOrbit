import { describe, expect, it, beforeEach } from "vitest";
import { spawnSync } from "node:child_process";
import { db } from "@/server/db";
import { claimInvite } from "@/server/auth/bootstrap";
import { INVITE_PREFIX } from "@/server/auth/bootstrap-token";
import { verifyPassword } from "@/server/crypto/password";

function invite(email = "owner@example.test", extra: string[] = []) {
  const r = spawnSync("npx", ["tsx", "scripts/admin-invite.mts", "--email", email, "--base-url", "http://localhost:3100", ...extra], {
    env: { ...process.env, DATABASE_URL_UNPOOLED: process.env.DATABASE_URL },
    encoding: "utf8",
  });
  const link = r.stdout.trim();
  return { status: r.status, link, token: link.split("#")[1] ?? "", stderr: r.stderr };
}

const PW = "a-very-long-test-passphrase";

describe("first-account bootstrap", () => {
  beforeEach(async () => {
    // Disposable test DB: bootstrap only works with zero users.
    await db.user.deleteMany();
    await db.verification.deleteMany({ where: { identifier: { startsWith: INVITE_PREFIX } } });
  });

  it("issues a fragment link and stores only a hash", async () => {
    const r = invite();
    expect(r.status).toBe(0);
    expect(r.link).toMatch(/^http:\/\/localhost:3100\/claim#[A-Za-z0-9_-]{43}$/);
    const rows = await db.verification.findMany({ where: { identifier: { startsWith: INVITE_PREFIX } } });
    expect(rows).toHaveLength(1);
    expect(rows[0].value).not.toContain(r.token);
    expect(rows[0].expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(24 * 3600_000 + 5000);
  });

  it("creates exactly one account, signs nothing in, and cannot be replayed", async () => {
    const { token } = invite("Owner@Example.test");
    const r = await claimInvite({ token, name: "Owner", password: PW });
    expect(r).toEqual({ ok: true, email: "owner@example.test" });
    const account = await db.account.findFirstOrThrow({ where: { providerId: "credential" } });
    expect(await verifyPassword({ hash: account.password!, password: PW })).toBe(true);
    expect(await db.verification.count({ where: { identifier: { startsWith: INVITE_PREFIX } } })).toBe(0);
    expect((await claimInvite({ token, name: "Again", password: PW })).ok).toBe(false);
    expect(await db.user.count()).toBe(1);
  });

  it("lets only one of two concurrent claims win", async () => {
    const { token } = invite();
    const results = await Promise.all([claimInvite({ token, name: "A", password: PW }), claimInvite({ token, name: "B", password: PW })]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await db.user.count()).toBe(1);
  });

  it("rejects expired, malformed and revoked links", async () => {
    const first = invite();
    const second = invite();
    // Issuing a new link revokes the earlier one.
    expect((await claimInvite({ token: first.token, name: "X", password: PW })).ok).toBe(false);
    await db.verification.updateMany({ where: { identifier: { startsWith: INVITE_PREFIX } }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await claimInvite({ token: second.token, name: "X", password: PW })).ok).toBe(false);
    expect((await claimInvite({ token: "not-a-token", name: "X", password: PW })).ok).toBe(false);
    expect(await db.user.count()).toBe(0);
  });

  it("refuses to issue links once an account exists", async () => {
    const { token } = invite();
    await claimInvite({ token, name: "Owner", password: PW });
    const again = invite();
    expect(again.status).toBe(3);
    expect(again.link).toBe("");
  });
});
