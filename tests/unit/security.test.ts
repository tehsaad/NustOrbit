import { describe, expect, it, beforeAll } from "vitest";
import { randomBytes } from "node:crypto";

beforeAll(() => {
  process.env.ORBIT_VAULT_KEY = randomBytes(32).toString("base64");
  delete process.env.ORBIT_VAULT_KEY_VERSION;
});

describe("vault", () => {
  it("encrypts with random IVs and decrypts", async () => {
    const { seal, open } = await import("@/server/crypto/vault");
    const a = seal("refresh-token-value");
    const b = seal("refresh-token-value");
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.ciphertext).not.toContain("refresh");
    expect(open(a)).toBe("refresh-token-value");
  });
  it("rejects tampered ciphertext and wrong AAD", async () => {
    const { seal, open } = await import("@/server/crypto/vault");
    const s = seal("secret", "conn-1");
    const tampered = { ...s, ciphertext: Buffer.from("x" + s.ciphertext).toString("base64") };
    expect(() => open(tampered, "conn-1")).toThrow();
    expect(() => open(s, "conn-2")).toThrow();
  });
  it("supports key rotation via previous key", async () => {
    const { seal, open } = await import("@/server/crypto/vault");
    const old = seal("legacy");
    process.env.ORBIT_VAULT_KEY_PREVIOUS = process.env.ORBIT_VAULT_KEY;
    process.env.ORBIT_VAULT_KEY = randomBytes(32).toString("base64");
    process.env.ORBIT_VAULT_KEY_VERSION = "2";
    expect(open(old)).toBe("legacy");
    expect(seal("new").keyVersion).toBe(2);
    delete process.env.ORBIT_VAULT_KEY_PREVIOUS;
    expect(() => open(old)).toThrow(/No vault key/);
    delete process.env.ORBIT_VAULT_KEY_VERSION;
  });
  it("round-trips the compact string form", async () => {
    const { sealToString, openFromString } = await import("@/server/crypto/vault");
    expect(openFromString(sealToString("verifier", "pkce"), "pkce")).toBe("verifier");
  });
});

describe("password hashing", () => {
  it("uses argon2id and verifies", async () => {
    const { hashPassword, verifyPassword } = await import("@/server/crypto/password");
    const h = await hashPassword("correct horse battery staple");
    expect(h.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword({ hash: h, password: "correct horse battery staple" })).toBe(true);
    expect(await verifyPassword({ hash: h, password: "wrong" })).toBe(false);
    expect(await verifyPassword({ hash: "not-a-hash", password: "x" })).toBe(false);
  });
});

describe("log redaction", () => {
  it("redacts secret keys and token-looking values", async () => {
    const { redact } = await import("@/server/log");
    const out = redact({
      refresh_token: "1//abc",
      nested: { Authorization: "Bearer abc.def" },
      url: "https://lms.example.edu/calendar/export_execute.php?userid=1&authtoken=deadbeef&preset=all",
      msg: "got ya29.a0AfH6SMBxyz from google",
    }) as Record<string, unknown>;
    expect(out.refresh_token).toBe("[REDACTED]");
    expect((out.nested as Record<string, unknown>).Authorization).toBe("[REDACTED]");
    expect(out.url).toContain("authtoken=[REDACTED]");
    expect(out.url).not.toContain("deadbeef");
    expect(out.msg).not.toContain("ya29.a0");
  });
});
