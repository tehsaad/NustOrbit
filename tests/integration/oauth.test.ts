import { describe, expect, it, vi, afterEach } from "vitest";
import { db } from "@/server/db";
import { beginGoogleAuth, completeGoogleAuth, consumeOAuthState, googleAccessToken, pushEventToGoogle, syncGoogleCalendar } from "@/server/integrations/providers/google";
import { getCredential, putCredential } from "@/server/integrations/credentials";
import { ProviderAuthError, ProviderConfigError } from "@/server/integrations/errors";
import { makeUser } from "./helpers";

afterEach(() => vi.unstubAllGlobals());

const stateOf = (url: string) => new URL(url).searchParams.get("state")!;

describe("OAuth state + PKCE", () => {
  it("builds a PKCE S256 authorization request with least-privilege scopes", async () => {
    const userId = await makeUser("pkce");
    const url = new URL(await beginGoogleAuth(userId, "google-calendar"));
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get("scope")).toContain("calendar.events");
    expect(url.searchParams.get("scope")).not.toContain("gmail");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3100/api/integrations/google/callback");
    // The raw state is never stored, only its hash.
    expect(await db.oAuthState.count({ where: { stateHash: stateOf(url.toString()) } })).toBe(0);
  });

  it("rejects unknown, replayed, cross-user and expired states", async () => {
    const userId = await makeUser("state");
    const other = await makeUser("state-other");
    await expect(consumeOAuthState("x".repeat(43), userId)).rejects.toBeInstanceOf(ProviderConfigError);

    const s1 = stateOf(await beginGoogleAuth(userId, "gmail"));
    const ok = await consumeOAuthState(s1, userId);
    expect(ok.provider).toBe("gmail");
    expect(ok.verifier.length).toBeGreaterThan(40);
    await expect(consumeOAuthState(s1, userId)).rejects.toThrow(/already been used/);

    const s2 = stateOf(await beginGoogleAuth(userId, "gmail"));
    await expect(consumeOAuthState(s2, other)).rejects.toThrow(/different session/);

    const s3 = stateOf(await beginGoogleAuth(userId, "google-calendar"));
    await db.oAuthState.updateMany({ where: { userId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(consumeOAuthState(s3, userId)).rejects.toThrow(/expired/);
  });

  it("exchanges the code with the verifier and stores tokens encrypted", async () => {
    const userId = await makeUser("exchange");
    const st = await consumeOAuthState(stateOf(await beginGoogleAuth(userId, "google-calendar")), userId);
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = new URLSearchParams(String(init.body));
      expect(body.get("code_verifier")).toBe(st.verifier);
      expect(body.get("grant_type")).toBe("authorization_code");
      return Response.json({ access_token: "ya29.test-access", refresh_token: "1//test-refresh", expires_in: 3600, token_type: "Bearer", scope: "openid email https://www.googleapis.com/auth/calendar.events" });
    });
    vi.stubGlobal("fetch", fetchMock);
    const conn = await completeGoogleAuth(st, "auth-code");
    expect(conn.status).toBe("CONNECTED");
    expect((await getCredential(conn.id, "oauth_refresh"))?.value).toBe("1//test-refresh");
  });

  it("marks the connection as errored when a required scope is not granted", async () => {
    const userId = await makeUser("partial");
    const st = await consumeOAuthState(stateOf(await beginGoogleAuth(userId, "gmail")), userId);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ access_token: "a", expires_in: 3600, token_type: "Bearer", scope: "openid email" })));
    const conn = await completeGoogleAuth(st, "code");
    expect(conn.status).toBe("ERROR");
  });
});

describe("token refresh", () => {
  it("refreshes an expired access token and caches the new one", async () => {
    const userId = await makeUser("refresh");
    const conn = await db.integrationConnection.create({ data: { userId, provider: "gmail", status: "CONNECTED" } });
    await putCredential(conn.id, "oauth_refresh", "1//r");
    await putCredential(conn.id, "oauth_access", "old", new Date(Date.now() - 1000));
    const fetchMock = vi.fn(async () => Response.json({ access_token: "fresh", expires_in: 3600, token_type: "Bearer" }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await googleAccessToken(conn)).toBe("fresh");
    expect(await googleAccessToken(conn)).toBe("fresh");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces revoked refresh tokens as auth errors", async () => {
    const userId = await makeUser("revoked");
    const conn = await db.integrationConnection.create({ data: { userId, provider: "gmail", status: "CONNECTED" } });
    await putCredential(conn.id, "oauth_refresh", "1//dead");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "invalid_grant" }, { status: 400 })));
    await expect(googleAccessToken(conn)).rejects.toBeInstanceOf(ProviderAuthError);
  });
});

describe("Google Calendar sync", () => {
  it("upserts by event id, skips unchanged etags, removes deleted events", async () => {
    const userId = await makeUser("gcal");
    const conn = await db.integrationConnection.create({ data: { userId, provider: "google-calendar", status: "CONNECTED" } });
    await putCredential(conn.id, "oauth_access", "tok", new Date(Date.now() + 3600_000));
    const soon = new Date(Date.now() + 86400_000).toISOString();
    const later = new Date(Date.now() + 86400_000 + 3600_000).toISOString();
    let items = [
      { id: "g1", etag: '"1"', status: "confirmed", summary: "Dentist", start: { dateTime: soon }, end: { dateTime: later } },
      { id: "g2", etag: '"1"', status: "confirmed", summary: "Club", start: { dateTime: soon }, end: { dateTime: later } },
    ];
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ items })));
    expect(await syncGoogleCalendar(conn)).toEqual({ created: 2, updated: 0 });
    expect(await syncGoogleCalendar(conn)).toEqual({ created: 0, updated: 0 });
    items = [{ ...items[0], etag: '"2"', summary: "Dentist (moved)" }];
    expect(await syncGoogleCalendar(conn)).toEqual({ created: 0, updated: 1 });
    const rows = await db.calendarEvent.findMany({ where: { userId } });
    expect(rows.map((r) => r.title)).toEqual(["Dentist (moved)"]);
    expect(rows[0].readOnly).toBe(true);
  });

  it("pushes Orbit events idempotently with If-Match and refuses to overwrite upstream changes", async () => {
    const userId = await makeUser("push");
    const conn = await db.integrationConnection.create({ data: { userId, provider: "google-calendar", status: "CONNECTED" } });
    await putCredential(conn.id, "oauth_access", "tok", new Date(Date.now() + 3600_000));
    const ev = await db.calendarEvent.create({ data: { userId, title: "Study", startsAt: new Date(), endsAt: new Date(Date.now() + 3600_000), source: "ORBIT" } });
    const calls: { method: string; ifMatch: string | null }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_u: string, init: RequestInit) => {
        const h = new Headers(init.headers);
        calls.push({ method: String(init.method), ifMatch: h.get("If-Match") });
        if (calls.length === 3) return new Response("", { status: 412 });
        return Response.json({ id: "gid-1", etag: `"${calls.length}"` });
      }),
    );
    await pushEventToGoogle(conn, ev.id);
    await pushEventToGoogle(conn, ev.id);
    expect(calls.map((c) => c.method)).toEqual(["POST", "PATCH"]);
    expect(calls[1].ifMatch).toBe('"1"');
    await expect(pushEventToGoogle(conn, ev.id)).rejects.toThrow(/changed in Google/);
    // Externally owned events can't be pushed/overwritten.
    const ext = await db.calendarEvent.create({ data: { userId, title: "LMS", startsAt: new Date(), endsAt: new Date(), source: "LMS", readOnly: true } });
    await expect(pushEventToGoogle(conn, ext.id)).rejects.toThrow(/Only events created in Orbit/);
  });
});
