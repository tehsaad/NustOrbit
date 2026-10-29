#!/usr/bin/env node
// Issues the one-time link that creates Orbit's single administrator account.
//
//   npm run admin:invite -- --email you@example.com [--base-url https://nustorbit.vercel.app] [--hours 24] [--out FILE]
//   npm run admin:invite -- --revoke
//
// Requires direct database access (DATABASE_URL_UNPOOLED or DATABASE_URL, read
// from the environment or .env.local). Refuses to run once any user exists.
// Issuing a new link revokes any earlier one. The link is printed once to
// stdout (or written to --out with mode 600) and stored only as a SHA-256 hash.
import { config } from "dotenv";
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { INVITE_PREFIX, hashInviteToken, inviteLink, newInviteToken } from "../src/server/auth/bootstrap-token.ts";

config({ path: ".env.local", quiet: true });

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    "base-url": { type: "string" },
    hours: { type: "string", default: "24" },
    out: { type: "string" },
    revoke: { type: "boolean", default: false },
  },
});

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL_UNPOOLED or DATABASE_URL is required.");
  process.exit(2);
}
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

try {
  if (values.revoke) {
    const r = await db.verification.deleteMany({ where: { identifier: { startsWith: INVITE_PREFIX } } });
    console.error(`Revoked ${r.count} invite(s).`);
    process.exit(0);
  }
  const email = values.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error("Pass --email with the address for the administrator account.");
    process.exit(2);
  }
  const hours = Number(values.hours);
  if (!(hours > 0 && hours <= 72)) {
    console.error("--hours must be between 1 and 72.");
    process.exit(2);
  }
  if ((await db.user.count()) > 0) {
    console.error("Orbit already has an account. Bootstrap is disabled.");
    process.exit(3);
  }
  const base = values["base-url"] ?? process.env.ORBIT_PUBLIC_URL ?? "https://nustorbit.vercel.app";
  const token = newInviteToken();
  const expiresAt = new Date(Date.now() + hours * 3600_000);
  await db.$transaction([
    db.verification.deleteMany({ where: { identifier: { startsWith: INVITE_PREFIX } } }),
    db.verification.create({ data: { id: crypto.randomUUID(), identifier: `${INVITE_PREFIX}${email}`, value: hashInviteToken(token), expiresAt } }),
    db.auditEvent.create({ data: { action: "auth.bootstrap.invite_issued", metadata: { expiresAt: expiresAt.toISOString() } } }),
  ]);
  const link = inviteLink(base, token);
  if (values.out) {
    writeFileSync(values.out, link + "\n", { mode: 0o600 });
    console.error(`Invite for ${email} written to ${values.out} (expires ${expiresAt.toISOString()}).`);
  } else {
    console.error(`Invite for ${email}, single use, expires ${expiresAt.toISOString()}:`);
    console.log(link);
  }
} finally {
  await db.$disconnect();
}
