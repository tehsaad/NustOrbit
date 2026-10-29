import "server-only";
import { emailConfigured, env } from "./env";
import { log } from "./log";

/** Sends a transactional email through Resend's HTTP API when configured. */
export async function sendEmail(input: { to: string; subject: string; text: string; html?: string }): Promise<boolean> {
  if (!emailConfigured()) {
    log.warn("email.not_configured", { subject: input.subject });
    return false;
  }
  const e = env();
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${e.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: e.EMAIL_FROM, to: [input.to], subject: input.subject, text: input.text, html: input.html }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    log.error("email.send_failed", { status: res.status });
    return false;
  }
  return true;
}
