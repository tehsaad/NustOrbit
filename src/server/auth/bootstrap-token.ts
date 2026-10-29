import { createHash, randomBytes } from "node:crypto";

/**
 * First-account bootstrap invites. Shared by the CLI (scripts/admin-invite.mts)
 * and the /claim server action. Only the SHA-256 of the token is stored.
 */
export const INVITE_PREFIX = "orbit-bootstrap:";
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function newInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The token travels in the URL fragment, which browsers never send to the server. */
export function inviteLink(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/$/, "")}/claim#${token}`;
}
