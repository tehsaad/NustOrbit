import "server-only";
import { ProviderConfigError, ProviderUnavailableError } from "./errors";

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
  let res: Response;
  try {
    res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000), headers: { Accept: "text/calendar, text/plain;q=0.8" } });
  } catch {
    throw new ProviderUnavailableError(`${url.hostname} did not respond.`);
  }
  if (res.status >= 300 && res.status < 400) throw new ProviderConfigError("The link redirected (it may have expired or require sign-in). Generate a new export link.");
  if (res.status === 401 || res.status === 403 || res.status === 404) throw new ProviderConfigError(`The link was rejected (HTTP ${res.status}). Generate a new export link.`);
  if (!res.ok) throw new ProviderUnavailableError(`${url.hostname} returned HTTP ${res.status}.`);
  const max = opts.maxBytes ?? 5 * 1024 * 1024;
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > max) throw new ProviderConfigError("The calendar is too large.");
  const buf = await res.arrayBuffer();
  if (buf.byteLength > max) throw new ProviderConfigError("The calendar is too large.");
  return new TextDecoder().decode(buf);
}
