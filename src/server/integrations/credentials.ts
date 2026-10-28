import "server-only";
import { db } from "@/server/db";
import { open, seal } from "@/server/crypto/vault";

export type CredentialKind = "oauth_refresh" | "oauth_access" | "ical_url" | "api_token";

const aad = (connectionId: string, kind: CredentialKind) => `cred:${connectionId}:${kind}`;

export async function putCredential(connectionId: string, kind: CredentialKind, plaintext: string, expiresAt?: Date | null): Promise<void> {
  const s = seal(plaintext, aad(connectionId, kind));
  await db.encryptedCredential.upsert({
    where: { connectionId_kind: { connectionId, kind } },
    create: { connectionId, kind, ...s, expiresAt: expiresAt ?? null },
    update: { ...s, expiresAt: expiresAt ?? null },
  });
}

/** Decrypts a credential for immediate server-side use. Never return this to a client. */
export async function getCredential(connectionId: string, kind: CredentialKind): Promise<{ value: string; expiresAt: Date | null } | null> {
  const row = await db.encryptedCredential.findUnique({ where: { connectionId_kind: { connectionId, kind } } });
  if (!row) return null;
  return { value: open(row, aad(connectionId, kind)), expiresAt: row.expiresAt };
}

export async function hasCredential(connectionId: string, kind: CredentialKind): Promise<boolean> {
  return (await db.encryptedCredential.count({ where: { connectionId, kind } })) > 0;
}

export async function deleteCredentials(connectionId: string): Promise<number> {
  const r = await db.encryptedCredential.deleteMany({ where: { connectionId } });
  return r.count;
}
