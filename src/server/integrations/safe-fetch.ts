import "server-only";
import https from "node:https";
import { constants } from "node:crypto";
import { ProviderConfigError, ProviderUnavailableError } from "./errors";

export const LEGACY_TLS_MESSAGE =
  "The LMS server uses outdated TLS (no secure renegotiation, RFC 5746), which Node.js refuses by default. Upload an exported .ics file instead, or set LMS_LEGACY_TLS=1 to allow legacy renegotiation for the LMS host only (see docs/integration-assessment.md).";

/** Opt-in, host-scoped legacy TLS renegotiation for the NUST LMS (see docs). */
export function legacyTlsAllowed(): boolean {
  return process.env.LMS_LEGACY_TLS === "1";
}

function isLegacyRenegotiationError(e: unknown): boolean {
  const code = (e as { cause?: { code?: string }; code?: string })?.cause?.code ?? (e as { code?: string })?.code;
  const msg = String((e as { cause?: { message?: string } })?.cause?.message ?? (e as Error)?.message ?? "");
  return code === "ERR_SSL_UNSAFE_LEGACY_RENEGOTIATION_DISABLED" || /unsafe legacy renegotiation/i.test(msg);
}

let legacyAgent: https.Agent | undefined;

/** Minimal https request with SSL_OP_LEGACY_SERVER_CONNECT. Only used for allowlisted LMS hosts when opted in. */
export function legacyTlsRequest(url: URL, init: { method?: string; body?: string; headers?: Record<string, string>; timeoutMs?: number; maxBytes?: number }): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; text: string }> {
  // keep-alive reuses one TLS connection across the many sequential web-service
  // calls, which matters a lot on this slow legacy-TLS host (each new socket is a
  // full handshake).
  legacyAgent ??= new https.Agent({ secureOptions: constants.SSL_OP_LEGACY_SERVER_CONNECT, keepAlive: true, maxSockets: 8 });
  const max = init.maxBytes ?? 5 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: init.method ?? "GET", agent: legacyAgent, headers: init.headers, timeout: init.timeoutMs ?? 15_000 }, (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (c: Buffer) => {
        size += c.length;
        if (size > max) {
          req.destroy();
          reject(new ProviderConfigError("The response is too large."));
        } else chunks.push(c);
      });
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, text: Buffer.concat(chunks).toString("utf8") }));
    });
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    if (init.body) req.write(init.body);
    req.end();
  });
}

/**
 * Fetch a user-supplied URL with SSRF protections: https only, host allowlist,
 * no redirects to other hosts, timeout and response size cap.
 */
export async function fetchAllowedText(rawUrl: string, allowedHosts: string[], opts: { timeoutMs?: number; maxBytes?: number } = {}): Promise<string> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new ProviderConfigError("That is not a valid URL.");
  }
  if (url.protocol !== "https:") throw new ProviderConfigError("Only https:// links are accepted.");
  if (!allowedHosts.includes(url.hostname.toLowerCase())) {
    throw new ProviderConfigError(`Links must point to ${allowedHosts.join(" or ")}.`);
  }
  const max = opts.maxBytes ?? 5 * 1024 * 1024;
  let status: number;
  let text: string;
  let contentLength = 0;
  try {
    if (legacyTlsAllowed()) {
      const r = await legacyTlsRequest(url, { headers: { Accept: "text/calendar, text/plain;q=0.8" }, timeoutMs: opts.timeoutMs, maxBytes: max });
      status = r.status;
      text = r.text;
    } else {
      const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000), headers: { Accept: "text/calendar, text/plain;q=0.8" } });
      status = res.status;
      contentLength = Number(res.headers.get("content-length") ?? 0);
      if (contentLength > max) throw new ProviderConfigError("The calendar is too large.");
      const buf = await res.arrayBuffer();
      if (buf.byteLength > max) throw new ProviderConfigError("The calendar is too large.");
      text = new TextDecoder().decode(buf);
    }
  } catch (e) {
    if (e instanceof ProviderConfigError) throw e;
    if (isLegacyRenegotiationError(e)) throw new ProviderConfigError(LEGACY_TLS_MESSAGE);
    throw new ProviderUnavailableError(`${url.hostname} did not respond.`);
  }
  if (status >= 300 && status < 400) throw new ProviderConfigError("The link redirected (it may have expired or require sign-in). Generate a new export link.");
  if (status === 401 || status === 403 || status === 404) throw new ProviderConfigError(`The link was rejected (HTTP ${status}). Generate a new export link.`);
  if (status < 200 || status >= 300) throw new ProviderUnavailableError(`${url.hostname} returned HTTP ${status}.`);
  return text;
}
