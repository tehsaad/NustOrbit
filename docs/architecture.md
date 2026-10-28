# Architecture

Orbit is a **modular monolith**: one Next.js 16 application deployed to Vercel (Node.js runtime / Fluid Compute) backed by one PostgreSQL database. There are no microservices and no always-on workers.

```
Browser ──► proxy.ts (optimistic cookie check)
        ──► App Router pages (server components, per-request) ──► server/queries ──► Prisma ──► Postgres
        ──► Server actions (server/actions/*, zod-validated) ───┘
        ──► Route handlers (api/*): auth, OAuth callback, cron, export, push, health
Vercel Cron (daily) / GitHub Actions (10 min) ──► /api/cron/{sync,reminders} (Bearer CRON_SECRET)
```

## Layers

| Layer | Location | Notes |
| --- | --- | --- |
| Presentation | `src/app`, `src/components` | Server components render data; small client components for forms, calendar DnD, editor, clock. shadcn/ui primitives in `components/ui`. |
| Domain (pure) | `src/domain` | Grades, attendance, timetable recurrence/conflicts, deadlines, reminders recurrence, timezone math, ICS, CSV, email signals, freshness. No I/O; fully unit tested. |
| Application services | `src/server/actions`, `src/server/queries`, `src/server/prefs.ts` | Every function calls `requireUser()` and scopes every query by `userId`. Writes use `updateMany/deleteMany({ where: { id, userId } })` so foreign ids can't be touched. |
| AuthN / AuthZ | `src/server/auth` | Better Auth (DB sessions, Argon2id hasher, rate limits in DB, TOTP), token-gated setup, absolute session cap. |
| Integration adapters | `src/server/integrations` | Registry, encrypted credential store, SSRF-safe fetch, `runSync` engine, providers: `lms` (Moodle calendar feed / web-service), `qalam` (CSV import), `google` (OAuth+PKCE, Calendar, Gmail). |
| Sync & scheduling | `src/server/integrations/sync.ts`, `src/app/api/cron/*` | Lease lock per connection, timeout, SyncRun records, auth failures pause sync (NEEDS_REAUTH). |
| Persistence | `prisma/schema.prisma`, `src/server/db.ts` | Prisma 7 + `@prisma/adapter-pg`. Migrations in `prisma/migrations`, applied on production builds only. |
| Notifications | `src/server/notify` | Web Push (VAPID), Resend email, in-app; idempotent `NotificationDelivery` rows with bounded retries. |
| Observability & audit | `src/server/log.ts`, `src/server/audit.ts` | JSON logs with secret redaction; `AuditEvent` for security-relevant actions, shown on the Security page. |

## Data model highlights

- **Provenance on every record**: `source` (`MANUAL`, `ORBIT`, `LMS`, `QALAM`, `IMPORT`, `GOOGLE_CALENDAR`, `GMAIL`, …) + `externalId`, with `@@unique([userId, source, externalId])` so syncs upsert instead of duplicating.
- **University vs personal status**: `Assignment.universityStatus` (only set by a provider) and `Assignment.personalStatus` (yours).
- **Suggested items**: `suggested = true` for heuristically detected deadlines/exams until confirmed.
- **Read-only external events**: `CalendarEvent.readOnly` for LMS/Google events; only `source = ORBIT` events can be moved, edited or pushed.
- **Timetable**: `TimetableEntry` (weekly wall-clock slot + IANA timezone) expanded on demand; `ClassSession` stores cancellations, holidays and make-up sessions.
- **Credentials**: `EncryptedCredential` (AES-256-GCM, per-row IV, AAD bound to connection+kind, key version) — never selected into client payloads.
- **OAuth**: `OAuthState` stores only a SHA-256 of the state and the encrypted PKCE verifier; single use, 10-minute TTL, bound to the user.

## Timezones

All instants are stored in UTC. Wall-clock concepts (class times, "today", "this week", reminder recurrence) are computed in the user's IANA timezone (default `Asia/Karachi`, configurable in Settings) with `@date-fns/tz`, so DST zones keep wall-clock times stable.

## Rendering model

Cache Components are disabled deliberately: every page is private and per-user, rendered at request time after server-side session validation. No private data is cached at the CDN.
