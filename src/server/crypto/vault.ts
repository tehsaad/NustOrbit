import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM envelope for integration secrets (refresh tokens, API tokens,
 * private calendar feed URLs). Keys come from ORBIT_VAULT_KEY (base64, 32 bytes).
 * ORBIT_VAULT_KEY_PREVIOUS allows decrypting rows written before a key rotation.
 */
export type Sealed = { ciphertext: string; iv: string; authTag: string; keyVersion: number };

function currentVersion(): number {
  return Number(process.env.ORBIT_VAULT_KEY_VERSION ?? 1);
}

function decodeKey(raw: string | undefined, name: string): Buffer {
  if (!raw) throw new Error(`${name} is not configured`);
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error(`${name} must be 32 bytes, base64-encoded`);
  return key;
}

/**
 * ORBIT_VAULT_KEY is key version ORBIT_VAULT_KEY_VERSION (default 1).
 * ORBIT_VAULT_KEY_PREVIOUS, when set, is the version before it.
 */
function keyFor(version: number): Buffer {
  const current = currentVersion();
  if (version === current) return decodeKey(process.env.ORBIT_VAULT_KEY, "ORBIT_VAULT_KEY");
  if (version === current - 1 && process.env.ORBIT_VAULT_KEY_PREVIOUS) {
    return decodeKey(process.env.ORBIT_VAULT_KEY_PREVIOUS, "ORBIT_VAULT_KEY_PREVIOUS");
  }
  throw new Error(`No vault key available for key version ${version}`);
}

export function seal(plaintext: string, aad = "orbit"): Sealed {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(currentVersion()), iv);
  cipher.setAAD(Buffer.from(aad));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion: currentVersion(),
  };
}

export function open(sealed: Sealed, aad = "orbit"): string {
  const decipher = createDecipheriv("aes-256-gcm", keyFor(sealed.keyVersion), Buffer.from(sealed.iv, "base64"));
  decipher.setAAD(Buffer.from(aad));
  decipher.setAuthTag(Buffer.from(sealed.authTag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, "base64")), decipher.final()]).toString("utf8");
}

/** Compact single-string form for short-lived values (e.g. PKCE verifiers). */
export function sealToString(plaintext: string, aad?: string): string {
  const s = seal(plaintext, aad);
  return [s.keyVersion, s.iv, s.authTag, s.ciphertext].join(".");
}

export function openFromString(value: string, aad?: string): string {
  const [v, iv, authTag, ciphertext] = value.split(".");
  return open({ keyVersion: Number(v), iv, authTag, ciphertext }, aad);
}
