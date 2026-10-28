/**
 * Minimal structured logger that redacts secrets. Use this instead of console
 * for anything that might contain provider responses or request data.
 */
const SECRET_KEYS = /(token|secret|password|authorization|cookie|code_verifier|refresh|access|api[_-]?key|ciphertext|p256dh|auth$)/i;
const SECRET_VALUES = [
  /ya29\.[\w.-]+/g, // Google access tokens
  /1\/\/[\w.-]{20,}/g, // Google refresh tokens
  /Bearer\s+[\w.~+/=-]+/gi,
  /([?&](?:token|key|authtoken|wstoken|code)=)[^&\s]+/gi,
];

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth]";
  if (typeof value === "string") {
    let out = value;
    for (const re of SECRET_VALUES) out = out.replace(re, (_m, p1) => (typeof p1 === "string" ? `${p1}[REDACTED]` : "[REDACTED]"));
    return out;
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: redact(value.message, depth + 1) };
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = SECRET_KEYS.test(k) ? "[REDACTED]" : redact(v, depth + 1);
    return out;
  }
  return value;
}

type Level = "info" | "warn" | "error";

function write(level: Level, msg: string, meta?: Record<string, unknown>) {
  const line = JSON.stringify({ level, msg, ...(meta ? (redact(meta) as object) : {}), t: new Date().toISOString() });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (msg: string, meta?: Record<string, unknown>) => write("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => write("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => write("error", msg, meta),
};
