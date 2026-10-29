import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/server/db";
import { appUrl, env } from "@/server/env";
import { openFromString, sealToString } from "@/server/crypto/vault";
import { getCredential, putCredential, deleteCredentials } from "../credentials";
import { ProviderAuthError, ProviderConfigError, ProviderUnavailableError } from "../errors";
import { getProvider } from "../registry";
import type { SyncCounts } from "../sync";
import type { IntegrationConnection } from "@/generated/prisma/client";
import { detectSignals } from "@/domain/email-signals";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const STATE_TTL_MS = 10 * 60_000;

export type GoogleProviderId = "gmail" | "google-calendar";

export function googleRedirectUri(): string {
  return `${appUrl()}/api/integrations/google/callback`;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

export function hashState(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

/** Starts an authorization-code + PKCE (S256) flow. State is single-use and stored hashed. */
export async function beginGoogleAuth(userId: string, provider: GoogleProviderId): Promise<string> {
  const e = env();
  if (!e.GOOGLE_CLIENT_ID || !e.GOOGLE_CLIENT_SECRET) throw new ProviderConfigError("Google OAuth is not configured on this deployment.");
  const def = getProvider(provider);
  const scopes = ["openid", "email", ...(def?.scopes?.map((s) => s.scope) ?? [])];
  const state = b64url(randomBytes(32));
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const redirectUri = googleRedirectUri();
  await db.oAuthState.deleteMany({ where: { OR: [{ userId, provider }, { expiresAt: { lt: new Date() } }] } });
  await db.oAuthState.create({
    data: { stateHash: hashState(state), userId, provider, codeVerifierCipher: sealToString(verifier, "pkce"), redirectUri, scopes, expiresAt: new Date(Date.now() + STATE_TTL_MS) },
  });
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: e.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

export type ConsumedState = { userId: string; provider: GoogleProviderId; verifier: string; redirectUri: string; scopes: string[] };

/**
 * Validates and consumes an OAuth state: must exist, be unexpired, belong to the
 * signed-in user, and is deleted atomically so it can't be replayed.
 */
export async function consumeOAuthState(state: string | null, currentUserId: string): Promise<ConsumedState> {
  if (!state || state.length < 20 || state.length > 200) throw new ProviderConfigError("Missing or malformed OAuth state.");
  const stateHash = hashState(state);
  const row = await db.oAuthState.findUnique({ where: { stateHash } });
  if (!row) throw new ProviderConfigError("This sign-in link has already been used or is unknown.");
  await db.oAuthState.delete({ where: { stateHash } }).catch(() => undefined);
  if (row.expiresAt < new Date()) throw new ProviderConfigError("The authorization request expired. Try connecting again.");
  if (row.userId !== currentUserId) throw new ProviderConfigError("The authorization request belongs to a different session.");
  if (row.provider !== "gmail" && row.provider !== "google-calendar") throw new ProviderConfigError("Unknown provider.");
  return { userId: row.userId, provider: row.provider, verifier: openFromString(row.codeVerifierCipher, "pkce"), redirectUri: row.redirectUri, scopes: row.scopes };
}

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string; scope?: string; id_token?: string; token_type: string };

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const e = env();
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: e.GOOGLE_CLIENT_ID ?? "", client_secret: e.GOOGLE_CLIENT_SECRET ?? "", ...params }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new ProviderUnavailableError("Google did not respond.");
  }
  const json = (await res.json().catch(() => ({}))) as TokenResponse & { error?: string };
  if (!res.ok) {
    if (json.error === "invalid_grant" || json.error === "unauthorized_client") throw new ProviderAuthError("Google access was revoked or expired. Reconnect to continue.");
    throw new ProviderUnavailableError(`Google token endpoint error (${json.error ?? res.status}).`);
  }
  return json;
}

function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString("utf8")) as { email?: string };
    return payload.email ?? null;
  } catch {
    return null;
  }
}

/** Exchanges the code, stores tokens encrypted, marks the connection CONNECTED. */
export async function completeGoogleAuth(st: ConsumedState, code: string): Promise<IntegrationConnection> {
  const tokens = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: st.redirectUri, code_verifier: st.verifier });
  const granted = (tokens.scope ?? "").split(" ").filter(Boolean);
  const required = getProvider(st.provider)?.scopes?.map((s) => s.scope) ?? [];
  const missing = required.filter((s) => !granted.includes(s));
  const connection = await db.integrationConnection.upsert({
    where: { userId_provider: { userId: st.userId, provider: st.provider } },
    create: { userId: st.userId, provider: st.provider, status: missing.length ? "ERROR" : "CONNECTED", grantedScopes: granted, accountLabel: emailFromIdToken(tokens.id_token) },
    update: { status: missing.length ? "ERROR" : "CONNECTED", grantedScopes: granted, accountLabel: emailFromIdToken(tokens.id_token), lastError: missing.length ? "Required permission was not granted." : null },
  });
  if (tokens.refresh_token) await putCredential(connection.id, "oauth_refresh", tokens.refresh_token);
  await putCredential(connection.id, "oauth_access", tokens.access_token, new Date(Date.now() + (tokens.expires_in - 60) * 1000));
  return connection;
}

/** Returns a valid access token, refreshing through Google's documented refresh flow when expired. */
export async function googleAccessToken(connection: IntegrationConnection): Promise<string> {
  const cached = await getCredential(connection.id, "oauth_access");
  if (cached && cached.expiresAt && cached.expiresAt > new Date()) return cached.value;
  const refresh = await getCredential(connection.id, "oauth_refresh");
  if (!refresh) throw new ProviderAuthError("No refresh token stored. Reconnect Google.");
  const tokens = await tokenRequest({ grant_type: "refresh_token", refresh_token: refresh.value });
  await putCredential(connection.id, "oauth_access", tokens.access_token, new Date(Date.now() + (tokens.expires_in - 60) * 1000));
  if (tokens.refresh_token) await putCredential(connection.id, "oauth_refresh", tokens.refresh_token);
  return tokens.access_token;
}

/** Best-effort revocation at Google, then local credential deletion. */
export async function revokeGoogle(connection: IntegrationConnection): Promise<void> {
  const refresh = await getCredential(connection.id, "oauth_refresh").catch(() => null);
  if (refresh) {
    await fetch(REVOKE_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: refresh.value }), signal: AbortSignal.timeout(10_000) }).catch(() => undefined);
  }
  await deleteCredentials(connection.id);
}

async function googleGet<T>(connection: IntegrationConnection, url: string): Promise<T> {
  const token = await googleAccessToken(connection);
  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new ProviderUnavailableError("Google did not respond.");
  }
  if (res.status === 401) throw new ProviderAuthError("Google rejected the access token. Reconnect to continue.");
  if (res.status === 403) throw new ProviderAuthError("Google denied access (permission missing or revoked).");
  if (!res.ok) throw new ProviderUnavailableError(`Google API error ${res.status}.`);
  return (await res.json()) as T;
}

async function googleSend<T>(connection: IntegrationConnection, method: "POST" | "PATCH", url: string, body: unknown, etag?: string | null): Promise<T> {
  const token = await googleAccessToken(connection);
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  // If-Match makes Google reject the write (412) if the event changed upstream, so nothing is overwritten silently.
  if (etag) headers["If-Match"] = etag;
  const res = await fetch(url, { method, headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
  if (res.status === 401 || res.status === 403) throw new ProviderAuthError("Google rejected the request. Reconnect to continue.");
  if (res.status === 412) throw new ProviderConfigError("The event changed in Google since Orbit last synced. Sync and try again.");
  if (!res.ok) throw new ProviderUnavailableError(`Google API error ${res.status}.`);
  return (await res.json()) as T;
}

// ── Google Calendar ──────────────────────────────────────

type GEvent = {
  id: string;
  etag: string;
  status: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  extendedProperties?: { private?: Record<string, string> };
};

/** Pulls primary-calendar events in a rolling window; idempotent by Google event id. */
export async function syncGoogleCalendar(connection: IntegrationConnection): Promise<SyncCounts> {
  const timeMin = new Date(Date.now() - 14 * 86400_000).toISOString();
  const timeMax = new Date(Date.now() + 90 * 86400_000).toISOString();
  let pageToken: string | undefined;
  let created = 0;
  let updated = 0;
  const seen = new Set<string>();
  const now = new Date();
  for (let page = 0; page < 10; page++) {
    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.search = new URLSearchParams({ singleEvents: "true", orderBy: "startTime", timeMin, timeMax, maxResults: "250", ...(pageToken ? { pageToken } : {}) }).toString();
    const data = await googleGet<{ items: GEvent[]; nextPageToken?: string }>(connection, url.toString());
    for (const ev of data.items) {
      // Events Orbit pushed are already represented by their Orbit row.
      if (ev.extendedProperties?.private?.orbitEventId) {
        await db.calendarEvent.updateMany({ where: { id: ev.extendedProperties.private.orbitEventId, userId: connection.userId }, data: { etag: ev.etag, syncStatus: "SYNCED", syncedAt: now } });
        continue;
      }
      seen.add(ev.id);
      if (ev.status === "cancelled") {
        await db.calendarEvent.deleteMany({ where: { userId: connection.userId, source: "GOOGLE_CALENDAR", externalId: ev.id } });
        continue;
      }
      const allDay = Boolean(ev.start.date);
      const startsAt = new Date(ev.start.dateTime ?? `${ev.start.date}T00:00:00Z`);
      const endsAt = new Date(ev.end.dateTime ?? `${ev.end.date}T00:00:00Z`);
      const fields = {
        title: ev.summary ?? "(No title)",
        description: ev.description?.slice(0, 5000) ?? null,
        location: ev.location ?? null,
        url: ev.htmlLink ?? null,
        startsAt,
        endsAt,
        allDay,
        etag: ev.etag,
        readOnly: true,
        syncStatus: "SYNCED" as const,
        syncedAt: now,
        externalCalendarId: "primary",
      };
      const existing = await db.calendarEvent.findUnique({ where: { userId_source_externalId: { userId: connection.userId, source: "GOOGLE_CALENDAR", externalId: ev.id } }, select: { etag: true } });
      if (existing?.etag === ev.etag) continue;
      await db.calendarEvent.upsert({
        where: { userId_source_externalId: { userId: connection.userId, source: "GOOGLE_CALENDAR", externalId: ev.id } },
        create: { userId: connection.userId, source: "GOOGLE_CALENDAR", externalId: ev.id, kind: "OTHER", ...fields },
        update: fields,
      });
      if (existing) updated++;
      else created++;
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  // Remove Google events in the window that no longer exist upstream.
  await db.calendarEvent.deleteMany({
    where: { userId: connection.userId, source: "GOOGLE_CALENDAR", startsAt: { gte: new Date(timeMin), lte: new Date(timeMax) }, externalId: { notIn: [...seen] } },
  });
  return { created, updated };
}

/**
 * Pushes an Orbit-owned event to Google Calendar. Called only after explicit
 * user confirmation. Idempotent: an already-pushed event is updated with
 * If-Match on its stored etag instead of creating a duplicate.
 */
export async function pushEventToGoogle(connection: IntegrationConnection, eventId: string): Promise<void> {
  const ev = await db.calendarEvent.findFirst({ where: { id: eventId, userId: connection.userId, source: "ORBIT" } });
  if (!ev) throw new ProviderConfigError("Only events created in Orbit can be pushed to Google.");
  const body = {
    summary: ev.title,
    description: ev.description ?? undefined,
    location: ev.location ?? undefined,
    start: ev.allDay ? { date: ev.startsAt.toISOString().slice(0, 10) } : { dateTime: ev.startsAt.toISOString() },
    end: ev.allDay ? { date: ev.endsAt.toISOString().slice(0, 10) } : { dateTime: ev.endsAt.toISOString() },
    extendedProperties: { private: { orbitEventId: ev.id } },
  };
  const base = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
  const result = ev.externalId
    ? await googleSend<GEvent>(connection, "PATCH", `${base}/${encodeURIComponent(ev.externalId)}`, body, ev.etag)
    : await googleSend<GEvent>(connection, "POST", base, body);
  await db.calendarEvent.update({ where: { id: ev.id }, data: { externalId: result.id, externalCalendarId: "primary", etag: result.etag, syncStatus: "SYNCED", syncedAt: new Date() } });
}

// ── Gmail ────────────────────────────────────────────────

export type InboxSummary = {
  unread: number;
  messages: { id: string; threadId: string; from: string; subject: string; snippet: string; date: string; signals: ReturnType<typeof detectSignals> }[];
};

/** Live read of recent unread mail (metadata + snippet only). Content is treated as untrusted text. */
export async function readInboxSummary(connection: IntegrationConnection, query = "is:unread newer_than:14d"): Promise<InboxSummary> {
  const label = await googleGet<{ messagesUnread: number }>(connection, "https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX");
  const list = await googleGet<{ messages?: { id: string; threadId: string }[] }>(
    connection,
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=15&q=${encodeURIComponent(query)}`,
  );
  const messages: InboxSummary["messages"] = [];
  for (const m of list.messages ?? []) {
    const msg = await googleGet<{ id: string; threadId: string; snippet: string; payload: { headers: { name: string; value: string }[] } }>(
      connection,
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
    );
    const h = (n: string) => msg.payload.headers.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value ?? "";
    const from = h("From");
    const subject = h("Subject");
    messages.push({ id: msg.id, threadId: msg.threadId, from, subject, snippet: msg.snippet, date: h("Date"), signals: detectSignals({ from, subject, snippet: msg.snippet }) });
  }
  return { unread: label.messagesUnread, messages };
}

export async function syncGmail(connection: IntegrationConnection): Promise<SyncCounts> {
  // Gmail is read live; a sync only verifies the grant still works and records freshness.
  await googleGet(connection, "https://gmail.googleapis.com/gmail/v1/users/me/profile");
  return { created: 0, updated: 0 };
}
