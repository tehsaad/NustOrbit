# Security

## Accounts and sign-in

- **Library**: Better Auth with the Prisma adapter. Orbit doesn't implement its own session protocol.
- **Registration disabled** (`emailAndPassword.disableSignUp`). The only way to create an account is `/setup`, which requires the server-side `SETUP_TOKEN`, works only while the database has zero users, and runs in a `Serializable` transaction so two concurrent attempts can't both succeed. Remove `SETUP_TOKEN` from the environment after setup.
- **Password hashing**: Argon2id via `@node-rs/argon2` (19 MiB memory, t=2, p=1; OWASP minimums), plugged into Better Auth's `password.hash/verify`. Minimum length is 12.
- **Generic errors**: sign-in always returns "Incorrect email or password".
- **Rate limiting** (stored in Postgres, so it holds across serverless instances): 5 sign-in attempts per IP per 15 min, 5 TOTP or backup-code attempts per 15 min, 3 reset requests per hour, and 60 requests/min elsewhere on the auth API. Verified in production: the 6th attempt returns HTTP 429.
- **MFA**: optional TOTP with backup codes (Better Auth `twoFactor`), managed at Settings → Security.
- **Password change** revokes all other sessions. **Password reset** (needs email configured) uses 30-minute single-use tokens and revokes all sessions.

## Sessions

- Opaque session tokens stored in the `session` table; every request is validated against the database (cookie cache disabled), so revocation is immediate.
- Cookies: `HttpOnly`, `Secure` in production (`__Secure-` prefix), `SameSite=Lax`.
- **Idle expiry**: `SESSION_IDLE_DAYS` (default 14), rolling, refreshed at most daily.
- **Absolute expiry**: `SESSION_ABSOLUTE_DAYS` (default 60) since sign-in, enforced in `getCurrentSession()`, which deletes the session when exceeded. It runs on every page, server action and Orbit API route. Better Auth's own `/api/auth/*` endpoints don't run that check, so an over-cap session could still call e.g. change-password until the next page load deletes it.
- **Rotation**: every sign-in creates a new session token. Pre-auth tokens are never upgraded, which prevents fixation. Password changes rotate and revoke the others.
- **Revocation UI**: Settings → Security lists active sessions (device, IP, created, last active). You can revoke one or all others. Session tokens never reach the browser in that list.
- "Keep me signed in" off gives a browser-session cookie.

## CSRF and request integrity

- Better Auth rejects cross-origin POSTs (verified in production: `INVALID_ORIGIN`, HTTP 403).
- Next.js server actions enforce same-origin. The push-subscription route checks `Origin`.
- OAuth uses a 256-bit `state` (stored hashed, single use, 10-minute TTL, bound to the signed-in user) plus PKCE S256.

## Authorization and data isolation

- `proxy.ts` only does an optimistic redirect. Real checks run server-side: every page, server action and route handler calls `requireUser()`.
- Every query filters by `userId`. Mutations use `updateMany`/`deleteMany` with `{ id, userId }`, so a guessed id belonging to someone else is a no-op. Linked ids (course, assignment, event) are ownership-checked before linking.
- Externally owned records (LMS, Google) are read-only. Provider attendance can't be edited or deleted from the UI.
- Covered by tests: `tests/integration/sync.test.ts` (isolation) and `tests/e2e/app.spec.ts` ("another user's data is not reachable").

## Integration credentials (vault)

- AES-256-GCM with a random 96-bit IV per value and AAD bound to `connectionId:kind`, so ciphertext can't be swapped between rows.
- Key: `ORBIT_VAULT_KEY` (32 random bytes, base64), with a version stored per row.
- **Rotation**: set `ORBIT_VAULT_KEY_PREVIOUS` to the old key, `ORBIT_VAULT_KEY` to the new one, and bump `ORBIT_VAULT_KEY_VERSION`. Rows decrypt with either key and re-encrypt with the new key on the next write (token refresh, reconnect).
- Stored kinds: Google refresh/access tokens, the LMS calendar URL (it contains an auth token), the LMS web-service token.
- Never stored client-side and never logged. Disconnect deletes them; for Google, Orbit also calls Google's revoke endpoint.
- University passwords are never requested or stored.

## Logging and audit

- `src/server/log.ts` emits JSON and redacts keys matching token, secret, password, cookie, authorization… and token-shaped values (Google tokens, `Bearer`, `authtoken=`, `wstoken=`, `code=`).
- `AuditEvent` records sign-ins, setup, session revocations, integration connect/disconnect/re-auth and data exports. It is visible at Settings → Security.
- `/api/health` returns only `status`, `database` and `time`.

## Untrusted content

- Email subjects and snippets are rendered as plain text. Detection uses keyword patterns only and never executes or follows instructions in email. Detected items are suggestions.
- Notes render Markdown through `react-markdown` without raw HTML.

## HTTP hardening

HSTS (2 years, preload), `X-Frame-Options: DENY`, `nosniff`, strict referrer policy, a restrictive `Permissions-Policy`, COOP, `poweredByHeader` off, and `robots: noindex`.

## Recovery: locked out without email configured

With database access (Neon console or `psql "$DATABASE_URL_UNPOOLED"`):

```sql
-- 1) Revoke all sessions
DELETE FROM "session";
-- 2) Remove 2FA if the authenticator is lost
UPDATE "user" SET "twoFactorEnabled" = false; DELETE FROM "twoFactor";
```

To reset the password, generate an Argon2id hash locally:

```bash
node -e "require('@node-rs/argon2').hash(process.argv[1],{algorithm:2,memoryCost:19456,timeCost:2,parallelism:1}).then(console.log)" 'new-long-password'
```

```sql
UPDATE "account" SET password = '<hash>' WHERE "providerId" = 'credential';
```

Configure `RESEND_API_KEY` + `EMAIL_FROM` to use the normal reset flow instead.

## Reporting

This is a personal project. Report issues privately to the repository owner.
